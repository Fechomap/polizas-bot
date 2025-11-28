/**
 * WhatsAppService - Servicio para generar URLs de WhatsApp con mensajes pre-formateados
 *
 * Responsabilidad única: Construcción de URLs y mensajes para WhatsApp
 */

import logger from '../../utils/logger';

export interface IPolicyInfo {
    numeroPoliza: string;
    titular: string;
    telefono: string;
    marca?: string;
    submarca?: string;
    año?: string | number;
    color?: string;
    serie?: string;
    placas?: string;
    aseguradora?: string;
    agenteCotizador?: string;
    totalServicios?: number;
    ultimoServicio?: string | Date;
    origenDestinoUltimo?: string;
    totalPagos?: number;
}

export interface IServiceInfo {
    expediente?: string;
    origen?: string;
    destino?: string;
    googleMapsUrl?: string;
}

export interface IWhatsAppMessage {
    url: string;
    telefono: string;
    mensaje: string;
}

class WhatsAppService {
    private static instance: WhatsAppService;
    private readonly baseUrl = 'https://wa.me';

    private constructor() {}

    static getInstance(): WhatsAppService {
        if (!WhatsAppService.instance) {
            WhatsAppService.instance = new WhatsAppService();
        }
        return WhatsAppService.instance;
    }

    /**
     * Normaliza un número de teléfono mexicano a formato internacional
     */
    normalizePhoneNumber(telefono: string): string {
        const cleaned = telefono.replace(/\D/g, '');

        if (cleaned.startsWith('52') && cleaned.length === 12) {
            return cleaned;
        }

        if (cleaned.length === 10) {
            return `52${cleaned}`;
        }

        logger.warn('Número de teléfono con formato inesperado:', { telefono, cleaned });
        return cleaned;
    }

    /**
     * Formatea una fecha para mostrar
     */
    private formatDate(date: string | Date | undefined): string {
        if (!date) return '';

        const d = typeof date === 'string' ? new Date(date) : date;
        if (isNaN(d.getTime())) return '';

        return d.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    /**
     * Genera el mensaje de WhatsApp con información completa de la póliza
     */
    buildPolicyMessage(policy: IPolicyInfo, serviceInfo?: IServiceInfo): string {
        const lines: string[] = [];

        // Encabezado
        lines.push('📋 *Información de la Póliza*');
        lines.push(`Número: ${policy.numeroPoliza}`);
        lines.push(`Titular: ${policy.titular}`);
        lines.push(`📞 Cel: ${policy.telefono}`);
        lines.push('');

        // Datos del vehículo
        lines.push('🚗 *Datos del Vehículo:*');
        if (policy.marca) lines.push(`Marca: ${policy.marca}`);
        if (policy.submarca) lines.push(`Submarca: ${policy.submarca}`);
        if (policy.año) lines.push(`Año: ${policy.año}`);
        if (policy.color) lines.push(`Color: ${policy.color}`);
        if (policy.serie) lines.push(`Serie: ${policy.serie}`);
        if (policy.placas) lines.push(`Placas: ${policy.placas}`);
        lines.push('');

        // Aseguradora y agente
        if (policy.aseguradora) lines.push(`Aseguradora: ${policy.aseguradora}`);
        if (policy.agenteCotizador) lines.push(`Agente: ${policy.agenteCotizador}`);
        lines.push('');

        // Servicios
        if (policy.totalServicios !== undefined) {
            lines.push(`Servicios: ${policy.totalServicios}`);
        }

        if (policy.ultimoServicio) {
            const fechaFormateada = this.formatDate(policy.ultimoServicio);
            if (fechaFormateada) {
                lines.push(`Último Servicio: ${fechaFormateada}`);
            }
        }

        if (policy.origenDestinoUltimo) {
            lines.push(`Origen/Destino: ${policy.origenDestinoUltimo}`);
        }
        lines.push('');

        // Pagos
        if (policy.totalPagos !== undefined && policy.totalPagos > 0) {
            lines.push(`Pagos: ${policy.totalPagos} pago(s)`);
        }

        // Información del servicio actual (si existe)
        if (serviceInfo) {
            lines.push('');
            lines.push('📍 *Servicio Actual:*');
            if (serviceInfo.expediente) {
                lines.push(`Expediente: ${serviceInfo.expediente}`);
            }
            if (serviceInfo.origen) {
                lines.push(`Origen: ${serviceInfo.origen}`);
            }
            if (serviceInfo.destino) {
                lines.push(`Destino: ${serviceInfo.destino}`);
            }
            if (serviceInfo.googleMapsUrl) {
                lines.push(`Ruta: ${serviceInfo.googleMapsUrl}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Genera una URL de WhatsApp con el mensaje pre-formateado
     */
    generateWhatsAppUrl(telefono: string, mensaje: string): string {
        const normalizedPhone = this.normalizePhoneNumber(telefono);
        const encodedMessage = encodeURIComponent(mensaje);

        return `${this.baseUrl}/${normalizedPhone}?text=${encodedMessage}`;
    }

    /**
     * Genera URL completa de WhatsApp con información de póliza
     */
    generatePolicyWhatsApp(policy: IPolicyInfo, serviceInfo?: IServiceInfo): IWhatsAppMessage {
        const mensaje = this.buildPolicyMessage(policy, serviceInfo);
        const url = this.generateWhatsAppUrl(policy.telefono, mensaje);

        logger.info('URL de WhatsApp generada', {
            numeroPoliza: policy.numeroPoliza,
            telefono: policy.telefono,
            urlLength: url.length
        });

        return {
            url,
            telefono: policy.telefono,
            mensaje
        };
    }

    /**
     * Genera un mensaje simple de WhatsApp
     */
    generateSimpleWhatsApp(telefono: string, mensaje: string): IWhatsAppMessage {
        const url = this.generateWhatsAppUrl(telefono, mensaje);

        return {
            url,
            telefono,
            mensaje
        };
    }

    /**
     * Genera botón inline de Telegram que abre WhatsApp
     */
    generateTelegramButton(whatsappData: IWhatsAppMessage): { text: string; url: string } {
        return {
            text: '📱 Enviar WhatsApp',
            url: whatsappData.url
        };
    }
}

export const whatsAppService = WhatsAppService.getInstance();
export default WhatsAppService;
