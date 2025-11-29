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

class VehicleVisionService {
    private apiKey: string;
    private baseUrl = 'https://api.mistral.ai/v1';
    private model = 'mistral-large-latest';

    constructor() {
        this.apiKey = process.env.MISTRAL_API_KEY ?? '';
    }

    isConfigured(): boolean {
        return !!this.apiKey;
    }

    /**
     * Analiza una imagen y extrae datos segun su tipo
     */
    async analizarImagen(imageBuffer: Buffer): Promise<IResultadoAnalisis> {
        if (!this.isConfigured()) {
            return { success: false, tipo: 'otro', error: 'API no configurada' };
        }

        try {
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

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: dataUri }
                        ]
                    }],
                    max_tokens: 800,
                    temperature: 0
                })
            });

            if (!response.ok) {
                return { success: false, tipo: 'otro', error: `API error: ${response.status}` };
            }

            const data = await response.json();
            const contenido = data.choices?.[0]?.message?.content ?? '';

            return this.parsearRespuesta(contenido);
        } catch (error) {
            console.error('[VehicleVision] Error:', error);
            return { success: false, tipo: 'otro', error: 'Error procesando imagen' };
        }
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
                    marca: json.datos.marca?.toUpperCase()?.trim() || null,
                    submarca: json.datos.submarca?.toUpperCase()?.trim() || null,
                    año: this.validarAño(json.datos.año),
                    color: json.datos.color?.toUpperCase()?.trim() || null,
                    placas: this.limpiarPlacas(json.datos.placas)
                };
            }

            if (tipo === 'vehiculo') {
                resultado.colorDetectado = json.colorDetectado?.toUpperCase()?.trim() || null;
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
