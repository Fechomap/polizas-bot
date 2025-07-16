// src/models/policy.js
const mongoose = require('mongoose');

// Esquema para archivos sin _id (compatibilidad con archivos binarios legacy)
const fileSchema = new mongoose.Schema(
    {
        data: Buffer,
        contentType: String
    },
    { _id: false }
); // Esto es clave: deshabilitamos el _id automático

// Esquema para archivos almacenados en R2
const r2FileSchema = new mongoose.Schema(
    {
        url: { type: String, required: true },
        key: { type: String, required: true },
        size: { type: Number, required: true },
        contentType: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
        originalName: { type: String, required: false },
        fuenteOriginal: { type: String, required: false } // Para BD AUTOS: 'vehiculo_bd_autos'
    },
    { _id: false }
);

const policySchema = new mongoose.Schema(
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
            // CAMBIO: Renombramos este campo para evitar conflictos
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

        // CAMPOS ADICIONALES - Para exportar a Excel e importar
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

        // CALIFICACION y SERVICIOS
        calificacion: {
            type: Number,
            default: 0
        },
        totalServicios: {
            type: Number,
            default: 0
        },

        // Contadores para asignar números secuenciales
        servicioCounter: {
            type: Number,
            default: 0
        },
        registroCounter: {
            type: Number,
            default: 0
        },

        pagos: [
            {
                monto: { type: Number, required: true },
                fechaPago: { type: Date, required: true }
            }
        ],

        // REGISTROS: Intentos de servicio (aún no confirmados)
        registros: [
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
                // Campos para coordenadas y datos de ruta
                coordenadas: {
                    origen: {
                        lat: { type: Number, required: false },
                        lng: { type: Number, required: false }
                    },
                    destino: {
                        lat: { type: Number, required: false },
                        lng: { type: Number, required: false }
                    }
                },
                rutaInfo: {
                    distanciaKm: { type: Number, required: false },
                    tiempoMinutos: { type: Number, required: false },
                    googleMapsUrl: { type: String, required: false, trim: true }
                }
            }
        ],

        // SERVICIOS: Solo los confirmados como "Asignados"
        servicios: [
            {
                numeroServicio: { type: Number, required: false },
                numeroRegistroOrigen: { type: Number, required: false }, // Referencia al registro original
                costo: { type: Number, required: false },
                fechaServicio: { type: Date, required: false },
                numeroExpediente: { type: String, required: false },
                origenDestino: { type: String, required: false, trim: true },
                fechaContactoProgramada: { type: Date, required: false },
                fechaTerminoProgramada: { type: Date, required: false },
                fechaContactoReal: { type: Date, required: false },
                fechaTerminoReal: { type: Date, required: false },
                // Campos para coordenadas y datos de ruta
                coordenadas: {
                    origen: {
                        lat: { type: Number, required: false },
                        lng: { type: Number, required: false }
                    },
                    destino: {
                        lat: { type: Number, required: false },
                        lng: { type: Number, required: false }
                    }
                },
                rutaInfo: {
                    distanciaKm: { type: Number, required: false },
                    tiempoMinutos: { type: Number, required: false },
                    googleMapsUrl: { type: String, required: false, trim: true }
                }
            }
        ],

        // Esquema de archivos híbrido: soporta binarios legacy y URLs de R2
        archivos: {
            fotos: [fileSchema], // Archivos binarios legacy
            pdfs: [fileSchema], // Archivos binarios legacy
            r2Files: {
                fotos: [r2FileSchema], // Archivos en R2
                pdfs: [r2FileSchema] // Archivos en R2
            }
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
        },

        // Campos para BD AUTOS
        vehicleId: {
            type: mongoose.Schema.Types.ObjectId,
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
policySchema.index({ estado: 1 }); // Agregar índice para estado

// Middleware pre-save para limpieza de datos
policySchema.pre('save', function (next) {
    if (this.correo && this.correo.toLowerCase() === 'sin correo') {
        this.correo = '';
    }

    // Asegurar que no haya espacios ni caracteres especiales en el número de póliza
    if (this.numeroPoliza) {
        this.numeroPoliza = this.numeroPoliza.trim().replace(/[\r\n\t]/g, '');
    }

    // Actualizar totalServicios automáticamente si no está definido
    if (this.servicios && this.totalServicios === undefined) {
        this.totalServicios = this.servicios.length;
    }

    next();
});

// Método para obtener la edad del vehículo
policySchema.methods.getVehicleAge = function () {
    const currentYear = new Date().getFullYear();
    return currentYear - this.año;
};

// Crear el modelo
const Policy = mongoose.model('Policy', policySchema);

module.exports = Policy;
