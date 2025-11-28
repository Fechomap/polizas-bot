// src/services/MistralOCRService.ts
// Servicio de OCR usando Mistral AI para extracción de datos de pólizas de seguros

import fetch from 'node-fetch';

/**
 * Datos extraídos de una póliza de seguro
 */
export interface IDatosPolizaExtraidos {
    numeroPoliza: string | null;
    aseguradora: string | null;
    fechaInicioVigencia: Date | null;
    fechaFinVigencia: Date | null;
    primerPago: number | null;
    segundoPago: number | null;
    primaMensual: number | null;
    primaTotal: number | null;
    titular: string | null;
    vehiculo: {
        marca: string | null;
        submarca: string | null;
        año: number | null;
        placas: string | null;
        serie: string | null;
    } | null;
    confianza: number; // 0-100 nivel de confianza en la extracción
    datosEncontrados: string[]; // Lista de campos que se encontraron
    datosFaltantes: string[]; // Lista de campos que no se pudieron extraer
}

/**
 * Resultado del análisis OCR
 */
export interface IResultadoOCR {
    success: boolean;
    datos: IDatosPolizaExtraidos | null;
    error?: string;
    rawResponse?: string;
}

/**
 * Lista de aseguradoras conocidas en México para mejor matching
 */
const ASEGURADORAS_CONOCIDAS = [
    'GNP',
    'GRUPO NACIONAL PROVINCIAL',
    'SEGUROS MONTERREY NEW YORK LIFE',
    'MONTERREY',
    'AXA',
    'AXA SEGUROS',
    'QUALITAS',
    'QUÁLITAS',
    'QUALITAS COMPAÑIA DE SEGUROS',
    'HDI',
    'HDI SEGUROS',
    'MAPFRE',
    'MAPFRE MEXICO',
    'ZURICH',
    'ZURICH SANTANDER',
    'ABA SEGUROS',
    'CHUBB',
    'CHUBB SEGUROS',
    'AFIRME',
    'BANORTE SEGUROS',
    'INBURSA',
    'SEGUROS INBURSA',
    'ATLAS',
    'SEGUROS ATLAS',
    'PRIMERO SEGUROS',
    'ANA COMPAÑIA DE SEGUROS',
    'ANA SEGUROS',
    'ALLIANZ',
    'METLIFE',
    'GENERAL DE SEGUROS',
    'LA LATINO SEGUROS',
    'TOKIO MARINE',
    'SURA',
    'RSA SEGUROS',
    'POTOSI',
    'SEGUROS EL POTOSI',
    'ARGOS',
    'BX+',
    'VE POR MAS',
    'AUTOFIN',
    'SEGUROS AZTECA'
];

/**
 * Normaliza el nombre de una aseguradora para mejor matching
 */
function normalizarAseguradora(nombre: string): string {
    if (!nombre) return '';

    const normalizado = nombre
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remover acentos
        .replace(/[^A-Z0-9\s]/g, '') // Solo alfanuméricos
        .trim();

    // Buscar coincidencia en lista conocida
    for (const aseg of ASEGURADORAS_CONOCIDAS) {
        const asegNorm = aseg
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Z0-9\s]/g, '');

        if (normalizado.includes(asegNorm) || asegNorm.includes(normalizado)) {
            // Retornar versión estandarizada
            if (asegNorm.includes('GNP') || asegNorm.includes('GRUPO NACIONAL')) return 'GNP';
            if (asegNorm.includes('MONTERREY')) return 'SEGUROS MONTERREY';
            if (asegNorm.includes('AXA')) return 'AXA SEGUROS';
            if (asegNorm.includes('QUALITAS') || asegNorm.includes('QUALITAS')) return 'QUALITAS';
            if (asegNorm.includes('HDI')) return 'HDI SEGUROS';
            if (asegNorm.includes('MAPFRE')) return 'MAPFRE';
            if (asegNorm.includes('ZURICH')) return 'ZURICH';
            if (asegNorm.includes('CHUBB')) return 'CHUBB';
            if (asegNorm.includes('INBURSA')) return 'SEGUROS INBURSA';
            if (asegNorm.includes('ATLAS')) return 'SEGUROS ATLAS';
            if (asegNorm.includes('ANA')) return 'ANA SEGUROS';
            if (asegNorm.includes('ALLIANZ')) return 'ALLIANZ';
            if (asegNorm.includes('BANORTE')) return 'BANORTE SEGUROS';
            if (asegNorm.includes('AFIRME')) return 'AFIRME';
            return aseg;
        }
    }

    return normalizado;
}

/**
 * Parsea una fecha en varios formatos comunes
 */
function parsearFecha(fechaStr: string): Date | null {
    if (!fechaStr) return null;

    // Limpiar string
    const limpia = fechaStr.trim().replace(/\s+/g, ' ');

    // Patrones comunes en pólizas mexicanas
    const patrones = [
        // DD/MM/YYYY o DD-MM-YYYY
        /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
        // YYYY/MM/DD o YYYY-MM-DD
        /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
        // DD de MES de YYYY
        /(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i,
        // MES DD, YYYY
        /(\w+)\s+(\d{1,2}),?\s+(\d{4})/i
    ];

    const meses: Record<string, number> = {
        enero: 0,
        febrero: 1,
        marzo: 2,
        abril: 3,
        mayo: 4,
        junio: 5,
        julio: 6,
        agosto: 7,
        septiembre: 8,
        octubre: 9,
        noviembre: 10,
        diciembre: 11,
        ene: 0,
        feb: 1,
        mar: 2,
        abr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        ago: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dic: 11
    };

    // Intentar DD/MM/YYYY
    let match = limpia.match(patrones[0]);
    if (match) {
        const dia = parseInt(match[1]);
        const mes = parseInt(match[2]) - 1;
        const año = parseInt(match[3]);
        if (dia >= 1 && dia <= 31 && mes >= 0 && mes <= 11 && año >= 2000) {
            return new Date(año, mes, dia);
        }
    }

    // Intentar YYYY/MM/DD
    match = limpia.match(patrones[1]);
    if (match) {
        const año = parseInt(match[1]);
        const mes = parseInt(match[2]) - 1;
        const dia = parseInt(match[3]);
        if (dia >= 1 && dia <= 31 && mes >= 0 && mes <= 11 && año >= 2000) {
            return new Date(año, mes, dia);
        }
    }

    // Intentar DD de MES de YYYY
    match = limpia.match(patrones[2]);
    if (match) {
        const dia = parseInt(match[1]);
        const mesStr = match[2].toLowerCase();
        const año = parseInt(match[3]);
        const mes = meses[mesStr];
        if (mes !== undefined && dia >= 1 && dia <= 31 && año >= 2000) {
            return new Date(año, mes, dia);
        }
    }

    // Intentar parseo nativo como último recurso
    const fecha = new Date(fechaStr);
    if (!isNaN(fecha.getTime()) && fecha.getFullYear() >= 2000) {
        return fecha;
    }

    return null;
}

/**
 * Parsea un monto monetario
 */
function parsearMonto(montoStr: string): number | null {
    if (!montoStr) return null;

    // Remover símbolos de moneda y espacios
    const limpio = montoStr
        .replace(/[$MXN\s,]/gi, '')
        .replace(/,/g, '')
        .trim();

    const monto = parseFloat(limpio);

    if (!isNaN(monto) && monto > 0) {
        return monto;
    }

    return null;
}

/**
 * Servicio principal de OCR con Mistral AI
 * Usa el endpoint /v1/ocr con el modelo mistral-ocr-latest
 */
class MistralOCRService {
    private apiKey: string;
    private baseUrl = 'https://api.mistral.ai/v1';
    private model = 'mistral-ocr-latest'; // Modelo especializado en OCR de documentos

    constructor() {
        this.apiKey = process.env.MISTRAL_API_KEY || '';
        if (!this.apiKey) {
            console.warn('MISTRAL_API_KEY no está configurada');
        }
    }

    /**
     * Verifica si el servicio está configurado correctamente
     */
    isConfigured(): boolean {
        return !!this.apiKey;
    }

    /**
     * Extrae datos de un PDF o imagen de póliza
     * @param fileBuffer Buffer del archivo (PDF o imagen)
     * @param mimeType Tipo MIME del archivo
     * @param fileName Nombre del archivo (opcional, para logging)
     */
    async extraerDatosPoliza(
        fileBuffer: Buffer,
        mimeType: string,
        fileName?: string
    ): Promise<IResultadoOCR> {
        if (!this.isConfigured()) {
            return {
                success: false,
                datos: null,
                error: 'El servicio Mistral OCR no está configurado. Falta MISTRAL_API_KEY.'
            };
        }

        try {
            console.log(
                `[MistralOCR] Procesando archivo: ${fileName || 'sin nombre'}, tipo: ${mimeType}, tamaño: ${fileBuffer.length} bytes`
            );

            // Convertir buffer a base64
            const base64Data = fileBuffer.toString('base64');

            // Determinar el tipo de documento para la API
            // Mistral OCR usa "document_url" para PDFs y "image_url" para imágenes
            // El valor puede ser una URL o un data URI con base64
            const isPDF = mimeType === 'application/pdf';
            const documentType = isPDF ? 'document_url' : 'image_url';
            const dataUri = isPDF
                ? `data:application/pdf;base64,${base64Data}`
                : `data:${mimeType};base64,${base64Data}`;

            // Llamar al endpoint de OCR de Mistral
            const response = await fetch(`${this.baseUrl}/ocr`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    document: {
                        type: documentType,
                        [documentType]: dataUri
                    },
                    include_image_base64: false // No necesitamos las imágenes de vuelta
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[MistralOCR] Error en API OCR: ${response.status} - ${errorText}`);
                return {
                    success: false,
                    datos: null,
                    error: `Error en API de Mistral OCR: ${response.status}`
                };
            }

            const ocrResult = (await response.json()) as any;

            // El resultado de OCR tiene pages con markdown
            if (!ocrResult.pages || ocrResult.pages.length === 0) {
                return {
                    success: false,
                    datos: null,
                    error: 'Mistral OCR no devolvió páginas'
                };
            }

            // Combinar el contenido de todas las páginas
            const contenidoCompleto = ocrResult.pages
                .map((page: any) => page.markdown || '')
                .join('\n\n');

            console.log(
                `[MistralOCR] OCR completado. ${ocrResult.pages.length} páginas procesadas.`
            );
            console.log(
                `[MistralOCR] Contenido extraído (primeros 500 chars): ${contenidoCompleto.substring(0, 500)}...`
            );

            // Ahora usar el chat API para extraer datos estructurados del markdown
            const datosExtraidos = await this.extraerDatosDeMarkdown(contenidoCompleto);

            return {
                success: true,
                datos: datosExtraidos,
                rawResponse: contenidoCompleto
            };
        } catch (error) {
            console.error('[MistralOCR] Error procesando documento:', error);
            return {
                success: false,
                datos: null,
                error: error instanceof Error ? error.message : 'Error desconocido'
            };
        }
    }

    /**
     * Extrae datos estructurados del markdown usando el chat API
     */
    private async extraerDatosDeMarkdown(markdown: string): Promise<IDatosPolizaExtraidos> {
        const prompt = `Analiza el siguiente texto extraído de una póliza de seguro de auto mexicana y extrae los datos en formato JSON.

TEXTO DE LA PÓLIZA:
${markdown}

Extrae los siguientes datos:
1. numeroPoliza: El número de póliza o contrato (busca "Póliza", "No.", "Contrato", "Número")
2. aseguradora: Nombre de la compañía aseguradora
3. fechaInicioVigencia: Fecha de inicio de vigencia (formato YYYY-MM-DD)
4. fechaFinVigencia: Fecha de fin de vigencia (formato YYYY-MM-DD)
5. primerPago: Monto del primer pago o prima inicial
6. segundoPago: Monto del segundo pago o pagos subsecuentes (recibos posteriores al primero)
7. primaMensual: Prima mensual si aparece
8. primaTotal: Prima total anual
9. titular: Nombre del asegurado/contratante
10. vehiculo: Datos del vehículo (marca, submarca, año, placas, serie/VIN)

IMPORTANTE: Si no encuentras un dato, pon null. Los montos deben ser números sin símbolo de moneda.

Responde SOLO con el JSON:
{
  "numeroPoliza": "...",
  "aseguradora": "...",
  "fechaInicioVigencia": "YYYY-MM-DD",
  "fechaFinVigencia": "YYYY-MM-DD",
  "primerPago": 0,
  "segundoPago": 0,
  "primaMensual": 0,
  "primaTotal": 0,
  "titular": "...",
  "vehiculo": {
    "marca": "...",
    "submarca": "...",
    "año": 0,
    "placas": "...",
    "serie": "..."
  }
}`;

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'mistral-small-latest',
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: 2000,
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                console.error(`[MistralOCR] Error en chat API: ${response.status}`);
                // Intentar parsear directamente el markdown si falla el chat
                return this.parsearMarkdownDirecto(markdown);
            }

            const data = (await response.json()) as any;
            const contenido = data.choices?.[0]?.message?.content;

            if (!contenido) {
                return this.parsearMarkdownDirecto(markdown);
            }

            return this.parsearRespuestaMistral(contenido);
        } catch (error) {
            console.error('[MistralOCR] Error en extracción de datos:', error);
            return this.parsearMarkdownDirecto(markdown);
        }
    }

    /**
     * Intenta parsear datos directamente del markdown sin IA
     */
    private parsearMarkdownDirecto(markdown: string): IDatosPolizaExtraidos {
        const datosEncontrados: string[] = [];
        const datosFaltantes: string[] = [];

        // Patrones de búsqueda para datos comunes en pólizas mexicanas
        const patrones = {
            numeroPoliza: /(?:p[oó]liza|contrato|no\.?\s*de\s*p[oó]liza)[:\s#]*([A-Z0-9\-]+)/i,
            aseguradora:
                /(?:gnp|axa|qualitas|hdi|mapfre|zurich|chubb|inbursa|monterrey|atlas|allianz|banorte|afirme)/i,
            fechaInicio: /(?:vigencia|inicio|desde)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
            fechaFin: /(?:hasta|vencimiento|fin)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
            monto: /(?:prima|pago|total)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
            titular: /(?:asegurado|contratante|nombre)[:\s]*([A-ZÁÉÍÓÚÑ\s]+)/i,
            marca: /(?:marca)[:\s]*([A-ZÁÉÍÓÚÑ\s]+)/i,
            modelo: /(?:modelo|submarca|tipo)[:\s]*([A-ZÁÉÍÓÚÑ0-9\s]+)/i,
            año: /(?:a[ñn]o|modelo)[:\s]*(\d{4})/i,
            placas: /(?:placas?)[:\s]*([A-Z0-9\-]+)/i,
            serie: /(?:serie|vin|n[úu]mero\s*de\s*serie)[:\s]*([A-Z0-9]{17})/i
        };

        let numeroPoliza: string | null = null;
        let aseguradora: string | null = null;
        let fechaInicioVigencia: Date | null = null;
        let fechaFinVigencia: Date | null = null;
        let primerPago: number | null = null;
        let titular: string | null = null;
        let vehiculo: any = null;

        // Buscar número de póliza
        const matchPoliza = markdown.match(patrones.numeroPoliza);
        if (matchPoliza) {
            numeroPoliza = matchPoliza[1].trim();
            datosEncontrados.push('numeroPoliza');
        } else {
            datosFaltantes.push('numeroPoliza');
        }

        // Buscar aseguradora
        const matchAseg = markdown.match(patrones.aseguradora);
        if (matchAseg) {
            aseguradora = normalizarAseguradora(matchAseg[0]);
            datosEncontrados.push('aseguradora');
        } else {
            datosFaltantes.push('aseguradora');
        }

        // Buscar fechas
        const matchFechaInicio = markdown.match(patrones.fechaInicio);
        if (matchFechaInicio) {
            fechaInicioVigencia = parsearFecha(matchFechaInicio[1]);
            if (fechaInicioVigencia) datosEncontrados.push('fechaInicioVigencia');
        }
        if (!fechaInicioVigencia) datosFaltantes.push('fechaInicioVigencia');

        const matchFechaFin = markdown.match(patrones.fechaFin);
        if (matchFechaFin) {
            fechaFinVigencia = parsearFecha(matchFechaFin[1]);
            if (fechaFinVigencia) datosEncontrados.push('fechaFinVigencia');
        }

        // Buscar monto
        const matchMonto = markdown.match(patrones.monto);
        if (matchMonto) {
            primerPago = parsearMonto(matchMonto[1]);
            if (primerPago) datosEncontrados.push('primerPago');
        }
        if (!primerPago) datosFaltantes.push('primerPago');

        // Buscar titular
        const matchTitular = markdown.match(patrones.titular);
        if (matchTitular) {
            titular = matchTitular[1].trim();
            datosEncontrados.push('titular');
        }

        // Buscar datos del vehículo
        const matchMarca = markdown.match(patrones.marca);
        const matchModelo = markdown.match(patrones.modelo);
        const matchAño = markdown.match(patrones.año);
        const matchPlacas = markdown.match(patrones.placas);
        const matchSerie = markdown.match(patrones.serie);

        if (matchMarca || matchModelo || matchAño || matchPlacas || matchSerie) {
            vehiculo = {
                marca: matchMarca ? matchMarca[1].trim().toUpperCase() : null,
                submarca: matchModelo ? matchModelo[1].trim().toUpperCase() : null,
                año: matchAño ? parseInt(matchAño[1]) : null,
                placas: matchPlacas ? matchPlacas[1].trim().toUpperCase() : null,
                serie: matchSerie ? matchSerie[1].trim().toUpperCase() : null
            };
        }

        // Calcular confianza
        const camposEsenciales = [
            'numeroPoliza',
            'aseguradora',
            'fechaInicioVigencia',
            'primerPago'
        ];
        const encontrados = camposEsenciales.filter(c => datosEncontrados.includes(c));
        const confianza = Math.round((encontrados.length / camposEsenciales.length) * 100);

        return {
            numeroPoliza,
            aseguradora,
            fechaInicioVigencia,
            fechaFinVigencia,
            primerPago,
            segundoPago: null,
            primaMensual: null,
            primaTotal: null,
            titular,
            vehiculo,
            confianza,
            datosEncontrados,
            datosFaltantes
        };
    }

    /**
     * Parsea la respuesta de Mistral y la convierte a IDatosPolizaExtraidos
     */
    private parsearRespuestaMistral(contenido: string): IDatosPolizaExtraidos {
        const datosEncontrados: string[] = [];
        const datosFaltantes: string[] = [];

        let jsonData: any = {};

        try {
            // Intentar extraer JSON de la respuesta
            const jsonMatch = contenido.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonData = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.warn('[MistralOCR] No se pudo parsear JSON de la respuesta');
        }

        // Extraer y validar cada campo
        const numeroPoliza = jsonData.numeroPoliza?.toString()?.trim() || null;
        if (numeroPoliza) datosEncontrados.push('numeroPoliza');
        else datosFaltantes.push('numeroPoliza');

        const aseguradoraRaw = jsonData.aseguradora?.toString()?.trim() || null;
        const aseguradora = aseguradoraRaw ? normalizarAseguradora(aseguradoraRaw) : null;
        if (aseguradora) datosEncontrados.push('aseguradora');
        else datosFaltantes.push('aseguradora');

        const fechaInicioVigencia = parsearFecha(jsonData.fechaInicioVigencia);
        if (fechaInicioVigencia) datosEncontrados.push('fechaInicioVigencia');
        else datosFaltantes.push('fechaInicioVigencia');

        const fechaFinVigencia = parsearFecha(jsonData.fechaFinVigencia);
        if (fechaFinVigencia) datosEncontrados.push('fechaFinVigencia');
        else datosFaltantes.push('fechaFinVigencia');

        const primerPago = parsearMonto(jsonData.primerPago?.toString());
        if (primerPago) datosEncontrados.push('primerPago');
        else datosFaltantes.push('primerPago');

        const segundoPago = parsearMonto(jsonData.segundoPago?.toString());
        if (segundoPago) datosEncontrados.push('segundoPago');
        else datosFaltantes.push('segundoPago');

        const primaMensual = parsearMonto(jsonData.primaMensual?.toString());
        if (primaMensual) datosEncontrados.push('primaMensual');

        const primaTotal = parsearMonto(jsonData.primaTotal?.toString());
        if (primaTotal) datosEncontrados.push('primaTotal');

        const titular = jsonData.titular?.toString()?.trim() || null;
        if (titular) datosEncontrados.push('titular');

        // Datos del vehículo
        let vehiculo = null;
        if (jsonData.vehiculo) {
            vehiculo = {
                marca: jsonData.vehiculo.marca?.toString()?.trim()?.toUpperCase() || null,
                submarca: jsonData.vehiculo.submarca?.toString()?.trim()?.toUpperCase() || null,
                año: parseInt(jsonData.vehiculo.año) || null,
                placas: jsonData.vehiculo.placas?.toString()?.trim()?.toUpperCase() || null,
                serie: jsonData.vehiculo.serie?.toString()?.trim()?.toUpperCase() || null
            };

            if (vehiculo.marca) datosEncontrados.push('vehiculo.marca');
            if (vehiculo.submarca) datosEncontrados.push('vehiculo.submarca');
            if (vehiculo.año) datosEncontrados.push('vehiculo.año');
            if (vehiculo.placas) datosEncontrados.push('vehiculo.placas');
            if (vehiculo.serie) datosEncontrados.push('vehiculo.serie');
        }

        // Calcular nivel de confianza basado en campos encontrados
        const camposEsenciales = [
            'numeroPoliza',
            'aseguradora',
            'fechaInicioVigencia',
            'primerPago'
        ];
        const encontradosEsenciales = camposEsenciales.filter(c => datosEncontrados.includes(c));
        const confianza = Math.round(
            (encontradosEsenciales.length / camposEsenciales.length) * 100
        );

        return {
            numeroPoliza,
            aseguradora,
            fechaInicioVigencia,
            fechaFinVigencia,
            primerPago,
            segundoPago,
            primaMensual,
            primaTotal,
            titular,
            vehiculo,
            confianza,
            datosEncontrados,
            datosFaltantes
        };
    }

    /**
     * Procesa múltiples páginas de un PDF
     * @param pages Array de buffers, uno por página
     */
    async procesarMultiplesPaginas(
        pages: Buffer[],
        mimeType: string = 'image/jpeg'
    ): Promise<IResultadoOCR> {
        console.log(`[MistralOCR] Procesando ${pages.length} páginas`);

        // Procesar cada página y combinar resultados
        const resultados: IDatosPolizaExtraidos[] = [];

        for (let i = 0; i < pages.length; i++) {
            console.log(`[MistralOCR] Procesando página ${i + 1} de ${pages.length}`);
            const resultado = await this.extraerDatosPoliza(pages[i], mimeType, `pagina_${i + 1}`);

            if (resultado.success && resultado.datos) {
                resultados.push(resultado.datos);
            }
        }

        if (resultados.length === 0) {
            return {
                success: false,
                datos: null,
                error: 'No se pudo extraer datos de ninguna página'
            };
        }

        // Combinar resultados de todas las páginas
        const datosCombinados = this.combinarResultados(resultados);

        return {
            success: true,
            datos: datosCombinados
        };
    }

    /**
     * Combina resultados de múltiples páginas, priorizando datos encontrados
     */
    private combinarResultados(resultados: IDatosPolizaExtraidos[]): IDatosPolizaExtraidos {
        const combinado: IDatosPolizaExtraidos = {
            numeroPoliza: null,
            aseguradora: null,
            fechaInicioVigencia: null,
            fechaFinVigencia: null,
            primerPago: null,
            segundoPago: null,
            primaMensual: null,
            primaTotal: null,
            titular: null,
            vehiculo: null,
            confianza: 0,
            datosEncontrados: [],
            datosFaltantes: []
        };

        // Para cada campo, tomar el primer valor no nulo encontrado
        for (const resultado of resultados) {
            if (!combinado.numeroPoliza && resultado.numeroPoliza) {
                combinado.numeroPoliza = resultado.numeroPoliza;
            }
            if (!combinado.aseguradora && resultado.aseguradora) {
                combinado.aseguradora = resultado.aseguradora;
            }
            if (!combinado.fechaInicioVigencia && resultado.fechaInicioVigencia) {
                combinado.fechaInicioVigencia = resultado.fechaInicioVigencia;
            }
            if (!combinado.fechaFinVigencia && resultado.fechaFinVigencia) {
                combinado.fechaFinVigencia = resultado.fechaFinVigencia;
            }
            if (!combinado.primerPago && resultado.primerPago) {
                combinado.primerPago = resultado.primerPago;
            }
            if (!combinado.segundoPago && resultado.segundoPago) {
                combinado.segundoPago = resultado.segundoPago;
            }
            if (!combinado.primaMensual && resultado.primaMensual) {
                combinado.primaMensual = resultado.primaMensual;
            }
            if (!combinado.primaTotal && resultado.primaTotal) {
                combinado.primaTotal = resultado.primaTotal;
            }
            if (!combinado.titular && resultado.titular) {
                combinado.titular = resultado.titular;
            }
            if (!combinado.vehiculo && resultado.vehiculo) {
                combinado.vehiculo = resultado.vehiculo;
            }
        }

        // Actualizar listas de datos encontrados/faltantes
        const camposVerificar = [
            'numeroPoliza',
            'aseguradora',
            'fechaInicioVigencia',
            'fechaFinVigencia',
            'primerPago',
            'segundoPago',
            'primaMensual',
            'primaTotal',
            'titular'
        ];

        for (const campo of camposVerificar) {
            if ((combinado as any)[campo]) {
                combinado.datosEncontrados.push(campo);
            } else {
                combinado.datosFaltantes.push(campo);
            }
        }

        // Calcular confianza
        const camposEsenciales = [
            'numeroPoliza',
            'aseguradora',
            'fechaInicioVigencia',
            'primerPago'
        ];
        const encontrados = camposEsenciales.filter(c => (combinado as any)[c]);
        combinado.confianza = Math.round((encontrados.length / camposEsenciales.length) * 100);

        return combinado;
    }
}

// Singleton instance
let instance: MistralOCRService | null = null;

export function getInstance(): MistralOCRService {
    if (!instance) {
        instance = new MistralOCRService();
    }
    return instance;
}

export default MistralOCRService;
