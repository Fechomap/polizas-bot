// src/models/policy.ts
import mongoose, { Schema, Document, Model } from 'mongoose';
import { IPolicy, IFile, IR2File, IPago, IServicio } from '../../types';

// Esquema para archivos sin _id (compatibilidad con archivos binarios legacy)
const fileSchema = new Schema<IFile>(
    {
        data: Buffer,
        contentType: String
    },
    { _id: false }
);

// Esquema para archivos almacenados en R2
const r2FileSchema = new Schema<IR2File>(
    {
        url: { type: String, required: true },
        key: { type: String, required: true },
        size: { type: Number, required: true },
        contentType: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
        originalName: { type: String, required: false },
        fuenteOriginal: { type: String, required: false }
    },
    { _id: false }
);

// Esquema para coordenadas
const coordenadasSchema = new Schema(
    {
        origen: {
            lat: { type: Number, required: false },
            lng: { type: Number, required: false }
        },
        destino: {
            lat: { type: Number, required: false },
            lng: { type: Number, required: false }
        }
    },
    { _id: false }
);

// Esquema para información de ruta
const rutaInfoSchema = new Schema(
    {
        distanciaKm: { type: Number, required: false },
        tiempoMinutos: { type: Number, required: false },
        googleMapsUrl: { type: String, required: false, trim: true }
    },
    { _id: false }
);

// Esquema para pagos
const pagoSchema = new Schema(
    {
        monto: { type: Number, required: true },
        fechaPago: { type: Date, required: true },
        estado: {
            type: String,
            enum: ['PLANIFICADO', 'REALIZADO', 'VENCIDO', 'CANCELADO'],
            default: 'PLANIFICADO'
        },
        metodoPago: { type: String, required: false },
        referencia: { type: String, required: false },
        fechaRegistro: { type: Date, default: Date.now },
        notas: { type: String, required: false }
    },
    { _id: false }
);

// Esquema para registros
const registroSchema = new Schema(
    {
        numeroRegistro: { type: Number, required: false },
        costo: { type: Number, required: false },
        fechaRegistro: { type: Date, required: false },
        numeroExpediente: { type: String, required: false },
        origenDestino: { type: String, required: false, trim: true },
        estado: {
            type: String,
            enum: ['PENDIENTE', 'ASIGNADO', 'NO_ASIGNADO'],
            default: 'PENDIENTE'
        },
        fechaContactoProgramada: { type: Date, required: false },
        fechaTerminoProgramada: { type: Date, required: false },
        coordenadas: coordenadasSchema,
        rutaInfo: rutaInfoSchema
    },
    { _id: false }
);

// Esquema para servicios
const servicioSchema = new Schema(
    {
        numeroServicio: { type: Number, required: false },
        numeroRegistroOrigen: { type: Number, required: false },
        costo: { type: Number, required: false },
        fechaServicio: { type: Date, required: false },
        numeroExpediente: { type: String, required: false },
        origenDestino: { type: String, required: false, trim: true },
        fechaContactoProgramada: { type: Date, required: false },
        fechaTerminoProgramada: { type: Date, required: false },
        fechaContactoReal: { type: Date, required: false },
        fechaTerminoReal: { type: Date, required: false },
        coordenadas: coordenadasSchema,
        rutaInfo: rutaInfoSchema
    },
    { _id: false }
);

// Esquema principal de Policy
const policySchema = new Schema(
    {
        // Datos del titular
        titular: {
            type: String,
            required: true,
            trim: true
        },
        correo: {
            type: String,
            required: false,
            lowercase: true,
            trim: true
        },
        contraseña: {
            type: String,
            required: false,
            trim: true
        },
        rfc: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },

        // Dirección
        calle: {
            type: String,
            required: true,
            trim: true
        },
        colonia: {
            type: String,
            required: true,
            trim: true
        },
        municipio: {
            type: String,
            required: true,
            trim: true
        },
        estadoRegion: {
            type: String,
            required: false,
            trim: true,
            uppercase: true
        },
        cp: {
            type: String,
            required: true,
            trim: true
        },

        // Datos del vehículo
        marca: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },
        submarca: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },
        año: {
            type: Number,
            required: true,
            min: 1900,
            max: new Date().getFullYear() + 1
        },
        color: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },
        serie: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },
        placas: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },

        // Datos de la póliza
        agenteCotizador: {
            type: String,
            required: true,
            trim: true
        },
        aseguradora: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },
        numeroPoliza: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true
        },
        fechaEmision: {
            type: Date,
            required: true
        },

        telefono: {
            type: String,
            required: false,
            trim: true
        },

        // Campos adicionales
        estadoPoliza: {
            type: String,
            required: false,
            trim: true
        },
        fechaFinCobertura: {
            type: Date,
            required: false
        },
        fechaFinGracia: {
            type: Date,
            required: false
        },
        diasRestantesCobertura: {
            type: Number,
            default: 0
        },
        diasRestantesGracia: {
            type: Number,
            default: 0
        },

        // Calificación y servicios
        calificacion: {
            type: Number,
            default: 0
        },
        totalServicios: {
            type: Number,
            default: 0
        },

        // Contadores
        servicioCounter: {
            type: Number,
            default: 0
        },
        registroCounter: {
            type: Number,
            default: 0
        },

        // Arrays de subdocumentos
        pagos: [pagoSchema],
        registros: [registroSchema],
        servicios: [servicioSchema],

        // Archivos híbridos
        archivos: {
            fotos: [fileSchema],
            pdfs: [fileSchema],
            r2Files: {
                fotos: [r2FileSchema],
                pdfs: [r2FileSchema]
            }
        },

        // Estado y eliminación
        estado: {
            type: String,
            enum: ['ACTIVO', 'INACTIVO', 'ELIMINADO'],
            default: 'ACTIVO'
        },
        fechaEliminacion: {
            type: Date,
            default: null
        },
        motivoEliminacion: {
            type: String,
            default: ''
        },

        // Campos para BD AUTOS
        vehicleId: {
            type: Schema.Types.ObjectId,
            ref: 'Vehicle',
            default: null
        },
        creadoViaOBD: {
            type: Boolean,
            default: false
        },
        asignadoPor: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// Índices
policySchema.index({ rfc: 1 });
policySchema.index({ placas: 1 });
policySchema.index({ estado: 1 });

// Middleware pre-save
policySchema.pre('save', function (next) {
    if (this.correo && this.correo.toLowerCase() === 'sin correo') {
        this.correo = '';
    }

    if (this.numeroPoliza) {
        this.numeroPoliza = this.numeroPoliza.trim().replace(/[\r\n\t]/g, '');
    }

    if (this.servicios && this.totalServicios === undefined) {
        this.totalServicios = this.servicios.length;
    }

    next();
});

// Métodos de instancia
policySchema.methods.getVehicleAge = function (): number {
    const currentYear = new Date().getFullYear();
    return currentYear - this.año;
};

// Crear el modelo tipado
const Policy: Model<IPolicy> = mongoose.model<IPolicy>('Policy', policySchema);

export default Policy;
