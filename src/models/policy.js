// src/models/policy.js
const mongoose = require('mongoose');

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
    estado: { 
        type: String, 
        required: true,
        trim: true
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
        unique: true
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

    pagos: [
        {
          monto: { type: Number, required: true },
          fechaPago: { type: Date, required: true }
        }
      ],
    
    servicios: [
        {
          numeroServicio: { type: Number, required: true }, // Contador interno
          costo: { type: Number, required: true },
          fechaServicio: { type: Date, required: true },
          numeroExpediente: { type: String, required: true },
          origenDestino: { type: String, required: false, trim: true }
        }
      ],

    // Archivos
    archivos: {
        fotos: [{
            data: Buffer,
            contentType: String
        }],
        pdfs: [{
            data: Buffer,
            contentType: String
        }]
    }
}, { 
    timestamps: true,
    versionKey: false
});

// Índices
policySchema.index({ rfc: 1 });
policySchema.index({ placas: 1 });

// Middleware pre-save para limpieza de datos
policySchema.pre('save', function(next) {
    // Si el correo es "sin correo", lo guardamos como string vacío
    if (this.correo && this.correo.toLowerCase() === 'sin correo') {
        this.correo = '';
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