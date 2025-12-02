// src/services/VehicleVisionService.ts
// Servicio simplificado de IA para extraccion de datos de vehiculos
// Usa Mistral Vision para analizar imagenes

import fetch from 'node-fetch';

export interface IDatosVehiculo {
    serie: string | null;
    marca: string | null;
    submarca: string | null;
    año: number | null;
    color: string | null;
    placas: string | null;
}

export interface IResultadoAnalisis {
    success: boolean;
    tipo: 'tarjeta' | 'vehiculo' | 'otro';
    datos?: IDatosVehiculo;
    colorDetectado?: string;
    placasDetectadas?: string[];
    error?: string;
}

// Configuración de rate limiting
const RATE_LIMIT = {
    MAX_CONCURRENT: 3, // Máximo de llamadas concurrentes
    MIN_INTERVAL_MS: 500, // Mínimo entre llamadas (evita 429)
    MAX_RETRIES: 2 // Reintentos en caso de error 429
};

class VehicleVisionService {
    private apiKey: string;
    private baseUrl = 'https://api.mistral.ai/v1';
    private model = 'mistral-large-latest';

    // Rate limiting state
    private activeRequests = 0;
    private lastRequestTime = 0;
    private requestQueue: Array<() => void> = [];

    constructor() {
        this.apiKey = process.env.MISTRAL_API_KEY ?? '';
    }

    /**
     * Throttle para controlar rate de llamadas a la API
     */
    private async throttle(): Promise<void> {
        // Esperar si hay muchas requests concurrentes
        while (this.activeRequests >= RATE_LIMIT.MAX_CONCURRENT) {
            await new Promise<void>(resolve => {
                this.requestQueue.push(resolve);
            });
        }

        // Esperar intervalo mínimo entre requests
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        if (elapsed < RATE_LIMIT.MIN_INTERVAL_MS) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.MIN_INTERVAL_MS - elapsed));
        }

        this.activeRequests++;
        this.lastRequestTime = Date.now();
    }

    private releaseThrottle(): void {
        this.activeRequests--;
        const next = this.requestQueue.shift();
        if (next) next();
    }

    isConfigured(): boolean {
        return !!this.apiKey;
    }

    /**
     * Analiza una imagen y extrae datos segun su tipo
     * Incluye rate limiting y reintentos para errores 429
     */
    async analizarImagen(imageBuffer: Buffer): Promise<IResultadoAnalisis> {
        if (!this.isConfigured()) {
            return { success: false, tipo: 'otro', error: 'API no configurada' };
        }

        const base64 = imageBuffer.toString('base64');
        const dataUri = `data:image/jpeg;base64,${base64}`;

        const prompt = `Analiza esta imagen y determina si es:
1. TARJETA DE CIRCULACION - documento oficial de vehiculo
2. FOTO DE VEHICULO - foto de un auto/camioneta

Si es TARJETA, extrae estos datos:
- serie: NIV/Numero de Serie (17 caracteres)
- marca: Fabricante (NISSAN, FORD, etc)
- submarca: Modelo (SENTRA, AVEO, etc)
- año: Año modelo (4 digitos)
- color: Color del vehiculo
- placas: Numero de placa

Si es FOTO DE VEHICULO:
- color: Color principal del auto
- placas: Placas visibles (si las hay)

Responde SOLO con JSON:
{
  "tipo": "tarjeta" | "vehiculo" | "otro",
  "datos": { "serie": "", "marca": "", "submarca": "", "año": null, "color": "", "placas": "" },
  "colorDetectado": "COLOR",
  "placasDetectadas": ["ABC-123"]
}`;

        // Intentar con reintentos para errores 429
        for (let attempt = 0; attempt <= RATE_LIMIT.MAX_RETRIES; attempt++) {
            try {
                // Aplicar throttle antes de cada request
                await this.throttle();

                const response = await fetch(`${this.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify({
                        model: this.model,
                        messages: [
                            {
                                role: 'user',
                                content: [
                                    { type: 'text', text: prompt },
                                    { type: 'image_url', image_url: dataUri }
                                ]
                            }
                        ],
                        max_tokens: 800,
                        temperature: 0
                    })
                });

                this.releaseThrottle();

                // Retry en caso de rate limit (429)
                if (response.status === 429 && attempt < RATE_LIMIT.MAX_RETRIES) {
                    const retryAfter = parseInt(response.headers.get('retry-after') ?? '2');
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    continue;
                }

                if (!response.ok) {
                    return { success: false, tipo: 'otro', error: `API error: ${response.status}` };
                }

                const data = await response.json();
                const contenido = data.choices?.[0]?.message?.content ?? '';

                return this.parsearRespuesta(contenido);
            } catch (error) {
                this.releaseThrottle();

                // Solo reintentar en errores de red
                if (attempt < RATE_LIMIT.MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                    continue;
                }

                return { success: false, tipo: 'otro', error: 'Error procesando imagen' };
            }
        }

        return { success: false, tipo: 'otro', error: 'Max reintentos excedidos' };
    }

    private parsearRespuesta(contenido: string): IResultadoAnalisis {
        try {
            const jsonMatch = contenido.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return { success: false, tipo: 'otro', error: 'Sin JSON' };
            }

            const json = JSON.parse(jsonMatch[0]);
            const tipo = ['tarjeta', 'vehiculo'].includes(json.tipo) ? json.tipo : 'otro';

            const resultado: IResultadoAnalisis = {
                success: true,
                tipo
            };

            if (tipo === 'tarjeta' && json.datos) {
                resultado.datos = {
                    serie: this.limpiarSerie(json.datos.serie),
                    marca: json.datos.marca?.toUpperCase()?.trim() ?? null,
                    submarca: json.datos.submarca?.toUpperCase()?.trim() ?? null,
                    año: this.validarAño(json.datos.año),
                    color: json.datos.color?.toUpperCase()?.trim() ?? null,
                    placas: this.limpiarPlacas(json.datos.placas)
                };
            }

            if (tipo === 'vehiculo') {
                resultado.colorDetectado = json.colorDetectado?.toUpperCase()?.trim() ?? null;
                resultado.placasDetectadas = Array.isArray(json.placasDetectadas)
                    ? json.placasDetectadas.map((p: string) => p.toUpperCase().trim())
                    : [];
            }

            return resultado;
        } catch {
            return { success: false, tipo: 'otro', error: 'Error parseando respuesta' };
        }
    }

    private limpiarSerie(serie: string | null): string | null {
        if (!serie) return null;
        const clean = serie.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        return clean.length === 17 ? clean : null;
    }

    private limpiarPlacas(placas: string | null): string | null {
        if (!placas) return null;
        const clean = placas.replace(/\s+/g, '-').toUpperCase().trim();
        // Placas mexicanas: 5-8 caracteres
        const sinGuiones = clean.replace(/-/g, '');
        if (sinGuiones.length < 5 || sinGuiones.length > 8) return null;
        return clean;
    }

    private validarAño(año: any): number | null {
        const num = parseInt(año);
        if (isNaN(num)) return null;
        const actual = new Date().getFullYear();
        return num >= 1990 && num <= actual + 1 ? num : null;
    }
}

let instance: VehicleVisionService | null = null;

export function getVehicleVisionService(): VehicleVisionService {
    instance ??= new VehicleVisionService();
    return instance;
}

export default VehicleVisionService;
