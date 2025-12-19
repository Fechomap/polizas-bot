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
    primaNeta: number | null;
    titular: string | null; // Asegurado/Titular/Contratante/Beneficiario
    telefono: string | null;
    rfc: string | null;
    correo: string | null;
    domicilio: {
        calle: string | null;
        colonia: string | null;
        municipio: string | null;
        estado: string | null;
        cp: string | null;
    } | null;
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

        if (normalizado.includes(asegNorm) ?? asegNorm.includes(normalizado)) {
            // Retornar versión estandarizada
            if (asegNorm.includes('GNP') ?? asegNorm.includes('GRUPO NACIONAL')) return 'GNP';
            if (asegNorm.includes('MONTERREY')) return 'SEGUROS MONTERREY';
            if (asegNorm.includes('AXA')) return 'AXA SEGUROS';
            if (asegNorm.includes('QUALITAS') ?? asegNorm.includes('QUALITAS')) return 'QUALITAS';
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
        this.apiKey = process.env.MISTRAL_API_KEY ?? '';
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
                `[MistralOCR] Procesando archivo: ${fileName ?? 'sin nombre'}, tipo: ${mimeType}, tamaño: ${fileBuffer.length} bytes`
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

            const ocrResult = await response.json();

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
                .map((page: any) => page.markdown ?? '')
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
     * Prompt optimizado para pólizas de seguros mexicanas (Zurich, GNP, AXA, Qualitas, etc.)
     */
    private async extraerDatosDeMarkdown(markdown: string): Promise<IDatosPolizaExtraidos> {
        const prompt = `Eres un experto en análisis de pólizas de seguros de autos mexicanas. Tu trabajo es LEER, COMPRENDER y EXTRAER información de documentos de aseguradoras como CHUBB, GNP, AXA, QUALITAS, HDI, MAPFRE, ZURICH, INBURSA, MONTERREY, ATLAS, ALLIANZ, BANORTE, AFIRME, ANA, SURA, PRIMERO, entre otras.

DOCUMENTO A ANALIZAR:
${markdown}

INSTRUCCIONES DE EXTRACCIÓN INTELIGENTE:

1. **NÚMERO DE PÓLIZA**:
   - Busca contextualmente cualquier referencia a número de póliza, contrato, certificado
   - Puede aparecer como "Póliza:", "No. Póliza", "Póliza No.", "Contrato", etc.
   - Generalmente es alfanumérico (ej: WE45013478, 123456789)

2. **ASEGURADORA**:
   - Identifica la compañía de seguros del encabezado, logo o menciones en el documento
   - Normaliza al nombre común (ej: "Chubb Seguros México" → "CHUBB")

3. **FECHAS DE VIGENCIA**:
   - Busca "Vigencia", "Del ... al ...", "Desde/Hasta", "Inicio/Fin de Vigencia"
   - El formato puede variar (19/Dic/2025, 19-12-2025, 19 de diciembre de 2025)
   - CONVIERTE siempre a formato YYYY-MM-DD

4. **NOMBRE DEL ASEGURADO/TITULAR** (MUY IMPORTANTE - búsqueda contextual):
   - Este es el nombre de la PERSONA física o moral que contrata el seguro
   - Puede aparecer como: "Asegurado:", "Asegurada:", "Titular:", "Contratante:", "Propietario:", "Propietaria:", "Beneficiario:", "Beneficiaria:", "Nombre:", "Cliente:"
   - Busca en secciones como "Datos del asegurado", "Datos del asegurado y/o propietario", "Datos del propietario", "Datos del contratante"
   - Es un nombre completo de persona (ej: "Josefina Jimenez Ortiz", "Juan Pérez García", "María López Hernández")
   - NO confundir con el nombre de la aseguradora, del agente o del conducto
   - Este campo es CRÍTICO, búscalo exhaustivamente en todo el documento

5. **PAGOS Y PRIMAS**:
   - "Prima Total", "Total a Pagar" = primaTotal (el costo total del seguro)
   - "1er Pago", "Primer Pago", "Pago Inicial", "Enganche" = primerPago
   - "Subsecuentes", "Pagos Posteriores", "Mensualidad" = segundoPago
   - "Prima Neta" = primaNeta (sin IVA ni gastos)
   - Si solo hay Prima Total y es pago único o mensual, NO inventes primer/segundo pago
   - Extrae solo números (sin $, MXN, comas)

6. **DATOS DEL VEHÍCULO**:
   - Busca sección "Descripción del Vehículo", "Datos del Vehículo", o similar
   - Marca: fabricante (MITSUBISHI, MAZDA, NISSAN, TOYOTA, HONDA, etc.)
   - Submarca/Modelo/Tipo/Descripción: línea o versión (LANCER, MAZDA 3, VERSA, etc.)
   - Año/Modelo: año del vehículo (2014, 2020, etc.)
   - Serie/VIN/No. de Serie: exactamente 17 caracteres alfanuméricos
   - Placas: matrícula del vehículo

7. **DATOS ADICIONALES DEL TITULAR** (si están disponibles):
   - Teléfono, RFC, Correo electrónico
   - Dirección: Calle, Colonia, Municipio, Estado, CP

REGLAS CRÍTICAS:
- Si un dato NO está claramente en el documento, usa null (NO INVENTES)
- Los montos son números decimales (1545.09, no "1,545.09")
- Las fechas SIEMPRE en formato YYYY-MM-DD
- Serie/VIN debe tener exactamente 17 caracteres
- Sé FLEXIBLE en la búsqueda pero PRECISO en la extracción

Responde ÚNICAMENTE con JSON válido (sin markdown, sin \`\`\`, sin explicaciones):
{
  "numeroPoliza": "string o null",
  "aseguradora": "string o null",
  "fechaInicioVigencia": "YYYY-MM-DD o null",
  "fechaFinVigencia": "YYYY-MM-DD o null",
  "primerPago": number o null,
  "segundoPago": number o null,
  "primaMensual": number o null,
  "primaTotal": number o null,
  "primaNeta": number o null,
  "titular": "string o null - nombre del asegurado/titular/contratante",
  "telefono": "string o null",
  "rfc": "string o null",
  "correo": "string o null",
  "domicilio": {
    "calle": "string o null",
    "colonia": "string o null",
    "municipio": "string o null",
    "estado": "string o null",
    "cp": "string o null"
  },
  "vehiculo": {
    "marca": "string o null",
    "submarca": "string o null",
    "año": number o null,
    "placas": "string o null",
    "serie": "string o null"
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
                    model: 'mistral-large-latest',
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: 25000,
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                console.error(`[MistralOCR] Error en chat API: ${response.status}`);
                // Intentar parsear directamente el markdown si falla el chat
                return this.parsearMarkdownDirecto(markdown);
            }

            const data = await response.json();
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
     * Patrones optimizados para pólizas mexicanas (Zurich, GNP, AXA, etc.)
     */
    private parsearMarkdownDirecto(markdown: string): IDatosPolizaExtraidos {
        const datosEncontrados: string[] = [];
        const datosFaltantes: string[] = [];

        // Patrones de búsqueda optimizados para pólizas mexicanas
        const patrones = {
            // Número de póliza - múltiples formatos
            numeroPoliza: [
                /P[OÓ]LIZA\s*No\.?\s*:?\s*(\d{6,12})/i,
                /No\.?\s*de\s*P[oó]liza[:\s]*(\d{6,12})/i,
                /Contrato[:\s#]*([A-Z0-9\-]{6,15})/i,
                /N[úu]mero\s*de\s*P[oó]liza[:\s]*(\d{6,12})/i
            ],
            // Aseguradoras conocidas
            aseguradora:
                /\b(ZURICH|GNP|AXA|QUALITAS|QUÁLITAS|HDI|MAPFRE|CHUBB|INBURSA|MONTERREY|ATLAS|ALLIANZ|BANORTE|AFIRME|ANA|SURA|PRIMERO)\b/i,
            // Fechas de vigencia
            fechaInicio: [
                /Desde[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
                /Inicio\s*(?:de\s*)?Vigencia[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
                /Vigencia[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i
            ],
            fechaFin: [
                /Hasta[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
                /Fin\s*(?:de\s*)?Vigencia[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
                /Vencimiento[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i
            ],
            // Pagos - distinguir primer pago de subsecuentes
            primerPago: [
                /1er\.?\s*Pago[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
                /Primer\s*Pago[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
                /Pago\s*Inicial[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i
            ],
            segundoPago: [
                /Subsecuentes?[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
                /Recibos?\s*Subsecuentes?[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
                /Pagos?\s*Posteriores?[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i
            ],
            primaTotal: [
                /Prima\s*Total[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
                /Total\s*(?:a\s*)?Pagar[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i
            ],
            // Titular
            titular: [
                /Asegurado[:\s]*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{5,50})/i,
                /Contratante[:\s]*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{5,50})/i,
                /Nombre[:\s]*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{5,50})/i
            ],
            // Datos del vehículo
            marca: [
                /Marca[:\s]*([A-ZÁÉÍÓÚÑ]{2,20})/i,
                /\b(MAZDA|NISSAN|TOYOTA|HONDA|CHEVROLET|FORD|VOLKSWAGEN|KIA|HYUNDAI|BMW|MERCEDES|AUDI|JEEP|RAM|SEAT|RENAULT|PEUGEOT|SUZUKI|MITSUBISHI)\b/i
            ],
            modelo: [/(?:Modelo|Descripci[oó]n|Tipo)[:\s]*([A-Z0-9\s\-]{3,30})/i],
            año: [
                /A[ñn]o[:\s]*(\d{4})/i,
                /Modelo[:\s]*(\d{4})/i,
                /\b(20[0-2]\d)\b/ // Años 2000-2029
            ],
            placas: [/Placas?[:\s]*([A-Z]{2,3}[\-\s]?[A-Z0-9]{2,4}[\-\s]?[A-Z0-9]{1,3})/i],
            serie: [
                /(?:No\.?\s*de\s*)?Serie[:\s]*([A-HJ-NPR-Z0-9]{17})/i,
                /VIN[:\s]*([A-HJ-NPR-Z0-9]{17})/i,
                /\b([A-HJ-NPR-Z0-9]{17})\b/ // VIN sin etiqueta (17 chars alfanuméricos sin I, O, Q)
            ]
        };

        let numeroPoliza: string | null = null;
        let aseguradora: string | null = null;
        let fechaInicioVigencia: Date | null = null;
        let fechaFinVigencia: Date | null = null;
        let primerPago: number | null = null;
        let segundoPago: number | null = null;
        let primaTotal: number | null = null;
        let titular: string | null = null;
        let vehiculo: any = null;

        // Helper para buscar con múltiples patrones
        const buscarConPatrones = (
            patronesArr: RegExp | RegExp[],
            texto: string
        ): RegExpMatchArray | null => {
            const arr = Array.isArray(patronesArr) ? patronesArr : [patronesArr];
            for (const patron of arr) {
                const match = texto.match(patron);
                if (match) return match;
            }
            return null;
        };

        // Buscar número de póliza
        const matchPoliza = buscarConPatrones(patrones.numeroPoliza, markdown);
        if (matchPoliza) {
            numeroPoliza = matchPoliza[1].trim();
            datosEncontrados.push('numeroPoliza');
        } else {
            datosFaltantes.push('numeroPoliza');
        }

        // Buscar aseguradora
        const matchAseg = markdown.match(patrones.aseguradora);
        if (matchAseg) {
            aseguradora = normalizarAseguradora(matchAseg[1] ?? matchAseg[0]);
            datosEncontrados.push('aseguradora');
        } else {
            datosFaltantes.push('aseguradora');
        }

        // Buscar fechas
        const matchFechaInicio = buscarConPatrones(patrones.fechaInicio, markdown);
        if (matchFechaInicio) {
            fechaInicioVigencia = parsearFecha(matchFechaInicio[1]);
            if (fechaInicioVigencia) datosEncontrados.push('fechaInicioVigencia');
        }
        if (!fechaInicioVigencia) datosFaltantes.push('fechaInicioVigencia');

        const matchFechaFin = buscarConPatrones(patrones.fechaFin, markdown);
        if (matchFechaFin) {
            fechaFinVigencia = parsearFecha(matchFechaFin[1]);
            if (fechaFinVigencia) datosEncontrados.push('fechaFinVigencia');
        }
        if (!fechaFinVigencia) datosFaltantes.push('fechaFinVigencia');

        // Buscar pagos - distinguir entre primer pago y subsecuentes
        const matchPrimerPago = buscarConPatrones(patrones.primerPago, markdown);
        if (matchPrimerPago) {
            primerPago = parsearMonto(matchPrimerPago[1]);
            if (primerPago) datosEncontrados.push('primerPago');
        }
        if (!primerPago) datosFaltantes.push('primerPago');

        const matchSegundoPago = buscarConPatrones(patrones.segundoPago, markdown);
        if (matchSegundoPago) {
            segundoPago = parsearMonto(matchSegundoPago[1]);
            if (segundoPago) datosEncontrados.push('segundoPago');
        }
        if (!segundoPago) datosFaltantes.push('segundoPago');

        const matchPrimaTotal = buscarConPatrones(patrones.primaTotal, markdown);
        if (matchPrimaTotal) {
            primaTotal = parsearMonto(matchPrimaTotal[1]);
            if (primaTotal) datosEncontrados.push('primaTotal');
        }

        // Buscar titular
        const matchTitular = buscarConPatrones(patrones.titular, markdown);
        if (matchTitular) {
            titular = matchTitular[1].trim();
            datosEncontrados.push('titular');
        }

        // Buscar datos del vehículo
        const matchMarca = buscarConPatrones(patrones.marca, markdown);
        const matchModelo = buscarConPatrones(patrones.modelo, markdown);
        const matchAño = buscarConPatrones(patrones.año, markdown);
        const matchPlacas = buscarConPatrones(patrones.placas, markdown);
        const matchSerie = buscarConPatrones(patrones.serie, markdown);

        if (matchMarca ?? matchModelo ?? matchAño ?? matchPlacas ?? matchSerie) {
            vehiculo = {
                marca: matchMarca ? matchMarca[1].trim().toUpperCase() : null,
                submarca: matchModelo ? matchModelo[1].trim().toUpperCase() : null,
                año: matchAño ? parseInt(matchAño[1]) : null,
                placas: matchPlacas ? matchPlacas[1].trim().toUpperCase() : null,
                serie: matchSerie ? matchSerie[1].trim().toUpperCase() : null
            };
            if (vehiculo.marca) datosEncontrados.push('vehiculo.marca');
            if (vehiculo.submarca) datosEncontrados.push('vehiculo.submarca');
            if (vehiculo.año) datosEncontrados.push('vehiculo.año');
            if (vehiculo.placas) datosEncontrados.push('vehiculo.placas');
            if (vehiculo.serie) datosEncontrados.push('vehiculo.serie');
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
            segundoPago,
            primaMensual: null,
            primaTotal,
            primaNeta: null,
            titular,
            telefono: null,
            rfc: null,
            correo: null,
            domicilio: null,
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
        const numeroPoliza = jsonData.numeroPoliza?.toString()?.trim() ?? null;
        if (numeroPoliza) datosEncontrados.push('numeroPoliza');
        else datosFaltantes.push('numeroPoliza');

        const aseguradoraRaw = jsonData.aseguradora?.toString()?.trim() ?? null;
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

        const titular = jsonData.titular?.toString()?.trim() ?? null;
        if (titular) datosEncontrados.push('titular');

        // Datos adicionales del titular
        const primaNeta = parsearMonto(jsonData.primaNeta?.toString());
        if (primaNeta) datosEncontrados.push('primaNeta');

        const telefono = jsonData.telefono?.toString()?.trim() ?? null;
        if (telefono) datosEncontrados.push('telefono');

        const rfc = jsonData.rfc?.toString()?.trim()?.toUpperCase() ?? null;
        if (rfc) datosEncontrados.push('rfc');

        const correo = jsonData.correo?.toString()?.trim()?.toLowerCase() ?? null;
        if (correo) datosEncontrados.push('correo');

        // Domicilio
        let domicilio = null;
        if (jsonData.domicilio) {
            domicilio = {
                calle: jsonData.domicilio.calle?.toString()?.trim() ?? null,
                colonia: jsonData.domicilio.colonia?.toString()?.trim() ?? null,
                municipio: jsonData.domicilio.municipio?.toString()?.trim() ?? null,
                estado: jsonData.domicilio.estado?.toString()?.trim() ?? null,
                cp: jsonData.domicilio.cp?.toString()?.trim() ?? null
            };
            if (domicilio.calle || domicilio.colonia || domicilio.municipio) {
                datosEncontrados.push('domicilio');
            }
        }

        // Datos del vehículo
        let vehiculo = null;
        if (jsonData.vehiculo) {
            vehiculo = {
                marca: jsonData.vehiculo.marca?.toString()?.trim()?.toUpperCase() ?? null,
                submarca: jsonData.vehiculo.submarca?.toString()?.trim()?.toUpperCase() ?? null,
                año: parseInt(jsonData.vehiculo.año) || null,
                placas: jsonData.vehiculo.placas?.toString()?.trim()?.toUpperCase() ?? null,
                serie: jsonData.vehiculo.serie?.toString()?.trim()?.toUpperCase() ?? null
            };

            if (vehiculo.marca) datosEncontrados.push('vehiculo.marca');
            if (vehiculo.submarca) datosEncontrados.push('vehiculo.submarca');
            if (vehiculo.año) datosEncontrados.push('vehiculo.año');
            if (vehiculo.placas) datosEncontrados.push('vehiculo.placas');
            if (vehiculo.serie) datosEncontrados.push('vehiculo.serie');
        }

        // Calcular nivel de confianza - ahora basado en titular también
        const camposEsenciales = ['numeroPoliza', 'aseguradora', 'fechaInicioVigencia', 'titular'];
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
            primaNeta,
            titular,
            telefono,
            rfc,
            correo,
            domicilio,
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
        mimeType = 'image/jpeg'
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
            primaNeta: null,
            titular: null,
            telefono: null,
            rfc: null,
            correo: null,
            domicilio: null,
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
            if (!combinado.primaNeta && resultado.primaNeta) {
                combinado.primaNeta = resultado.primaNeta;
            }
            if (!combinado.titular && resultado.titular) {
                combinado.titular = resultado.titular;
            }
            if (!combinado.telefono && resultado.telefono) {
                combinado.telefono = resultado.telefono;
            }
            if (!combinado.rfc && resultado.rfc) {
                combinado.rfc = resultado.rfc;
            }
            if (!combinado.correo && resultado.correo) {
                combinado.correo = resultado.correo;
            }
            if (!combinado.domicilio && resultado.domicilio) {
                combinado.domicilio = resultado.domicilio;
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
    instance ??= new MistralOCRService();
    return instance;
}

export default MistralOCRService;
