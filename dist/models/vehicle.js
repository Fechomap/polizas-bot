"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const fileSchema = new mongoose_1.Schema({
    data: Buffer,
    contentType: String,
    originalName: String,
    uploadDate: { type: Date, default: Date.now }
}, { _id: false });
const r2FileSchema = new mongoose_1.Schema({
    url: { type: String, required: true },
    key: { type: String, required: true },
    originalName: String,
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
    fuenteOriginal: String
}, { _id: false });
const vehicleSchema = new mongoose_1.Schema({
    serie: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 17,
        maxlength: 17
    },
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
    calle: String,
    colonia: String,
    municipio: String,
    estadoRegion: String,
    cp: String,
    archivos: {
        fotos: [fileSchema],
        r2Files: {
            fotos: [r2FileSchema]
        }
    },
    estado: {
        type: String,
        enum: ['SIN_POLIZA', 'CON_POLIZA', 'ELIMINADO'],
        default: 'SIN_POLIZA'
    },
    creadoPor: {
        type: String,
        required: true
    },
    creadoVia: {
        type: String,
        enum: ['TELEGRAM_BOT', 'WEB_INTERFACE', 'API'],
        default: 'TELEGRAM_BOT'
    },
    notas: {
        type: String,
        maxlength: 500
    },
    policyId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Policy',
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});
vehicleSchema.pre('save', function (next) {
    if (this.isModified() && !this.isNew) {
        this.updatedAt = new Date();
    }
    next();
});
vehicleSchema.index({ serie: 1 }, { unique: true });
vehicleSchema.index({ placas: 1 });
vehicleSchema.index({ estado: 1 });
vehicleSchema.index({ creadoPor: 1 });
vehicleSchema.index({ createdAt: -1 });
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
const Vehicle = mongoose_1.default.model('Vehicle', vehicleSchema);
exports.default = Vehicle;
