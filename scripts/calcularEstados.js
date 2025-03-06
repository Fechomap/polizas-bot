// scripts/calcularEstados.js
const XLSX = require('xlsx');
const path = require('path');

// Ruta del archivo Excel de entrada
const inputFilePath = path.join(__dirname, 'backup', 'polizas.xlsx');
// Ruta del archivo Excel de salida
const outputFilePath = path.join(__dirname, 'backup', 'polizas_con_estados.xlsx');

// Función para agregar meses a una fecha (preservando el día en la medida de lo posible)
const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

// Función para calcular la diferencia en días (redondeado)
const diffDays = (fechaObjetivo, ahora) => {
  return Math.ceil((fechaObjetivo - ahora) / (1000 * 60 * 60 * 24));
};

// Función para contar pagos (se cuentan las columnas PAGO1_FECHA a PAGO12_FECHA)
const contarPagos = (row) => {
  let count = 0;
  for (let i = 1; i <= 12; i++) {
    if (row[`PAGO${i}_FECHA`]) count++;
  }
  return count;
};

// Función para contar servicios (basada en las columnas relacionadas)
const contarServicios = (row) => {
  let count = 0;

  // Iterar sobre los 12 posibles servicios
  for (let i = 1; i <= 12; i++) {
    const costo = row[`SERVICIO${i}_COSTO`];
    const fecha = row[`SERVICIO${i}_FECHA`];
    const expediente = row[`SERVICIO${i}_EXPEDIENTE`];
    const origenDestino = row[`SERVICIO${i}_ORIGEN_DESTINO`];

    // Si al menos uno de los campos relacionados con el servicio tiene un valor, se cuenta como un servicio
    if (costo || fecha || expediente || origenDestino) {
      count++;
    }
  }

  return count;
};

// Función para convertir fecha (asume formato ISO o DD/MM/YY[YY])
const convertirFecha = (fecha) => {
  if (!fecha) return null;
  // Si es cadena ISO
  if (typeof fecha === 'string' && fecha.includes('-')) {
    const d = new Date(fecha);
    return isNaN(d) ? null : d;
  }
  // Si es cadena en formato DD/MM/YY o DD/MM/YYYY
  if (typeof fecha === 'string' && fecha.includes('/')) {
    const partes = fecha.split('/');
    if (partes.length === 3) {
      const [dia, mes, anio] = partes;
      const anioCompleto = anio.length === 2 ? `20${anio}` : anio;
      const fechaFormateada = `${anioCompleto}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
      const d = new Date(fechaFormateada);
      return isNaN(d) ? null : d;
    }
  }
  return null;
};

// Función principal para calcular las columnas U a Y
// Recibe la fecha de emisión y el número de pagos, y utiliza la fecha actual (ahora)
const calcularCampos = (fechaEmision, numPagos, ahora) => {
  let fechaFinCobertura, fechaFinGracia, diasCobertura, diasGracia, estado;

  if (numPagos === 0) {
    // Sin pagos: cobertura = fecha de emisión + 1 mes
    fechaFinCobertura = addMonths(fechaEmision, 1);
    // Para sin pago, el fin de gracia es igual a la fecha de cobertura
    fechaFinGracia = new Date(fechaFinCobertura);
    diasCobertura = diffDays(fechaFinCobertura, ahora);
    diasGracia = diasCobertura;

    if (diasCobertura < 0) {
      estado = "VENCIDA";
    } else {
      estado = "PERIODO DE GRACIA";
    }
  } else {
    // Con pagos:
    // La cobertura se extiende sumando el número de pagos a la fecha de emisión.
    fechaFinCobertura = addMonths(fechaEmision, numPagos);
    // El periodo de gracia se extiende 1 mes más.
    fechaFinGracia = addMonths(fechaEmision, numPagos + 1);
    diasCobertura = diffDays(fechaFinCobertura, ahora);
    diasGracia = diffDays(fechaFinGracia, ahora);

    if (diasCobertura >= 0) {
      estado = "VIGENTE";
    } else {
      estado = (diasGracia >= 0) ? "PERIODO DE GRACIA" : "VENCIDA";
    }
  }

  return {
    ESTADO_POLIZA: estado,
    FECHA_FIN_COBERTURA: fechaFinCobertura.toISOString().split('T')[0],
    FECHA_FIN_GRACIA: fechaFinGracia.toISOString().split('T')[0],
    DIAS_RESTANTES_COBERTURA: diasCobertura,
    DIAS_RESTANTES_GRACIA: diasGracia
  };
};

// Función para calcular la calificación (puntaje) de la póliza
// Se utiliza el estado, los días restantes (de gracia o cobertura según corresponda)
// y el número de servicios usados.
const calcularPuntaje = (estado, diasCobertura, diasGracia, servicios) => {
  // Si la póliza ya tiene 2 servicios, se asigna la calificación mínima
  if (servicios >= 2) return 10;
  // Si la póliza está vencida, no es prioritaria
  if (estado === "VENCIDA") return 0;

  // Seleccionar días según el estado:
  // - Para periodo de gracia usamos DIAS_RESTANTES_GRACIA
  // - Para vigentes usamos DIAS_RESTANTES_COBERTURA
  let dias = (estado === "PERIODO DE GRACIA") ? diasGracia : diasCobertura;

  let puntaje = 0;
  // Para pólizas sin servicios
  if (servicios === 0) {
    if (dias <= 1) puntaje = 100;
    else if (dias <= 3) puntaje = 80;
    else if (dias <= 7) puntaje = 60;
    else puntaje = 40;
  }
  // Para pólizas con 1 servicio
  else if (servicios === 1) {
    if (dias <= 1) puntaje = 90;
    else if (dias <= 3) puntaje = 70;
    else if (dias <= 7) puntaje = 50;
    else puntaje = 30;
  }
  
  // Ajuste: Si la póliza es vigente, se le resta 10 puntos para darle prioridad a las de periodo de gracia
  if (estado === "VIGENTE") {
    puntaje = Math.max(puntaje - 10, 0);
  }

  return puntaje;
};

const main = () => {
  try {
    console.log('🔍 Leyendo archivo Excel...');
    const workbook = XLSX.readFile(inputFilePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    console.log(`📊 Se encontraron ${rows.length} registros.`);

    const ahora = new Date();

    const nuevosRows = rows.map((row) => {
      const fechaEmision = convertirFecha(row["FECHA DE EMISION"]);
      if (!fechaEmision) {
        console.log(`⚠️ Registro sin fecha de emisión. Se dejarán vacíos los campos calculados.`);
        return row;
      }
      // Contar pagos (se asume que las columnas se llaman "PAGO1_FECHA", etc.)
      const numPagos = contarPagos(row);
      // Calcular campos de fechas y estado
      const calculo = calcularCampos(fechaEmision, numPagos, ahora);
      // Contar servicios (se asume que las columnas se llaman "SERVICIO1_COSTO", etc.)
      const servicios = contarServicios(row);
      // Calcular puntaje o calificación según la lógica completa
      const puntaje = calcularPuntaje(
        calculo.ESTADO_POLIZA,
        calculo.DIAS_RESTANTES_COBERTURA,
        calculo.DIAS_RESTANTES_GRACIA,
        servicios
      );

      return {
        ...row,
        ESTADO_POLIZA: calculo.ESTADO_POLIZA,
        FECHA_FIN_COBERTURA: calculo.FECHA_FIN_COBERTURA,
        FECHA_FIN_GRACIA: calculo.FECHA_FIN_GRACIA,
        DIAS_RESTANTES_COBERTURA: calculo.DIAS_RESTANTES_COBERTURA,
        DIAS_RESTANTES_GRACIA: calculo.DIAS_RESTANTES_GRACIA,
        SERVICIOS: servicios,
        CALIFICACION: puntaje
      };
    });

    const nuevoWorkbook = XLSX.utils.book_new();
    const nuevoWorksheet = XLSX.utils.json_to_sheet(nuevosRows);
    XLSX.utils.book_append_sheet(nuevoWorkbook, nuevoWorksheet, sheetName);

    XLSX.writeFile(nuevoWorkbook, outputFilePath);
    console.log(`\n✅ Archivo actualizado guardado en: ${outputFilePath}`);
  } catch (error) {
    console.error('❌ Error al procesar el archivo:', error);
  }
};

main();