// src/models/vehicle.ts
import mongoose, { Schema, Model } from 'mongoose';
import { IVehicle } from '../../types';

// Esquema para archivos (reutilizado del modelo Policy)
const fileSchema = new Schema(
    {
        data: Buffer,
        contentType: String,
        originalName: String,
        uploadDate: { type: Date, default: Date.now }
    },
    { _id: false }
);

const r2FileSchema = new Schema(
    {
        url: { type: String, required: true },
        key: { type: String, required: true },
        originalName: String,
        contentType: { type: String, required: true },
        size: { type: Number, required: true },
        uploadedAt: { type: Date, default: Date.now },
        fuenteOriginal: String
    },
    { _id: false }
);

// Interfaces específicas para el modelo Vehicle
export interface IVehicleDocument extends IVehicle {
    marcarConPoliza(policyId?: mongoose.Types.ObjectId): Promise<IVehicleDocument>;
    eliminar(): Promise<IVehicleDocument>;
    getDatosTitular(): {
        titular: string;
        rfc: string;
        telefono: string;
        correo: string;
        calle?: string;
        colonia?: string;
        municipio?: string;
        estadoRegion?: string;
        cp?: string;
    };
}

export interface IVehicleModel extends Model<IVehicleDocument> {
    findSinPoliza(): Promise<IVehicleDocument[]>;
    findByPlacas(placas: string): Promise<IVehicleDocument | null>;
    findBySerie(serie: string): Promise<IVehicleDocument | null>;
}

const vehicleSchema = new Schema({
    // Identificación única del vehículo
    serie: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 17,
        maxlength: 17
    },

    // Datos del vehículo
    marca: {
        type: String,
        required: true,
        trim: true
    },
    submarca: {
        type: String,
        required: true,
        trim: true
    },
    año: {
        type: Number,
        required: true,
        min: 1900,
        max: new Date().getFullYear() + 2
    },
    color: {
        type: String,
        required: true,
        trim: true
    },
    placas: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },

    // Datos del titular (generados automáticamente)
    titular: {
        type: String,
        required: true,
        trim: true
    },
    rfc: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 13,
        maxlength: 13
    },
    telefono: {
        type: String,
        required: true,
        trim: true
    },
    correo: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },

    // Dirección del titular
    calle: String,
    colonia: String,
    municipio: String,
    estadoRegion: String,
    cp: String,

    // Archivos del vehículo (solo fotos)
    archivos: {
        fotos: [fileSchema],
        r2Files: {
            fotos: [r2FileSchema]
        }
    },

    // Estado del vehículo en el proceso OBD
    estado: {
        type: String,
        enum: ['SIN_POLIZA', 'CON_POLIZA', 'ELIMINADO', 'CONVERTIDO_NIV'],
        default: 'SIN_POLIZA'
    },

    // Metadatos de creación
    creadoPor: {
        type: String,
        required: true
    },
    creadoVia: {
        type: String,
        enum: ['TELEGRAM_BOT', 'WEB_INTERFACE', 'API'],
        default: 'TELEGRAM_BOT'
    },

    // Notas opcionales
    notas: {
        type: String,
        maxlength: 500
    },

    // Referencia a la póliza asignada (para BD AUTOS)
    policyId: {
        type: Schema.Types.ObjectId,
        ref: 'Policy',
        default: null
    },

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware para actualizar updatedAt
vehicleSchema.pre('save', function (next) {
    if (this.isModified() && !this.isNew) {
        this.updatedAt = new Date();
    }
    next();
});

// Índices para optimizar consultas
vehicleSchema.index({ serie: 1 }, { unique: true });
vehicleSchema.index({ placas: 1 });
vehicleSchema.index({ estado: 1 });
vehicleSchema.index({ creadoPor: 1 });
vehicleSchema.index({ createdAt: -1 });

// Métodos de instancia
vehicleSchema.methods.marcarConPoliza = function (
    policyId?: mongoose.Types.ObjectId
): Promise<IVehicleDocument> {
    this.estado = 'CON_POLIZA';
    if (policyId) {
        this.policyId = policyId;
    }
    return this.save();
};

vehicleSchema.methods.eliminar = function (): Promise<IVehicleDocument> {
    this.estado = 'ELIMINADO';
    return this.save();
};

vehicleSchema.methods.getDatosTitular = function () {
    return {
        titular: this.titular,
        rfc: this.rfc,
        telefono: this.telefono,
        correo: this.correo,
        calle: this.calle,
        colonia: this.colonia,
        municipio: this.municipio,
        estadoRegion: this.estadoRegion,
        cp: this.cp
    };
};

// Métodos estáticos
vehicleSchema.statics.findSinPoliza = function (): Promise<IVehicleDocument[]> {
    return this.find({ estado: 'SIN_POLIZA' });
};

vehicleSchema.statics.findByPlacas = function (placas: string): Promise<IVehicleDocument | null> {
    return this.findOne({
        placas: placas.toUpperCase(),
        estado: { $ne: 'ELIMINADO' }
    });
};

vehicleSchema.statics.findBySerie = function (serie: string): Promise<IVehicleDocument | null> {
    return this.findOne({
        serie: serie.toUpperCase(),
        estado: { $ne: 'ELIMINADO' }
    });
};

const Vehicle: IVehicleModel = mongoose.model<IVehicleDocument, IVehicleModel>(
    'Vehicle',
    vehicleSchema
);

export default Vehicle;
