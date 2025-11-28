// src/services/MistralVisionService.ts
// Servicio de OCR de imágenes usando Mistral OCR + Pixtral para extracción de datos de tarjetas de circulación
// Usa flujo de 2 pasos recomendado por Mistral:
// 1. mistral-ocr-latest: Extrae texto con alta precisión (incluso en baja calidad)
// 2. pixtral-12b-latest: Parsea el texto extraído a JSON estructurado

import fetch from 'node-fetch';

/**
 * Datos extraídos de una tarjeta de circulación mexicana
 */
export interface IDatosTarjetaCirculacion {
    serie: string | null; // VIN - 17 caracteres
    marca: string | null;
    submarca: string | null; // Modelo/Tipo
    año: number | null;
    color: string | null;
    placas: string | null;
    titular: string | null; // Nombre del propietario
    rfc: string | null;
    // Dirección (opcional)
    calle: string | null;
    colonia: string | null;
    municipio: string | null;
    estadoRegion: string | null;
    cp: string | null;
    // Metadatos
    confianza: number; // 0-100 nivel de confianza
    datosEncontrados: string[];
    datosFaltantes: string[];
}

/**
 * Resultado del análisis de imagen
 */
export interface IResultadoVision {
    success: boolean;
    datos: IDatosTarjetaCirculacion | null;
    error?: string;
    rawResponse?: string;
}

/**
 * Resultado de detección de placas en foto de vehículo
 */
export interface IResultadoDeteccionPlacas {
    success: boolean;
    placasDetectadas: string[]; // Puede detectar múltiples
    confianza: number;
    error?: string;
}

/**
 * Servicio de Vision con Mistral OCR + Pixtral
 * Usa flujo de 2 pasos para máxima precisión:
 * - mistral-ocr-latest: OCR especializado para documentos (mejor en baja calidad)
 * - pixtral-12b-latest: Visión para detección de placas en fotos
 */
class MistralVisionService {
    private apiKey: string;
    private baseUrl = 'https://api.mistral.ai/v1';
    private modelOCR = 'mistral-ocr-latest'; // OCR especializado para documentos
    private modelVision = 'pixtral-12b-latest'; // Visión para fotos de vehículos

    constructor() {
        this.apiKey = process.env.MISTRAL_API_KEY ?? '';
        if (!this.apiKey) {
            console.warn('[MistralVision] MISTRAL_API_KEY no está configurada');
        }
    }

    /**
     * Detecta si un string tiene formato de RFC mexicano
     * RFC persona física: 4 letras + 6 dígitos (fecha) + 3 caracteres = 13 chars
     * RFC persona moral: 3 letras + 6 dígitos + 3 caracteres = 12 chars
     */
    private esRFC(valor: string): boolean {
        if (!valor) return false;
        const clean = valor.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        // RFC tiene 12-13 caracteres con formato específico
        if (clean.length < 12 || clean.length > 13) return false;
        // Patrón RFC: letras iniciales + 6 dígitos de fecha + homoclave
        // Persona física: XXXX000000XXX
        // Persona moral: XXX000000XXX
        const rfcPattern = /^[A-Z]{3,4}\d{6}[A-Z0-9]{3}$/;
        return rfcPattern.test(clean);
    }

    /**
     * Valida si un string es una placa vehicular mexicana válida
     * Placas mexicanas: máximo 7-8 caracteres alfanuméricos
     * Formatos comunes: ABC-123, ABC-1234, AB-123-C, 123-ABC
     */
    private esPlacaValida(valor: string): boolean {
        if (!valor) return false;
        const clean = valor.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        // Placas tienen entre 5 y 8 caracteres
        if (clean.length < 5 || clean.length > 8) return false;
        // No debe ser un RFC
        if (this.esRFC(valor)) return false;
        // Debe tener al menos una letra y un número
        const tieneLetras = /[A-Z]/.test(clean);
        const tieneNumeros = /[0-9]/.test(clean);
        return tieneLetras && tieneNumeros;
    }

    /**
     * Verifica si el servicio está configurado
     */
    isConfigured(): boolean {
        return !!this.apiKey;
    }

    /**
     * Extrae datos de una imagen de tarjeta de circulación mexicana
     * Usa flujo de 2 pasos:
     * 1. OCR con mistral-ocr-latest para extraer todo el texto
     * 2. Pixtral para parsear el texto a JSON estructurado
     */
    async extraerDatosTarjetaCirculacion(
        imageBuffer: Buffer,
        mimeType = 'image/jpeg'
    ): Promise<IResultadoVision> {
        if (!this.isConfigured()) {
            return {
                success: false,
                datos: null,
                error: 'El servicio Mistral Vision no está configurado. Falta MISTRAL_API_KEY.'
            };
        }

        try {
            console.log(
                `[MistralVision] Procesando tarjeta de circulación, tamaño: ${imageBuffer.length} bytes`
            );

            // Convertir a base64
            const base64Data = imageBuffer.toString('base64');
            const dataUri = `data:${mimeType};base64,${base64Data}`;

            // PASO 1: Extraer texto con OCR dedicado
            console.log('[MistralVision] Paso 1: Extrayendo texto con mistral-ocr-latest...');
            const ocrResult = await this.extraerTextoOCR(dataUri);

            if (!ocrResult.success || !ocrResult.texto) {
                console.warn('[MistralVision] OCR falló, intentando con Pixtral directo...');
                // Fallback: usar Pixtral directamente si OCR falla
                return await this.extraerConPixtralDirecto(dataUri);
            }

            console.log(`[MistralVision] Texto OCR extraído (${ocrResult.texto.length} chars)`);

            // PASO 2: Parsear texto a JSON con Pixtral
            console.log('[MistralVision] Paso 2: Parseando texto con pixtral-12b-latest...');
            const parseResult = await this.parsearTextoConPixtral(ocrResult.texto, dataUri);

            return parseResult;
        } catch (error) {
            console.error('[MistralVision] Error procesando imagen:', error);
            return {
                success: false,
                datos: null,
                error: error instanceof Error ? error.message : 'Error desconocido'
            };
        }
    }

    /**
     * PASO 1: Extrae texto de imagen usando mistral-ocr-latest
     */
    private async extraerTextoOCR(
        dataUri: string
    ): Promise<{ success: boolean; texto: string | null; error?: string }> {
        try {
            const response = await fetch(`${this.baseUrl}/ocr`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.modelOCR,
                    document: {
                        type: 'image_url',
                        image_url: dataUri
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(
                    `[MistralVision] Error en OCR API: ${response.status} - ${errorText}`
                );
                return { success: false, texto: null, error: `Error OCR: ${response.status}` };
            }

            const data = await response.json();

            // El OCR devuelve páginas con contenido markdown
            let textoExtraido = '';
            if (data.pages && Array.isArray(data.pages)) {
                for (const page of data.pages) {
                    if (page.markdown) {
                        textoExtraido += page.markdown + '\n';
                    }
                }
            }

            if (!textoExtraido.trim()) {
                return { success: false, texto: null, error: 'OCR no extrajo texto' };
            }

            return { success: true, texto: textoExtraido.trim() };
        } catch (error) {
            console.error('[MistralVision] Error en extraerTextoOCR:', error);
            return {
                success: false,
                texto: null,
                error: error instanceof Error ? error.message : 'Error'
            };
        }
    }

    /**
     * PASO 2: Parsea el texto OCR a JSON estructurado usando Pixtral
     */
    private async parsearTextoConPixtral(
        textoOCR: string,
        dataUri: string
    ): Promise<IResultadoVision> {
        const prompt = `<role>
Eres un experto en extracción de datos de documentos vehiculares mexicanos.
</role>

<task>
Analiza el siguiente texto extraído de una TARJETA DE CIRCULACIÓN mexicana y extrae los datos en formato JSON.
</task>

<ocr_text>
${textoOCR}
</ocr_text>

<fields>
- serie: NIV/Número de serie (17 caracteres alfanuméricos)
- marca: Fabricante (NISSAN, FORD, CHEVROLET, etc.)
- submarca: Modelo/Línea del vehículo (NP300, SENTRA, etc.)
- año: Año modelo (4 dígitos)
- color: Color del vehículo (SOLO si está explícitamente indicado, NO inferir)
- placas: Número de placa vehicular (MÁXIMO 7-8 caracteres, formato: ABC-123 o ABC-1234)
- titular: Nombre del propietario (puede ser persona física o razón social)
- rfc: RFC del propietario (12-13 caracteres, formato: XXXX000000XXX)
- calle, colonia, municipio, estadoRegion, cp: Datos de dirección si están presentes
</fields>

<rules>
- SOLO extrae datos que estén EXPLÍCITAMENTE en el texto OCR
- NUNCA inventes datos que no aparezcan en el texto
- Si un campo no está en el texto, usa null
- El NIV/SERIE debe tener exactamente 17 caracteres
- Transcribe EXACTAMENTE como aparece, sin corregir
- IMPORTANTE: NO confundir PLACAS con RFC:
  * PLACAS: Máximo 7-8 caracteres (ej: ABC-123, NXE-7642, 123-ABC)
  * RFC: 12-13 caracteres con formato XXXX000000XXX (ej: CÁPC880515GA5, PELJ850101ABC)
  * Si un valor tiene 12-13 caracteres y sigue patrón de RFC, es RFC, NO placas
</rules>

<output>
Responde SOLO con JSON válido:
{
  "serie": "string o null",
  "marca": "string o null",
  "submarca": "string o null",
  "año": number o null,
  "color": "string o null",
  "placas": "string o null",
  "titular": "string o null",
  "rfc": "string o null",
  "calle": "string o null",
  "colonia": "string o null",
  "municipio": "string o null",
  "estadoRegion": "string o null",
  "cp": "string o null"
}
</output>`;

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.modelVision,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                { type: 'image_url', image_url: dataUri }
                            ]
                        }
                    ],
                    max_tokens: 2000,
                    temperature: 0,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(
                    `[MistralVision] Error en Pixtral: ${response.status} - ${errorText}`
                );
                return {
                    success: false,
                    datos: null,
                    error: `Error Pixtral: ${response.status}`
                };
            }

            const data = await response.json();
            const contenido = data.choices?.[0]?.message?.content;

            if (!contenido) {
                return {
                    success: false,
                    datos: null,
                    error: 'Pixtral no devolvió contenido'
                };
            }

            console.log(`[MistralVision] Respuesta Pixtral: ${contenido.substring(0, 300)}...`);

            const datosExtraidos = this.parsearRespuestaTarjeta(contenido);

            return {
                success: true,
                datos: datosExtraidos,
                rawResponse: `OCR:\n${textoOCR}\n\nJSON:\n${contenido}`
            };
        } catch (error) {
            console.error('[MistralVision] Error en parsearTextoConPixtral:', error);
            return {
                success: false,
                datos: null,
                error: error instanceof Error ? error.message : 'Error'
            };
        }
    }

    /**
     * Fallback: Usa Pixtral directamente si OCR falla
     */
    private async extraerConPixtralDirecto(dataUri: string): Promise<IResultadoVision> {
        const prompt = this.buildPromptTarjetaCirculacion();

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.modelVision,
                    messages: [
                        {
                            role: 'system',
                            content:
                                'Eres un experto en OCR de documentos vehiculares mexicanos. Responde SOLO con JSON válido.'
                        },
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                { type: 'image_url', image_url: dataUri }
                            ]
                        }
                    ],
                    max_tokens: 2000,
                    temperature: 0,
                    response_format: { type: 'json_object' }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(
                    `[MistralVision] Error en Pixtral directo: ${response.status} - ${errorText}`
                );
                return {
                    success: false,
                    datos: null,
                    error: `Error API: ${response.status}`
                };
            }

            const data = await response.json();
            const contenido = data.choices?.[0]?.message?.content;

            if (!contenido) {
                return {
                    success: false,
                    datos: null,
                    error: 'Pixtral no devolvió contenido'
                };
            }

            console.log(
                `[MistralVision] Respuesta Pixtral directo: ${contenido.substring(0, 300)}...`
            );

            const datosExtraidos = this.parsearRespuestaTarjeta(contenido);

            return {
                success: true,
                datos: datosExtraidos,
                rawResponse: contenido
            };
        } catch (error) {
            console.error('[MistralVision] Error en extraerConPixtralDirecto:', error);
            return {
                success: false,
                datos: null,
                error: error instanceof Error ? error.message : 'Error'
            };
        }
    }

    /**
     * Detecta placas en una foto de vehículo
     */
    async detectarPlacasEnFoto(
        imageBuffer: Buffer,
        mimeType = 'image/jpeg'
    ): Promise<IResultadoDeteccionPlacas> {
        if (!this.isConfigured()) {
            return {
                success: false,
                placasDetectadas: [],
                confianza: 0,
                error: 'Servicio no configurado'
            };
        }

        try {
            console.log(
                `[MistralVision] Detectando placas en foto, tamaño: ${imageBuffer.length} bytes`
            );

            const base64Data = imageBuffer.toString('base64');
            const dataUri = `data:${mimeType};base64,${base64Data}`;

            const prompt = `Analiza esta imagen de un vehículo y busca PLACAS VEHICULARES visibles.

Las placas mexicanas tienen formato como:
- ABC-12-34 (formato estándar)
- ABC-123-D (formato con letra final)
- 123-ABC (formato antiguo)
- Pueden ser de cualquier estado de México

IMPORTANTE:
- Solo reporta placas que puedas leer claramente
- Si no hay placas visibles o no se pueden leer, indica "NO_VISIBLE"
- Ignora textos que no sean placas (logos, marcas, etc.)

Responde SOLO con JSON:
{
  "placasDetectadas": ["ABC-123-D"],
  "confianza": 85,
  "notas": "Placa trasera visible"
}

Si no se detectan placas:
{
  "placasDetectadas": [],
  "confianza": 0,
  "notas": "No se detectaron placas legibles"
}`;

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.modelVision,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                { type: 'image_url', image_url: dataUri }
                            ]
                        }
                    ],
                    max_tokens: 500,
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                console.error(`[MistralVision] Error detectando placas: ${response.status}`);
                return {
                    success: false,
                    placasDetectadas: [],
                    confianza: 0,
                    error: `Error API: ${response.status}`
                };
            }

            const data = await response.json();
            const contenido = data.choices?.[0]?.message?.content ?? '';

            return this.parsearRespuestaPlacas(contenido);
        } catch (error) {
            console.error('[MistralVision] Error detectando placas:', error);
            return {
                success: false,
                placasDetectadas: [],
                confianza: 0,
                error: error instanceof Error ? error.message : 'Error desconocido'
            };
        }
    }

    /**
     * Construye el prompt para extracción de tarjeta de circulación
     * Aplicando mejores prácticas de Mistral:
     * - Rol específico al inicio
     * - XML tags para estructura
     * - Few-shot con ejemplo
     * - Instrucciones precisas
     */
    private buildPromptTarjetaCirculacion(): string {
        return `<role>
Eres un experto en extracción de datos de documentos vehiculares mexicanos. Tu tarea es extraer información precisa de tarjetas de circulación.
</role>

<document_type>
TARJETA DE CIRCULACIÓN VEHICULAR MEXICANA - Documento oficial emitido por las secretarías de finanzas estatales.
</document_type>

<fields_to_extract>
Extrae EXACTAMENTE estos campos de la imagen:

1. **NIV/SERIE**: Número de Identificación Vehicular
   - Ubicación: Sección derecha, etiquetado como "NIV" o "No. DE SERIE"
   - Formato: 17 caracteres alfanuméricos (ej: 3N6DD25X8FK038128)

2. **MARCA**: Fabricante del vehículo
   - Ubicación: Sección izquierda, etiquetado como "MARCA"
   - Ejemplos: NISSAN, FORD, CHEVROLET, TOYOTA, VOLKSWAGEN

3. **SUBMARCA/TIPO**: Modelo o línea del vehículo
   - Ubicación: Etiquetado como "VEHÍCULO", "TIPO" o "LÍNEA"
   - Ejemplos: NP300, FOCUS, AVEO, SENTRA, JETTA

4. **MODELO/AÑO**: Año de fabricación
   - Ubicación: Etiquetado como "MODELO"
   - Formato: 4 dígitos (ej: 2015, 2020)

5. **COLOR**: Color del vehículo
   - Ubicación: Puede estar en sección de características
   - IMPORTANTE: Busca específicamente el COLOR, NO confundir con "ORIGEN" (NACIONAL/EXTRANJERO)
   - Ejemplos: BLANCO, NEGRO, ROJO, GRIS, AZUL, PLATA

6. **PLACAS**: Número de placa vehicular
   - Ubicación: Sección derecha inferior, etiquetado como "PLACA"
   - Formato: MÁXIMO 7-8 caracteres (ej: ABC-123, ABC-1234, NXE-7642, 123-ABC)
   - IMPORTANTE: NO confundir con RFC (que tiene 12-13 caracteres)

7. **TITULAR/NOMBRE**: Propietario del vehículo
   - Ubicación: PARTE SUPERIOR del documento (encabezado), etiquetado como "NOMBRE"
   - IMPORTANTE: Puede ser nombre de PERSONA FÍSICA o RAZÓN SOCIAL (empresa)
   - Formato persona física: APELLIDO PATERNO APELLIDO MATERNO NOMBRE(S)
   - Formato persona moral: NOMBRE DE LA EMPRESA SA DE CV

8. **RFC**: Registro Federal de Contribuyentes
   - Ubicación: Debajo del nombre, etiquetado como "R.F.C."
   - Formato: 12-13 caracteres con patrón XXXX000000XXX (ej: PELJ850101ABC, CÁPC880515GA5)
   - IMPORTANTE: El RFC tiene 12-13 caracteres y contiene una fecha (6 dígitos en medio). NO es una placa.
</fields_to_extract>

<example>
Para una tarjeta que muestra:
- NOMBRE: JUAN PEREZ LOPEZ
- R.F.C.: PELJ850101ABC
- MARCA: NISSAN
- VEHÍCULO: SENTRA
- MODELO: 2020
- NIV: 3N1AB7AP5LY123456
- PLACA: ABC-123-D

El JSON sería:
{
  "serie": "3N1AB7AP5LY123456",
  "marca": "NISSAN",
  "submarca": "SENTRA",
  "año": 2020,
  "color": null,
  "placas": "ABC-123-D",
  "titular": "JUAN PEREZ LOPEZ",
  "rfc": "PELJ850101ABC"
}
</example>

<output_format>
Responde SOLO con JSON válido, sin explicaciones ni markdown:
{
  "serie": "string o null",
  "marca": "string o null",
  "submarca": "string o null",
  "año": number o null,
  "color": "string o null",
  "placas": "string o null",
  "titular": "string o null",
  "rfc": "string o null",
  "calle": "string o null",
  "colonia": "string o null",
  "municipio": "string o null",
  "estadoRegion": "string o null",
  "cp": "string o null"
}
</output_format>

<rules>
- SOLO extrae datos que estén EXPLÍCITAMENTE ESCRITOS en el documento
- NUNCA inventes, adivines o infieras datos que no puedas leer directamente
- Si un campo NO APARECE en el documento, DEBE ser null
- Si un campo no es legible, usa null
- El NIV/SERIE siempre tiene 17 caracteres
- El COLOR solo se extrae si hay una etiqueta "COLOR" con un valor - NO inferir el color de la imagen
- El COLOR es diferente al ORIGEN (NACIONAL/EXTRANJERO no son colores)
- Transcribe EXACTAMENTE lo que ves, sin corregir ortografía
- Convierte todo texto a MAYÚSCULAS
- CRÍTICO: NO confundir PLACAS con RFC:
  * PLACAS: Máximo 7-8 caracteres (ej: ABC-123, NXE-7642)
  * RFC: 12-13 caracteres con formato XXXX000000XXX (ej: PELJ850101ABC)
  * Si un valor tiene 12-13 caracteres, es RFC y NO debe ir en placas
</rules>`;
    }

    /**
     * Parsea la respuesta de la tarjeta de circulación
     */
    private parsearRespuestaTarjeta(contenido: string): IDatosTarjetaCirculacion {
        const datosEncontrados: string[] = [];
        const datosFaltantes: string[] = [];

        let jsonData: any = {};

        try {
            // Extraer JSON de la respuesta
            const jsonMatch = contenido.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonData = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.warn('[MistralVision] Error parseando JSON:', e);
        }

        // Extraer y validar serie (VIN)
        let serie: string | null = null;
        if (jsonData.serie) {
            const serieClean = jsonData.serie
                .toString()
                .replace(/[^A-Z0-9]/gi, '')
                .toUpperCase();
            if (serieClean.length === 17) {
                serie = serieClean;
                datosEncontrados.push('serie');
            } else {
                console.warn(
                    `[MistralVision] Serie inválida (${serieClean.length} chars): ${serieClean}`
                );
            }
        }
        if (!serie) datosFaltantes.push('serie');

        // Marca
        const marca = jsonData.marca?.toString()?.trim()?.toUpperCase() ?? null;
        if (marca) datosEncontrados.push('marca');
        else datosFaltantes.push('marca');

        // Submarca
        const submarca = jsonData.submarca?.toString()?.trim()?.toUpperCase() ?? null;
        if (submarca) datosEncontrados.push('submarca');
        else datosFaltantes.push('submarca');

        // Año
        const añoRaw = parseInt(jsonData.año);
        const año = añoRaw >= 1900 && añoRaw <= new Date().getFullYear() + 2 ? añoRaw : null;
        if (año) datosEncontrados.push('año');
        else datosFaltantes.push('año');

        // Color
        const color = jsonData.color?.toString()?.trim()?.toUpperCase() ?? null;
        if (color) datosEncontrados.push('color');
        else datosFaltantes.push('color');

        // RFC - validar longitud (10-13 chars: algunos documentos tienen RFC parcial)
        // NOTA: Se procesa ANTES de placas para poder reasignar si hay confusión
        let rfc: string | null = null;
        if (jsonData.rfc) {
            const rfcClean = jsonData.rfc
                .toString()
                .replace(/[^A-Z0-9]/gi, '')
                .toUpperCase();
            // RFC persona física: 13 chars, persona moral: 12 chars
            // Algunos documentos muestran RFC parcial (10+ chars)
            if (rfcClean.length >= 10 && rfcClean.length <= 13) {
                rfc = rfcClean;
                datosEncontrados.push('rfc');
            }
        }

        // Placas - normalizar formato y validar que no sea RFC
        let placas: string | null = null;
        if (jsonData.placas) {
            const placasRaw = jsonData.placas.toString().trim().toUpperCase().replace(/\s+/g, '-');

            // Verificar si lo que viene como "placas" es en realidad un RFC
            if (this.esRFC(placasRaw)) {
                console.warn(`[MistralVision] Se detectó RFC en campo placas: ${placasRaw}`);
                // Si no tenemos RFC aún, usar este valor como RFC
                if (!rfc) {
                    rfc = placasRaw.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                    datosEncontrados.push('rfc');
                    console.log(`[MistralVision] RFC reasignado desde placas: ${rfc}`);
                }
                datosFaltantes.push('placas');
            } else if (this.esPlacaValida(placasRaw)) {
                placas = placasRaw;
                datosEncontrados.push('placas');
            } else {
                console.warn(`[MistralVision] Placa inválida descartada: ${placasRaw}`);
                datosFaltantes.push('placas');
            }
        } else {
            datosFaltantes.push('placas');
        }

        // Titular
        const titular = jsonData.titular?.toString()?.trim()?.toUpperCase() ?? null;
        if (titular) datosEncontrados.push('titular');

        // Dirección (opcional)
        const calle = jsonData.calle?.toString()?.trim() ?? null;
        const colonia = jsonData.colonia?.toString()?.trim() ?? null;
        const municipio = jsonData.municipio?.toString()?.trim() ?? null;
        const estadoRegion = jsonData.estadoRegion?.toString()?.trim() ?? null;
        const cp = jsonData.cp?.toString()?.trim() ?? null;

        // Calcular confianza basada en campos esenciales
        const camposEsenciales = ['serie', 'marca', 'submarca', 'año', 'color', 'placas'];
        const encontrados = camposEsenciales.filter(c => datosEncontrados.includes(c));
        const confianza = Math.round((encontrados.length / camposEsenciales.length) * 100);

        return {
            serie,
            marca,
            submarca,
            año,
            color,
            placas,
            titular,
            rfc,
            calle,
            colonia,
            municipio,
            estadoRegion,
            cp,
            confianza,
            datosEncontrados,
            datosFaltantes
        };
    }

    /**
     * Parsea la respuesta de detección de placas
     */
    private parsearRespuestaPlacas(contenido: string): IResultadoDeteccionPlacas {
        try {
            const jsonMatch = contenido.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                return {
                    success: true,
                    placasDetectadas: Array.isArray(data.placasDetectadas)
                        ? data.placasDetectadas.map((p: string) => p.toUpperCase().trim())
                        : [],
                    confianza: data.confianza ?? 0
                };
            }
        } catch (e) {
            console.warn('[MistralVision] Error parseando respuesta de placas');
        }

        return {
            success: false,
            placasDetectadas: [],
            confianza: 0,
            error: 'No se pudo parsear respuesta'
        };
    }
}

// Singleton
let instance: MistralVisionService | null = null;

export function getInstance(): MistralVisionService {
    instance ??= new MistralVisionService();
    return instance;
}

export default MistralVisionService;
