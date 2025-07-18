// types/database.d.ts - Tipos para base de datos

import { Document, ObjectId } from 'mongoose';

// Interfaz para archivos almacenados
export interface IFile {
  data?: Buffer;
  contentType?: string;
}

// Interfaz para archivos en R2
export interface IR2File {
  url: string;
  key: string;
  size: number;
  contentType: string;
  uploadedAt: Date;
  originalName?: string;
  fuenteOriginal?: string;
}

// Interfaz para el titular de póliza
export interface ITitular {
  nombre: string;
  correo?: string;
  telefono?: string;
  rfc?: string;
}

// Interfaz para servicios de póliza
export interface IServicio {
  nombre: string;
  costo: number;
  descripcion?: string;
  activo: boolean;
  fechaCreacion: Date;
}

// Interfaz para pagos
export interface IPago {
  monto: number;
  fecha: Date;
  metodoPago?: string;
  referencia?: string;
  notas?: string;
}

// Interfaz base para Policy
export interface IPolicy extends Document {
  _id: ObjectId;
  titular: string;
  correo?: string;
  contraseña?: string;
  rfc: string;
  telefono?: string;
  poliza: string;
  vigenciaInicio: Date;
  vigenciaFin: Date;
  aseguradora?: string;
  tipoSeguro?: string;
  prima?: number;
  deducible?: number;
  cobertura?: string[];
  vehiculo?: {
    marca?: string;
    modelo?: string;
    año?: number;
    placas?: string;
    serie?: string;
    motor?: string;
    color?: string;
    tipoVehiculo?: string;
  };
  servicios?: IServicio[];
  pagos?: IPago[];
  archivos?: IFile[];
  archivosR2?: IR2File[];
  notas?: string;
  estado: 'activa' | 'vencida' | 'cancelada' | 'suspendida';
  fechaCreacion: Date;
  fechaActualizacion: Date;
  creadoPor?: string;
  actualizadoPor?: string;
  tags?: string[];
  ocupada?: boolean;
  fechaOcupacion?: Date;
  usuarioOcupacion?: string;
}

// Interfaz para Vehicle
export interface IVehicle extends Document {
  _id: ObjectId;
  marca: string;
  modelo: string;
  año: number;
  placas?: string;
  serie?: string;
  motor?: string;
  color?: string;
  tipoVehiculo?: string;
  propietario?: string;
  telefono?: string;
  correo?: string;
  estado: 'disponible' | 'asegurado' | 'proceso' | 'baja';
  fechaCreacion: Date;
  fechaActualizacion: Date;
  archivos?: IFile[];
  archivosR2?: IR2File[];
  notas?: string;
  polizaAsociada?: ObjectId;
  fuenteOriginal?: string;
}

// Interfaz para notificaciones programadas
export interface IScheduledNotification extends Document {
  _id: ObjectId;
  tipo: 'vencimiento' | 'recordatorio' | 'pago' | 'servicio';
  mensaje: string;
  fechaEnvio: Date;
  destinatarios: number[];
  enviado: boolean;
  fechaEnviado?: Date;
  error?: string;
  intentos: number;
  maxIntentos: number;
  datos?: Record<string, any>;
  polizaId?: ObjectId;
  vehiculoId?: ObjectId;
  fechaCreacion: Date;
}