-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('ACTIVO', 'INACTIVO', 'ELIMINADO');

-- CreateEnum
CREATE TYPE "PolicyType" AS ENUM ('REGULAR', 'NIV');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('SIN_POLIZA', 'CON_POLIZA', 'ELIMINADO', 'CONVERTIDO_NIV');

-- CreateEnum
CREATE TYPE "VehicleCreatedVia" AS ENUM ('TELEGRAM_BOT', 'WEB_INTERFACE', 'API');

-- CreateEnum
CREATE TYPE "PagoStatus" AS ENUM ('PLANIFICADO', 'REALIZADO', 'VENCIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "RegistroStatus" AS ENUM ('PENDIENTE', 'ASIGNADO', 'NO_ASIGNADO');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CONTACTO', 'TERMINO', 'MANUAL');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('FOTO', 'PDF');

-- CreateTable
CREATE TABLE "Aseguradora" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreCorto" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "logoUrl" TEXT,
    "contactoTelefono" TEXT,
    "contactoEmail" TEXT,
    "contactoWeb" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Aseguradora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "titular" TEXT NOT NULL,
    "correo" TEXT,
    "contraseña" TEXT,
    "rfc" TEXT NOT NULL,
    "calle" TEXT NOT NULL,
    "colonia" TEXT NOT NULL,
    "municipio" TEXT NOT NULL,
    "estadoRegion" TEXT,
    "cp" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "submarca" TEXT NOT NULL,
    "año" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "placas" TEXT NOT NULL,
    "agenteCotizador" TEXT NOT NULL,
    "aseguradora" TEXT NOT NULL,
    "numeroPoliza" TEXT NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL,
    "telefono" TEXT,
    "estadoPoliza" TEXT,
    "fechaFinCobertura" TIMESTAMP(3),
    "fechaFinGracia" TIMESTAMP(3),
    "diasRestantesCobertura" INTEGER NOT NULL DEFAULT 0,
    "diasRestantesGracia" INTEGER NOT NULL DEFAULT 0,
    "calificacion" INTEGER NOT NULL DEFAULT 0,
    "totalServicios" INTEGER NOT NULL DEFAULT 0,
    "servicioCounter" INTEGER NOT NULL DEFAULT 0,
    "registroCounter" INTEGER NOT NULL DEFAULT 0,
    "estado" "PolicyStatus" NOT NULL DEFAULT 'ACTIVO',
    "fechaEliminacion" TIMESTAMP(3),
    "motivoEliminacion" TEXT,
    "vehicleId" TEXT,
    "creadoViaOBD" BOOLEAN NOT NULL DEFAULT false,
    "asignadoPor" TEXT,
    "esNIV" BOOLEAN NOT NULL DEFAULT false,
    "tipoPoliza" "PolicyType" NOT NULL DEFAULT 'REGULAR',
    "fechaConversionNIV" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "serie" VARCHAR(17) NOT NULL,
    "marca" TEXT NOT NULL,
    "submarca" TEXT NOT NULL,
    "año" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "placas" TEXT NOT NULL,
    "titular" TEXT NOT NULL,
    "rfc" VARCHAR(13) NOT NULL,
    "telefono" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "calle" TEXT,
    "colonia" TEXT,
    "municipio" TEXT,
    "estadoRegion" TEXT,
    "cp" TEXT,
    "estado" "VehicleStatus" NOT NULL DEFAULT 'SIN_POLIZA',
    "creadoPor" TEXT NOT NULL,
    "creadoVia" "VehicleCreatedVia" NOT NULL DEFAULT 'TELEGRAM_BOT',
    "notas" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledNotification" (
    "id" TEXT NOT NULL,
    "numeroPoliza" TEXT NOT NULL,
    "expedienteNum" TEXT NOT NULL,
    "origenDestino" TEXT,
    "placas" TEXT,
    "fotoUrl" TEXT,
    "marcaModelo" TEXT,
    "colorVehiculo" TEXT,
    "telefono" TEXT,
    "contactTime" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "lastScheduledAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "createdByChatId" BIGINT,
    "createdByUsername" TEXT,
    "targetGroupId" BIGINT NOT NULL,
    "tipoNotificacion" "NotificationType" NOT NULL DEFAULT 'MANUAL',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetryAt" TIMESTAMP(3),
    "additionalData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "fechaPago" TIMESTAMP(3) NOT NULL,
    "estado" "PagoStatus" NOT NULL DEFAULT 'PLANIFICADO',
    "metodoPago" TEXT,
    "referencia" TEXT,
    "fechaRegistro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registro" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "numeroRegistro" INTEGER,
    "costo" DOUBLE PRECISION,
    "fechaRegistro" TIMESTAMP(3),
    "numeroExpediente" TEXT,
    "origenDestino" TEXT,
    "estado" "RegistroStatus" NOT NULL DEFAULT 'PENDIENTE',
    "fechaContactoProgramada" TIMESTAMP(3),
    "fechaTerminoProgramada" TIMESTAMP(3),
    "origenLat" DOUBLE PRECISION,
    "origenLng" DOUBLE PRECISION,
    "destinoLat" DOUBLE PRECISION,
    "destinoLng" DOUBLE PRECISION,
    "rutaDistanciaKm" DOUBLE PRECISION,
    "rutaTiempoMinutos" DOUBLE PRECISION,
    "rutaGoogleMapsUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Servicio" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "numeroServicio" INTEGER,
    "numeroRegistroOrigen" INTEGER,
    "costo" DOUBLE PRECISION,
    "fechaServicio" TIMESTAMP(3),
    "numeroExpediente" TEXT,
    "origenDestino" TEXT,
    "fechaContactoProgramada" TIMESTAMP(3),
    "fechaTerminoProgramada" TIMESTAMP(3),
    "fechaContactoReal" TIMESTAMP(3),
    "fechaTerminoReal" TIMESTAMP(3),
    "origenLat" DOUBLE PRECISION,
    "origenLng" DOUBLE PRECISION,
    "destinoLat" DOUBLE PRECISION,
    "destinoLng" DOUBLE PRECISION,
    "rutaDistanciaKm" DOUBLE PRECISION,
    "rutaTiempoMinutos" DOUBLE PRECISION,
    "rutaGoogleMapsUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyFileLegacy" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "tipo" "FileType" NOT NULL,
    "data" BYTEA NOT NULL,
    "contentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyFileLegacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleFileLegacy" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "tipo" "FileType" NOT NULL,
    "data" BYTEA NOT NULL,
    "contentType" TEXT,
    "originalName" TEXT,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleFileLegacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyFileR2" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "tipo" "FileType" NOT NULL,
    "url" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originalName" TEXT,
    "fuenteOriginal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyFileR2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleFileR2" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "tipo" "FileType" NOT NULL DEFAULT 'FOTO',
    "url" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "originalName" TEXT,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuenteOriginal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleFileR2_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Aseguradora_nombre_key" ON "Aseguradora"("nombre");

-- CreateIndex
CREATE INDEX "Aseguradora_nombreCorto_idx" ON "Aseguradora"("nombreCorto");

-- CreateIndex
CREATE INDEX "Aseguradora_activa_idx" ON "Aseguradora"("activa");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_numeroPoliza_key" ON "Policy"("numeroPoliza");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_vehicleId_key" ON "Policy"("vehicleId");

-- CreateIndex
CREATE INDEX "Policy_rfc_idx" ON "Policy"("rfc");

-- CreateIndex
CREATE INDEX "Policy_placas_idx" ON "Policy"("placas");

-- CreateIndex
CREATE INDEX "Policy_estado_idx" ON "Policy"("estado");

-- CreateIndex
CREATE INDEX "Policy_telefono_idx" ON "Policy"("telefono");

-- CreateIndex
CREATE INDEX "Policy_estado_fechaEmision_idx" ON "Policy"("estado", "fechaEmision");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_serie_key" ON "Vehicle"("serie");

-- CreateIndex
CREATE INDEX "Vehicle_placas_idx" ON "Vehicle"("placas");

-- CreateIndex
CREATE INDEX "Vehicle_estado_idx" ON "Vehicle"("estado");

-- CreateIndex
CREATE INDEX "Vehicle_creadoPor_idx" ON "Vehicle"("creadoPor");

-- CreateIndex
CREATE INDEX "Vehicle_createdAt_idx" ON "Vehicle"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ScheduledNotification_numeroPoliza_idx" ON "ScheduledNotification"("numeroPoliza");

-- CreateIndex
CREATE INDEX "ScheduledNotification_scheduledDate_idx" ON "ScheduledNotification"("scheduledDate");

-- CreateIndex
CREATE INDEX "ScheduledNotification_lastScheduledAt_idx" ON "ScheduledNotification"("lastScheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledNotification_processingStartedAt_idx" ON "ScheduledNotification"("processingStartedAt");

-- CreateIndex
CREATE INDEX "ScheduledNotification_status_idx" ON "ScheduledNotification"("status");

-- CreateIndex
CREATE INDEX "ScheduledNotification_status_scheduledDate_idx" ON "ScheduledNotification"("status", "scheduledDate");

-- CreateIndex
CREATE INDEX "ScheduledNotification_status_lastScheduledAt_idx" ON "ScheduledNotification"("status", "lastScheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledNotification_numeroPoliza_expedienteNum_tipoNotifi_idx" ON "ScheduledNotification"("numeroPoliza", "expedienteNum", "tipoNotificacion");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledNotification_numeroPoliza_expedienteNum_tipoNotifi_key" ON "ScheduledNotification"("numeroPoliza", "expedienteNum", "tipoNotificacion", "status");

-- CreateIndex
CREATE INDEX "Pago_policyId_idx" ON "Pago"("policyId");

-- CreateIndex
CREATE INDEX "Pago_estado_idx" ON "Pago"("estado");

-- CreateIndex
CREATE INDEX "Pago_fechaPago_idx" ON "Pago"("fechaPago");

-- CreateIndex
CREATE INDEX "Registro_policyId_idx" ON "Registro"("policyId");

-- CreateIndex
CREATE INDEX "Registro_estado_idx" ON "Registro"("estado");

-- CreateIndex
CREATE INDEX "Registro_numeroRegistro_idx" ON "Registro"("numeroRegistro");

-- CreateIndex
CREATE INDEX "Servicio_policyId_idx" ON "Servicio"("policyId");

-- CreateIndex
CREATE INDEX "Servicio_numeroServicio_idx" ON "Servicio"("numeroServicio");

-- CreateIndex
CREATE INDEX "PolicyFileLegacy_policyId_idx" ON "PolicyFileLegacy"("policyId");

-- CreateIndex
CREATE INDEX "PolicyFileLegacy_tipo_idx" ON "PolicyFileLegacy"("tipo");

-- CreateIndex
CREATE INDEX "VehicleFileLegacy_vehicleId_idx" ON "VehicleFileLegacy"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleFileLegacy_tipo_idx" ON "VehicleFileLegacy"("tipo");

-- CreateIndex
CREATE INDEX "PolicyFileR2_policyId_idx" ON "PolicyFileR2"("policyId");

-- CreateIndex
CREATE INDEX "PolicyFileR2_tipo_idx" ON "PolicyFileR2"("tipo");

-- CreateIndex
CREATE INDEX "PolicyFileR2_key_idx" ON "PolicyFileR2"("key");

-- CreateIndex
CREATE INDEX "VehicleFileR2_vehicleId_idx" ON "VehicleFileR2"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleFileR2_tipo_idx" ON "VehicleFileR2"("tipo");

-- CreateIndex
CREATE INDEX "VehicleFileR2_key_idx" ON "VehicleFileR2"("key");

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledNotification" ADD CONSTRAINT "ScheduledNotification_numeroPoliza_fkey" FOREIGN KEY ("numeroPoliza") REFERENCES "Policy"("numeroPoliza") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registro" ADD CONSTRAINT "Registro_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Servicio" ADD CONSTRAINT "Servicio_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyFileLegacy" ADD CONSTRAINT "PolicyFileLegacy_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleFileLegacy" ADD CONSTRAINT "VehicleFileLegacy_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyFileR2" ADD CONSTRAINT "PolicyFileR2_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleFileR2" ADD CONSTRAINT "VehicleFileR2_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
