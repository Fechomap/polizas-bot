// src/models/aseguradora.ts
// Modelo para gestionar las aseguradoras conocidas

import mongoose, { Schema, Model, Document } from 'mongoose';

/**
 * Interfaz para el documento de Aseguradora
 */
export interface IAseguradora extends Document {
    nombre: string;
    nombreCorto: string;
    aliases: string[];
    activa: boolean;
    logoUrl?: string;
    contacto?: {
        telefono?: string;
        email?: string;
        web?: string;
    };
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Esquema de Aseguradora
 */
const aseguradoraSchema = new Schema<IAseguradora>(
    {
        nombre: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true
        },
        nombreCorto: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },
        aliases: {
            type: [String],
            default: []
        },
        activa: {
            type: Boolean,
            default: true
        },
        logoUrl: {
            type: String,
            required: false
        },
        contacto: {
            telefono: { type: String, required: false },
            email: { type: String, required: false },
            web: { type: String, required: false }
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// Crear índices
aseguradoraSchema.index({ nombreCorto: 1 });
aseguradoraSchema.index({ aliases: 1 });
aseguradoraSchema.index({ activa: 1 });

/**
 * Método estático para buscar aseguradora por nombre o alias
 */
aseguradoraSchema.statics.buscarPorNombre = async function (
    texto: string
): Promise<IAseguradora | null> {
    const normalizado = texto
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    // Buscar por nombre exacto
    let aseguradora = await this.findOne({
        $or: [{ nombre: normalizado }, { nombreCorto: normalizado }],
        activa: true
    });

    if (aseguradora) return aseguradora;

    // Buscar en aliases
    aseguradora = await this.findOne({
        aliases: { $regex: new RegExp(normalizado, 'i') },
        activa: true
    });

    if (aseguradora) return aseguradora;

    // Buscar parcial
    aseguradora = await this.findOne({
        $or: [
            { nombre: { $regex: new RegExp(normalizado, 'i') } },
            { nombreCorto: { $regex: new RegExp(normalizado, 'i') } }
        ],
        activa: true
    });

    return aseguradora;
};

/**
 * Método estático para obtener todas las aseguradoras activas
 */
aseguradoraSchema.statics.obtenerActivas = function (): Promise<IAseguradora[]> {
    return this.find({ activa: true }).sort({ nombreCorto: 1 });
};

// Interfaz del modelo con métodos estáticos
interface IAseguradoraModel extends Model<IAseguradora> {
    buscarPorNombre(texto: string): Promise<IAseguradora | null>;
    obtenerActivas(): Promise<IAseguradora[]>;
}

const Aseguradora: IAseguradoraModel = mongoose.model<IAseguradora, IAseguradoraModel>(
    'Aseguradora',
    aseguradoraSchema
);

export default Aseguradora;

/**
 * Tipo para datos de seed de aseguradoras (sin campos de Document ni timestamps)
 */
interface IAseguradoraSeed {
    nombre: string;
    nombreCorto: string;
    aliases: string[];
    activa: boolean;
    logoUrl?: string;
    contacto?: {
        telefono?: string;
        email?: string;
        web?: string;
    };
}

/**
 * Datos iniciales de aseguradoras mexicanas
 */
export const ASEGURADORAS_SEED: IAseguradoraSeed[] = [
    {
        nombre: 'GRUPO NACIONAL PROVINCIAL',
        nombreCorto: 'GNP',
        aliases: ['GNP SEGUROS', 'GRUPO NACIONAL PROVINCIAL S.A.B.'],
        activa: true,
        contacto: { web: 'https://www.gnp.com.mx' }
    },
    {
        nombre: 'AXA SEGUROS S.A. DE C.V.',
        nombreCorto: 'AXA',
        aliases: ['AXA SEGUROS', 'AXA MEXICO'],
        activa: true,
        contacto: { web: 'https://www.axa.mx' }
    },
    {
        nombre: 'QUALITAS COMPAÑIA DE SEGUROS',
        nombreCorto: 'QUALITAS',
        aliases: ['QUÁLITAS', 'QUALITAS SEGUROS'],
        activa: true,
        contacto: { web: 'https://www.qualitas.com.mx' }
    },
    {
        nombre: 'HDI SEGUROS S.A. DE C.V.',
        nombreCorto: 'HDI',
        aliases: ['HDI SEGUROS', 'HDI MEXICO'],
        activa: true,
        contacto: { web: 'https://www.hdi.com.mx' }
    },
    {
        nombre: 'SEGUROS MONTERREY NEW YORK LIFE',
        nombreCorto: 'MONTERREY',
        aliases: ['MONTERREY NEW YORK LIFE', 'SMNYL', 'SEGUROS MONTERREY'],
        activa: true,
        contacto: { web: 'https://www.segurosmonterrey.com.mx' }
    },
    {
        nombre: 'MAPFRE MEXICO S.A.',
        nombreCorto: 'MAPFRE',
        aliases: ['MAPFRE SEGUROS', 'MAPFRE TEPEYAC'],
        activa: true,
        contacto: { web: 'https://www.mapfre.com.mx' }
    },
    {
        nombre: 'ZURICH SANTANDER SEGUROS MEXICO',
        nombreCorto: 'ZURICH',
        aliases: ['ZURICH SEGUROS', 'ZURICH SANTANDER'],
        activa: true,
        contacto: { web: 'https://www.zurich.com.mx' }
    },
    {
        nombre: 'CHUBB SEGUROS MEXICO S.A.',
        nombreCorto: 'CHUBB',
        aliases: ['CHUBB SEGUROS', 'ACE SEGUROS'],
        activa: true,
        contacto: { web: 'https://www.chubb.com/mx-es' }
    },
    {
        nombre: 'SEGUROS INBURSA S.A.',
        nombreCorto: 'INBURSA',
        aliases: ['INBURSA SEGUROS', 'GRUPO FINANCIERO INBURSA'],
        activa: true,
        contacto: { web: 'https://www.inbursa.com' }
    },
    {
        nombre: 'SEGUROS ATLAS S.A.',
        nombreCorto: 'ATLAS',
        aliases: ['ATLAS SEGUROS'],
        activa: true,
        contacto: { web: 'https://www.segurosatlas.com.mx' }
    },
    {
        nombre: 'ANA COMPAÑIA DE SEGUROS S.A. DE C.V.',
        nombreCorto: 'ANA',
        aliases: ['ANA SEGUROS'],
        activa: true,
        contacto: { web: 'https://www.anaseguros.com.mx' }
    },
    {
        nombre: 'ALLIANZ MEXICO S.A.',
        nombreCorto: 'ALLIANZ',
        aliases: ['ALLIANZ SEGUROS'],
        activa: true,
        contacto: { web: 'https://www.allianz.com.mx' }
    },
    {
        nombre: 'AFIRME SEGUROS',
        nombreCorto: 'AFIRME',
        aliases: ['SEGUROS AFIRME'],
        activa: true,
        contacto: { web: 'https://www.afirme.com' }
    },
    {
        nombre: 'SEGUROS BANORTE S.A.',
        nombreCorto: 'BANORTE',
        aliases: ['BANORTE SEGUROS', 'GENERALI BANORTE'],
        activa: true,
        contacto: { web: 'https://www.banorte.com' }
    },
    {
        nombre: 'PRIMERO SEGUROS S.A. DE C.V.',
        nombreCorto: 'PRIMERO',
        aliases: ['PRIMERO SEGUROS'],
        activa: true,
        contacto: { web: 'https://www.primeroseguros.com.mx' }
    },
    {
        nombre: 'GENERAL DE SEGUROS S.A.B.',
        nombreCorto: 'GENERAL',
        aliases: ['GENERAL DE SEGUROS'],
        activa: true,
        contacto: { web: 'https://www.generaldeseguros.mx' }
    },
    {
        nombre: 'LA LATINO SEGUROS S.A.',
        nombreCorto: 'LA LATINO',
        aliases: ['LATINO SEGUROS', 'LA LATINOAMERICANA'],
        activa: true,
        contacto: { web: 'https://www.lalatino.com' }
    },
    {
        nombre: 'TOKIO MARINE COMPAÑIA DE SEGUROS',
        nombreCorto: 'TOKIO MARINE',
        aliases: ['TOKIO MARINE SEGUROS'],
        activa: true,
        contacto: { web: 'https://www.tokiomarine.mx' }
    },
    {
        nombre: 'SURA MEXICO SEGUROS',
        nombreCorto: 'SURA',
        aliases: ['SEGUROS SURA', 'RSA SEGUROS'],
        activa: true,
        contacto: { web: 'https://www.segurossura.com.mx' }
    },
    {
        nombre: 'SEGUROS EL POTOSI S.A.',
        nombreCorto: 'EL POTOSI',
        aliases: ['POTOSI SEGUROS', 'POTOSI'],
        activa: true,
        contacto: { web: 'https://www.elpotosi.com.mx' }
    },
    {
        nombre: 'SEGUROS ARGOS S.A. DE C.V.',
        nombreCorto: 'ARGOS',
        aliases: ['ARGOS SEGUROS'],
        activa: true,
        contacto: { web: 'https://www.segurosargos.com' }
    },
    {
        nombre: 'BX+ SEGUROS',
        nombreCorto: 'BX+',
        aliases: ['BANCO VE POR MAS', 'VE POR MAS SEGUROS'],
        activa: true,
        contacto: { web: 'https://www.vepormas.com' }
    },
    {
        nombre: 'AUTOFIN SEGUROS',
        nombreCorto: 'AUTOFIN',
        aliases: ['AUTOFIN'],
        activa: true,
        contacto: { web: 'https://www.autofin.com.mx' }
    },
    {
        nombre: 'SEGUROS AZTECA S.A. DE C.V.',
        nombreCorto: 'AZTECA',
        aliases: ['AZTECA SEGUROS', 'GRUPO ELEKTRA'],
        activa: true,
        contacto: { web: 'https://www.seguros-azteca.com.mx' }
    },
    {
        nombre: 'METLIFE MEXICO S.A.',
        nombreCorto: 'METLIFE',
        aliases: ['METLIFE SEGUROS'],
        activa: true,
        contacto: { web: 'https://www.metlife.com.mx' }
    },
    {
        nombre: 'ABA SEGUROS S.A. DE C.V.',
        nombreCorto: 'ABA',
        aliases: ['ABA SEGUROS'],
        activa: true,
        contacto: { web: 'https://www.abaseguros.com' }
    }
];

/**
 * Función para inicializar las aseguradoras en la base de datos
 */
export async function seedAseguradoras(): Promise<void> {
    try {
        const count = await Aseguradora.countDocuments();

        if (count === 0) {
            console.log('[Aseguradoras] Inicializando catálogo de aseguradoras...');

            for (const asegData of ASEGURADORAS_SEED) {
                await Aseguradora.findOneAndUpdate(
                    { nombreCorto: asegData.nombreCorto },
                    asegData,
                    { upsert: true, new: true }
                );
            }

            console.log(`[Aseguradoras] ${ASEGURADORAS_SEED.length} aseguradoras inicializadas`);
        } else {
            console.log(`[Aseguradoras] Catálogo ya existe con ${count} registros`);
        }
    } catch (error) {
        console.error('[Aseguradoras] Error inicializando catálogo:', error);
    }
}
