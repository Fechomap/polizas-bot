// src/models/policy.js
const mongoose = require('mongoose');

// Esquema para archivos sin _id
const fileSchema = new mongoose.Schema({
    data: Buffer,
    contentType: String
}, { _id: false }); // Esto es clave: deshabilitamos el _id automático

const policySchema = new mongoose.Schema({
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
    estadoRegion: {  // CAMBIO: Renombramos este campo para evitar conflictos
        type: String, 
        required: true,
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

    pagos: [{
        monto: { type: Number, required: true },
        fechaPago: { type: Date, required: true }
    }],
    
    servicios: [{
        numeroServicio: { type: Number, required: false },
        costo: { type: Number, required: false },
        fechaServicio: { type: Date, required: false },
        numeroExpediente: { type: String, required: false },
        origenDestino: { type: String, required: false, trim: true }
    }],

    // Modificado el esquema de archivos para manejar datos binarios
    archivos: {
        fotos: [fileSchema],  // Usamos el esquema sin _id
        pdfs: [fileSchema]    // Usamos el esquema sin _id
    },

    // Campo de estado para "borrado lógico"
    estado: {
        type: String,
        enum: ['ACTIVO', 'INACTIVO', 'ELIMINADO'],
        default: 'ACTIVO'
    },
    
    // Fecha y motivo de eliminación (para cuando se marca como ELIMINADO)
    fechaEliminacion: {
        type: Date,
        default: null
    },
    motivoEliminacion: {
        type: String,
        default: ''
    }
}, { 
    timestamps: true,
    versionKey: false
});

// Índices
policySchema.index({ rfc: 1 });
policySchema.index({ placas: 1 });
policySchema.index({ estado: 1 }); // Agregar índice para estado
policySchema.index({ numeroPoliza: 1 }); // Índice para búsquedas eficientes

// Middleware pre-save para limpieza de datos
policySchema.pre('save', function(next) {
    if (this.correo && this.correo.toLowerCase() === 'sin correo') {
        this.correo = '';
    }
    
    // Asegurar que no haya espacios ni caracteres especiales en el número de póliza
    if (this.numeroPoliza) {
        this.numeroPoliza = this.numeroPoliza.trim().replace(/[\r\n\t]/g, '');
    }
    
    next();
});

// Método para obtener la edad del vehículo
policySchema.methods.getVehicleAge = function() {
    const currentYear = new Date().getFullYear();
    return currentYear - this.año;
};

// Crear el modelo
const Policy = mongoose.model('Policy', policySchema);

module.exports = Policy;