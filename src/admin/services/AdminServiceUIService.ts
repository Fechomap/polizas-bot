// src/admin/services/AdminServiceUIService.ts
/**
 * Servicio de UI para el módulo de servicios del admin
 * Responsabilidad única: generación de mensajes y teclados
 */

import { Markup } from 'telegraf';

interface IServiceData {
    numeroExpediente: string;
    fechaServicio?: Date;
    tipoServicio?: string;
    descripcion?: string;
    costo?: number;
    estado?: string;
    proveedor?: string;
}

interface IRegistroData {
    numeroExpediente: string;
    fechaRegistro?: Date;
    tipoRegistro?: string;
    descripcion?: string;
    estado?: string;
}

interface IServiceSearchResult {
    policyId: string;
    numeroPoliza: string;
    titular: string;
    type: 'servicio' | 'registro';
    item: IServiceData | IRegistroData;
    itemIndex: number;
}

/**
 * Nombres amigables para los campos
 */
const FIELD_DISPLAY_NAMES: Record<string, string> = {
    fechaServicio: 'Fecha de Servicio',
    tipoServicio: 'Tipo de Servicio',
    descripcion: 'Descripción',
    costo: 'Costo',
    estado: 'Estado',
    proveedor: 'Proveedor',
    fechaRegistro: 'Fecha de Registro',
    tipoRegistro: 'Tipo de Registro'
};

export class AdminServiceUIService {
    /**
     * Obtiene el nombre amigable de un campo
     */
    getFieldDisplayName(fieldName: string): string {
        return FIELD_DISPLAY_NAMES[fieldName] ?? fieldName;
    }

    /**
     * Genera mensaje de búsqueda por expediente
     */
    generarMensajeBusqueda(): string {
        return `
🔍 *BUSCAR SERVICIO POR EXPEDIENTE*
━━━━━━━━━━━━━━━━━━━━━━

Escribe el **número de expediente** del servicio:

📄 *Ejemplo:* 1043992
📄 *Ejemplo:* EXP-2025-001
📄 *Ejemplo:* SRV123456

💡 **Nota:** Búsqueda directa en servicios y registros
🔍 **Alcance:** Hasta 12 expedientes por póliza

_El sistema encontrará el servicio específico para editar._
        `.trim();
    }

    /**
     * Genera teclado para cancelar búsqueda
     */
    generarTecladoCancelarBusqueda(): ReturnType<typeof Markup.inlineKeyboard> {
        return Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancelar', 'admin_service_menu')]
        ]);
    }

    /**
     * Genera mensaje de sin resultados
     */
    generarMensajeSinResultados(searchTerm: string): string {
        return `
❌ *SIN RESULTADOS*
━━━━━━━━━━━━━━━━━━━━━━

No se encontraron servicios con expediente: "${searchTerm}"

Verifica que:
• El número de expediente sea correcto
• Esté escrito exactamente como aparece
• No tenga espacios adicionales

_Intenta con otro número de expediente._
        `.trim();
    }

    /**
     * Genera teclado para sin resultados
     */
    generarTecladoSinResultados(): ReturnType<typeof Markup.inlineKeyboard> {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Nueva Búsqueda', 'admin_service_edit')],
            [Markup.button.callback('⬅️ Volver', 'admin_service_menu')]
        ]);
    }

    /**
     * Genera mensaje con lista de resultados
     */
    generarMensajeListaResultados(results: IServiceSearchResult[]): string {
        let message = `
🔍 *SERVICIOS ENCONTRADOS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Encontrados: ${results.length} servicios/registros

Selecciona el que deseas editar:

`;

        results.forEach((result, index) => {
            const item = result.item;
            const expediente = item.numeroExpediente;
            const tipoEmoji = result.type === 'servicio' ? '🔧' : '📋';
            const tipoTexto = result.type === 'servicio' ? 'SERVICIO' : 'REGISTRO';
            const fecha =
                result.type === 'servicio'
                    ? (item as IServiceData).fechaServicio
                    : (item as IRegistroData).fechaRegistro;

            message += `${index + 1}. ${tipoEmoji} **${tipoTexto}** - **${expediente}**\n`;
            message += `   Póliza: ${result.numeroPoliza}\n`;
            message += `   Titular: ${result.titular}\n`;
            message += `   Fecha: ${fecha ? new Date(fecha).toLocaleDateString('es-ES') : 'N/A'}\n\n`;
        });

        return message.trim();
    }

    /**
     * Genera teclado con lista de resultados
     */
    generarTecladoListaResultados(
        results: IServiceSearchResult[]
    ): ReturnType<typeof Markup.inlineKeyboard> {
        const buttons: any[][] = [];

        results.forEach((result, index) => {
            const item = result.item;
            const expediente = item.numeroExpediente;
            const tipoEmoji = result.type === 'servicio' ? '🔧' : '📋';
            const tipoTexto = result.type === 'servicio' ? 'SERVICIO' : 'REGISTRO';
            const shortId = result.policyId.slice(-8);
            const typeCode = result.type === 'servicio' ? 's' : 'r';

            buttons.push([
                Markup.button.callback(
                    `${index + 1}. ${tipoEmoji} ${tipoTexto} - ${expediente}`,
                    `ase:${shortId}:${typeCode}:${result.itemIndex}`
                )
            ]);
        });

        buttons.push([
            Markup.button.callback('🔍 Nueva Búsqueda', 'admin_service_edit'),
            Markup.button.callback('⬅️ Volver', 'admin_service_menu')
        ]);

        return Markup.inlineKeyboard(buttons);
    }

    /**
     * Escapa caracteres especiales de Markdown
     */
    private escapeMarkdown(text: string): string {
        return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
    }

    /**
     * Genera mensaje de detalle para edición directa
     */
    generarMensajeDetalleServicio(result: IServiceSearchResult): string {
        const item = result.item;
        const isServicio = result.type === 'servicio';
        const expediente = item.numeroExpediente;
        const tipo = isServicio ? '🔧 Servicio' : '📋 Registro';

        const escapedTitular = this.escapeMarkdown(result.titular);
        const escapedPoliza = this.escapeMarkdown(result.numeroPoliza);
        const escapedExpediente = this.escapeMarkdown(expediente);

        let message = `
${tipo.split(' ')[0]} *EDITAR ${tipo.split(' ')[1].toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 *Expediente:* ${escapedExpediente}
📅 *Póliza:* ${escapedPoliza}
👤 *Titular:* ${escapedTitular}

*DETALLES ACTUALES:*
`;

        if (isServicio) {
            const servicio = item as IServiceData;
            const fecha = servicio.fechaServicio
                ? new Date(servicio.fechaServicio).toLocaleDateString('es-ES')
                : 'N/A';
            message += `• Fecha: ${fecha}\n`;
            message += `• Tipo: ${servicio.tipoServicio ?? 'N/A'}\n`;
            message += `• Descripción: ${servicio.descripcion ?? 'N/A'}\n`;
            message += `• Costo: $${servicio.costo ?? 0}\n`;
            message += `• Estado: ${servicio.estado ?? 'N/A'}\n`;
            message += `• Proveedor: ${servicio.proveedor ?? 'N/A'}\n`;
        } else {
            const registro = item as IRegistroData;
            const fecha = registro.fechaRegistro
                ? new Date(registro.fechaRegistro).toLocaleDateString('es-ES')
                : 'N/A';
            message += `• Fecha: ${fecha}\n`;
            message += `• Tipo: ${registro.tipoRegistro ?? 'N/A'}\n`;
            message += `• Descripción: ${registro.descripcion ?? 'N/A'}\n`;
            message += `• Estado: ${registro.estado ?? 'N/A'}\n`;
        }

        message += '\n¿Qué deseas editar?';

        return message.trim();
    }

    /**
     * Genera teclado de edición de servicio
     */
    generarTecladoEdicionServicio(
        policyId: string,
        type: 'servicio' | 'registro',
        itemIndex: number
    ): ReturnType<typeof Markup.inlineKeyboard> {
        const shortId = policyId.slice(-8);
        const buttons: any[][] = [];

        if (type === 'servicio') {
            buttons.push(
                [Markup.button.callback('📅 Fecha', `asf:${shortId}:s:${itemIndex}:fS`)],
                [Markup.button.callback('🏷️ Tipo', `asf:${shortId}:s:${itemIndex}:tS`)],
                [Markup.button.callback('📝 Descripción', `asf:${shortId}:s:${itemIndex}:d`)],
                [Markup.button.callback('💰 Costo', `asf:${shortId}:s:${itemIndex}:c`)],
                [Markup.button.callback('📊 Estado', `asf:${shortId}:s:${itemIndex}:e`)],
                [Markup.button.callback('🏢 Proveedor', `asf:${shortId}:s:${itemIndex}:p`)]
            );
        } else {
            buttons.push(
                [Markup.button.callback('📅 Fecha', `asf:${shortId}:r:${itemIndex}:fR`)],
                [Markup.button.callback('🏷️ Tipo', `asf:${shortId}:r:${itemIndex}:tR`)],
                [Markup.button.callback('📝 Descripción', `asf:${shortId}:r:${itemIndex}:d`)],
                [Markup.button.callback('📊 Estado', `asf:${shortId}:r:${itemIndex}:e`)]
            );
        }

        buttons.push([
            Markup.button.callback('🔍 Nueva Búsqueda', 'admin_service_edit'),
            Markup.button.callback('⬅️ Volver', 'admin_service_menu')
        ]);

        return Markup.inlineKeyboard(buttons);
    }

    /**
     * Genera mensaje para editar campo
     */
    generarMensajeEditarCampo(type: string, fieldName: string): string {
        const fieldDisplayName = this.getFieldDisplayName(fieldName);
        const typeDisplayName = type === 'servicio' ? 'Servicio' : 'Registro';

        return `
✏️ *EDITAR ${typeDisplayName.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 **Campo a editar:** ${fieldDisplayName}

Escribe el nuevo valor para este campo:

💡 **Sugerencias:**
• Para fechas: DD/MM/AAAA
• Para costos: solo números (sin $)
• Para descripciones: texto libre
• Para estados: ACTIVO, COMPLETADO, PENDIENTE, etc.

_Escribe el nuevo valor y se actualizará automáticamente._
        `.trim();
    }

    /**
     * Genera teclado para cancelar edición de campo
     */
    generarTecladoCancelarEdicion(
        policyId: string,
        type: string,
        itemIndex: number
    ): ReturnType<typeof Markup.inlineKeyboard> {
        const shortId = policyId.slice(-8);
        const typeCode = type === 'servicio' ? 's' : 'r';
        return Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancelar', `ase:${shortId}:${typeCode}:${itemIndex}`)]
        ]);
    }

    /**
     * Genera mensaje de campo actualizado
     */
    generarMensajeCampoActualizado(
        type: string,
        numeroPoliza: string,
        fieldName: string,
        newValue: string
    ): string {
        const fieldDisplayName = this.getFieldDisplayName(fieldName);
        const typeDisplayName = type === 'servicio' ? 'Servicio' : 'Registro';

        return `
✅ *CAMPO ACTUALIZADO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 **${typeDisplayName}:** ${numeroPoliza}
✏️ **Campo:** ${fieldDisplayName}
🔄 **Nuevo valor:** ${newValue}

✅ El campo se ha actualizado correctamente.

¿Deseas realizar otra acción?
        `.trim();
    }

    /**
     * Genera teclado post-actualización
     */
    generarTecladoPostActualizacion(): ReturnType<typeof Markup.inlineKeyboard> {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Buscar Otro', 'admin_service_edit')],
            [Markup.button.callback('⬅️ Menú Principal', 'admin_service_menu')]
        ]);
    }
}

// Singleton
let instance: AdminServiceUIService | null = null;

export function getAdminServiceUIService(): AdminServiceUIService {
    instance ??= new AdminServiceUIService();
    return instance;
}

export default AdminServiceUIService;
