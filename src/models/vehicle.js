const mongoose = require('mongoose');

// Esquema para archivos (reutilizado del modelo Policy)
const fileSchema = new mongoose.Schema({
    data: Buffer,
    contentType: String,
    originalName: String,
    uploadDate: { type: Date, default: Date.now }
});

const r2FileSchema = new mongoose.Schema({
    url: String,
    key: String,
    originalName: String,
    contentType: String,
    size: Number,
    uploadDate: { type: Date, default: Date.now },
    fuenteOriginal: String // Para identificar origen del archivo
});

const vehicleSchema = new mongoose.Schema({
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
        // Sistema legacy (MongoDB)
        fotos: [fileSchema],

        // Sistema nuevo (Cloudflare R2)
        r2Files: {
            fotos: [r2FileSchema]
        }
    },

    // Estado del vehículo en el proceso OBD
    estado: {
        type: String,
        enum: ['SIN_POLIZA', 'CON_POLIZA', 'ELIMINADO'],
        default: 'SIN_POLIZA'
    },

    // Metadatos de creación
    creadoPor: {
        type: String, // ID del usuario que registró el vehículo
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
        type: mongoose.Schema.Types.ObjectId,
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

// Métodos del modelo
vehicleSchema.methods.marcarConPoliza = function (policyId) {
    this.estado = 'CON_POLIZA';
    if (policyId) {
        this.policyId = policyId;
    }
    return this.save();
};

vehicleSchema.methods.eliminar = function () {
    this.estado = 'ELIMINADO';
    return this.save();
};

// Método para obtener datos del titular completos
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

// Statics para consultas comunes
vehicleSchema.statics.findSinPoliza = function () {
    return this.find({ estado: 'SIN_POLIZA' });
};

vehicleSchema.statics.findByPlacas = function (placas) {
    return this.findOne({
        placas: placas.toUpperCase(),
        estado: { $ne: 'ELIMINADO' }
    });
};

vehicleSchema.statics.findBySerie = function (serie) {
    return this.findOne({
        serie: serie.toUpperCase(),
        estado: { $ne: 'ELIMINADO' }
    });
};

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

module.exports = Vehicle;
