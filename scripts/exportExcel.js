// scripts/exportExcel.js
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

const Policy = require('../src/models/policy'); // Asegúrate de la ruta correcta a tu modelo

// Conecta a la DB
async function connectDB() {
  try {
    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) {
      throw new Error('La variable de entorno MONGO_URI no está definida');
    }
    console.log('✅ Conectando a MongoDB para exportación (streaming)...');
    await mongoose.connect(mongoURI);
    console.log('✅ Conectado a MongoDB');
  } catch (err) {
    console.error('❌ Error al conectar a MongoDB:', err);
    process.exit(1);
  }
}

// Asegura que exista el directorio donde se va a guardar el Excel
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

// Exportación con streaming
async function exportExcelStream() {
  try {
    console.log('🔍 Buscando pólizas en la base de datos...');
    
    // Antes de hacer el cursor, podemos contar cuántas existen (opcional).
    const totalPolicies = await Policy.countDocuments();
    if (!totalPolicies) {
      console.log('⚠️ No se encontraron pólizas para exportar.');
      process.exit(0);
    }
    console.log(`📊 Se exportarán ${totalPolicies} pólizas mediante streaming...`);

    const backupDir = path.join(__dirname, 'backup');
    await ensureDirectoryExists(backupDir);

    // Creamos un nombre de archivo con timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const excelPath = path.join(backupDir, `polizas_backup_stream_${timestamp}.xlsx`);

    // Configuramos el workbook para modo streaming
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: excelPath,
      useStyles: true,     // Opcional: si quieres usar estilos
      useSharedStrings: true // Opcional: reduce duplicados de strings
    });

    // Creamos la hoja (worksheet)
    const worksheet = workbook.addWorksheet('PolizasStreaming');

    // Define las columnas (encabezados) según tus campos
    worksheet.columns = [
      { header: 'TITULAR', key: 'titular', width: 20 },
      { header: 'CORREO ELECTRONICO', key: 'correo', width: 25 },
      { header: 'CONTRASEÑA', key: 'contraseña', width: 15 },
      { header: 'TELEFONO', key: 'telefono', width: 15 },
      { header: 'CALLE', key: 'calle', width: 20 },
      { header: 'COLONIA', key: 'colonia', width: 20 },
      { header: 'MUNICIPIO', key: 'municipio', width: 20 },
      { header: 'ESTADO', key: 'estadoRegion', width: 20 },
      { header: 'CP', key: 'cp', width: 10 },
      { header: 'RFC', key: 'rfc', width: 15 },
      { header: 'MARCA', key: 'marca', width: 15 },
      { header: 'SUBMARCA', key: 'submarca', width: 15 },
      { header: 'AÑO', key: 'año', width: 10 },
      { header: 'COLOR', key: 'color', width: 15 },
      { header: 'SERIE', key: 'serie', width: 25 },
      { header: 'PLACAS', key: 'placas', width: 15 },
      { header: 'AGENTE COTIZADOR', key: 'agenteCotizador', width: 20 },
      { header: 'ASEGURADORA', key: 'aseguradora', width: 20 },
      { header: '# DE POLIZA', key: 'numeroPoliza', width: 20 },
      { header: 'FECHA DE EMISION', key: 'fechaEmision', width: 15 },
      { header: 'ESTADO_POLIZA', key: 'estadoPoliza', width: 15 },
      { header: 'FECHA_FIN_COBERTURA', key: 'fechaFinCobertura', width: 15 },
      { header: 'FECHA_FIN_GRACIA', key: 'fechaFinGracia', width: 15 },
      { header: 'DIAS_RESTANTES_COBERTURA', key: 'diasRestantesCobertura', width: 10 },
      { header: 'DIAS_RESTANTES_GRACIA', key: 'diasRestantesGracia', width: 10 },
      { header: 'NUM_FOTOS', key: 'numFotos', width: 10 },
      { header: 'NUM_PDFS', key: 'numPdfs', width: 10 },
      { header: 'ESTADO_DB', key: 'estadoDB', width: 10 },

      // Si quieres manejar los pagos en columnas (12 pagos), agrégalos también:
      ...Array.from({ length: 12 }).flatMap((_, i) => [
        { header: `PAGO${i + 1}_MONTO`, key: `pago${i + 1}Monto`, width: 12 },
        { header: `PAGO${i + 1}_FECHA`, key: `pago${i + 1}Fecha`, width: 12 },
      ]),

      // Si quieres manejar los servicios en columnas (12 servicios):
      ...Array.from({ length: 12 }).flatMap((_, i) => [
        { header: `SERVICIO${i + 1}_COSTO`, key: `servicio${i + 1}Costo`, width: 12 },
        { header: `SERVICIO${i + 1}_FECHA`, key: `servicio${i + 1}Fecha`, width: 12 },
        { header: `SERVICIO${i + 1}_EXPEDIENTE`, key: `servicio${i + 1}Expediente`, width: 15 },
        { header: `SERVICIO${i + 1}_ORIGEN_DESTINO`, key: `servicio${i + 1}OrigenDestino`, width: 20 },
      ]),
    ];

    // Creamos un cursor para leer los datos uno a uno
    const cursor = Policy.find().lean().cursor();
    
    // Recorremos los documentos usando el cursor
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      
      // Prepara las propiedades directas
      const rowData = {
        titular: doc.titular || '',
        correo: doc.correo || '',
        contraseña: doc.contraseña || '',
        telefono: doc.telefono || '',
        calle: doc.calle || '',
        colonia: doc.colonia || '',
        municipio: doc.municipio || '',
        estadoRegion: doc.estadoRegion || '',
        cp: doc.cp || '',
        rfc: doc.rfc || '',
        marca: doc.marca || '',
        submarca: doc.submarca || '',
        año: doc.año || '',
        color: doc.color || '',
        serie: doc.serie || '',
        placas: doc.placas || '',
        agenteCotizador: doc.agenteCotizador || '',
        aseguradora: doc.aseguradora || '',
        numeroPoliza: doc.numeroPoliza || '',
        fechaEmision: doc.fechaEmision
          ? new Date(doc.fechaEmision).toISOString().split('T')[0]
          : '',
        estadoPoliza: doc.estadoPoliza || '',
        fechaFinCobertura: doc.fechaFinCobertura
          ? new Date(doc.fechaFinCobertura).toISOString().split('T')[0]
          : '',
        fechaFinGracia: doc.fechaFinGracia
          ? new Date(doc.fechaFinGracia).toISOString().split('T')[0]
          : '',
        diasRestantesCobertura: doc.diasRestantesCobertura || '',
        diasRestantesGracia: doc.diasRestantesGracia || '',
        numFotos: doc.archivos?.fotos ? doc.archivos.fotos.length : 0,
        numPdfs: doc.archivos?.pdfs ? doc.archivos.pdfs.length : 0,
        estadoDB: doc.estado || 'ACTIVO'
      };

      // Manejo de pagos (hasta 12)
      const pagos = doc.pagos || [];
      for (let i = 0; i < 12; i++) {
        const pago = pagos[i];
        rowData[`pago${i + 1}Monto`] = pago ? pago.monto : '';
        rowData[`pago${i + 1}Fecha`] = (pago && pago.fechaPago)
          ? new Date(pago.fechaPago).toISOString().split('T')[0]
          : '';
      }

      // Manejo de servicios (hasta 12)
      const servicios = doc.servicios || [];
      for (let i = 0; i < 12; i++) {
        const servicio = servicios[i];
        rowData[`servicio${i + 1}Costo`] = servicio ? servicio.costo : '';
        rowData[`servicio${i + 1}Fecha`] = (servicio && servicio.fechaServicio)
          ? new Date(servicio.fechaServicio).toISOString().split('T')[0]
          : '';
        rowData[`servicio${i + 1}Expediente`] = servicio ? servicio.numeroExpediente : '';
        rowData[`servicio${i + 1}OrigenDestino`] = servicio ? servicio.origenDestino : '';
      }

      // Agregamos la fila al worksheet (stream)
      const row = worksheet.addRow(rowData);
      row.commit(); // Importante para streaming
    }

    // Cerramos el cursor
    await cursor.close();

    // Terminamos la escritura del workbook
    await workbook.commit();

    console.log(`\n✅ Exportación (stream) completada exitosamente.`);
    console.log(`📁 Archivo Excel guardado en: ${excelPath}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error durante la exportación (stream):', error);
    process.exit(1);
  }
}

// Ejecutamos
(async () => {
  await connectDB();
  await exportExcelStream();
})();