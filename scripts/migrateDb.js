// scripts/migrateDb.js

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;
const XLSX = require('xlsx');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Función para esperar
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Crear un directorio si no existe
const ensureDirectoryExists = async (dirPath) => {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(`✅ Directorio creado: ${dirPath}`);
    }
};

// Conectar a MongoDB
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI;
        if (!mongoURI) {
            throw new Error('La variable de entorno MONGO_URI no está definida');
        }

        console.log('✅ Intentando conectar a MongoDB para migración...');
        await mongoose.connect(mongoURI);
        console.log('✅ Conectado a MongoDB para migración');
        return mongoose.connection;
    } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error);
        process.exit(1);
    }
};

// Hacer un respaldo completo de la base de datos
const backupDatabase = async () => {
    try {
        console.log('🔄 Iniciando respaldo de la base de datos antes de la migración...');
        
        // Crear directorio de respaldo con timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(__dirname, 'backup_premigration_' + timestamp);
        await ensureDirectoryExists(backupDir);
        
        // Obtener todas las pólizas
        const db = mongoose.connection.db;
        const collection = db.collection('policies');
        const policies = await collection.find({}).toArray();
        
        console.log(`📊 Respaldando ${policies.length} pólizas...`);

        // Convertir ObjectId a string para poder guardar en Excel
        const policiesJSON = policies.map(policy => {
            const policyObj = { ...policy };
            if (policyObj._id) {
                policyObj._id = policyObj._id.toString();
            }
            return policyObj;
        });
        
        // Guardar JSON completo para posible restauración
        const jsonPath = path.join(backupDir, 'policies_backup.json');
        await fs.writeFile(jsonPath, JSON.stringify(policiesJSON, null, 2));
        
        // Crear Excel con datos básicos (sin archivos binarios)
        const excelData = policies.map(p => {
            // Extraer datos básicos sin los archivos binarios
            const basicData = {
                _id: p._id.toString(),
                numeroPoliza: p.numeroPoliza,
                titular: p.titular,
                marca: p.marca,
                submarca: p.submarca,
                año: p.año,
                fechaEmision: p.fechaEmision,
                fechaCreacion: p.createdAt,
                numFotos: p.archivos?.fotos?.length || 0,
                numPdfs: p.archivos?.pdfs?.length || 0,
                numPagos: p.pagos?.length || 0,
                numServicios: p.servicios?.length || 0
            };
            return basicData;
        });
        
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Polizas');
        
        const excelPath = path.join(backupDir, 'polizas_resumen.xlsx');
        XLSX.writeFile(workbook, excelPath);
        
        console.log(`✅ Respaldo JSON guardado en: ${jsonPath}`);
        console.log(`✅ Resumen Excel guardado en: ${excelPath}`);
        console.log('✅ Respaldo completado exitosamente');
        
        return {
            backupDir,
            policiesCount: policies.length,
            jsonPath,
            excelPath
        };
    } catch (error) {
        console.error('❌ Error al realizar respaldo:', error);
        throw error;
    }
};

// Migrar pólizas existentes para añadir campo estado
const migrateDatabase = async (backupInfo) => {
    try {
        console.log('\n🔄 Iniciando migración de la base de datos...');
        console.log(`ℹ️ Se ha creado un respaldo con ${backupInfo.policiesCount} pólizas en: ${backupInfo.backupDir}`);
        
        // Pedir confirmación
        console.log('\n⚠️ ADVERTENCIA: Esta operación modificará la estructura de las pólizas existentes.');
        console.log('✅ Se ha realizado un respaldo completo antes de proceder.');
        console.log('🔄 Esperando 5 segundos antes de continuar. Presiona Ctrl+C para cancelar...\n');
        
        // Esperar 5 segundos antes de continuar
        await delay(5000);
        
        // Referenciar la colección directamente para hacer un update masivo
        const db = mongoose.connection.db;
        const collection = db.collection('policies'); // El nombre de la colección debe coincidir con el usado por Mongoose
        
        // Verificar si ya existe alguna póliza con el campo estado
        const hasEstadoField = await collection.findOne({ estado: { $exists: true } });
        if (hasEstadoField) {
            console.log('ℹ️ Algunas pólizas ya tienen el campo estado. Actualizando solo las que faltan...');
        }
        
        // Actualizar todas las pólizas que no tengan el campo estado
        const result = await collection.updateMany(
            { estado: { $exists: false } },
            { $set: { 
                estado: 'ACTIVO',
                fechaEliminacion: null,
                motivoEliminacion: ''
            }}
        );
        
        console.log(`✅ Migración completada: ${result.modifiedCount} pólizas actualizadas.`);
        
        // Mostrar estadísticas actuales
        const totalPolicies = await collection.countDocuments();
        const activePolicies = await collection.countDocuments({ estado: 'ACTIVO' });
        const inactivePolicies = await collection.countDocuments({ estado: 'INACTIVO' });
        const deletedPolicies = await collection.countDocuments({ estado: 'ELIMINADO' });
        
        console.log('\n📊 Estadísticas de la base de datos:');
        console.log(`📝 Total de pólizas: ${totalPolicies}`);
        console.log(`✅ Pólizas activas: ${activePolicies}`);
        console.log(`⚠️ Pólizas inactivas: ${inactivePolicies}`);
        console.log(`🗑️ Pólizas eliminadas: ${deletedPolicies}`);
        
    } catch (error) {
        console.error('❌ Error durante la migración:', error);
        throw error;
    } finally {
        // Cerrar conexión
        await mongoose.connection.close();
        console.log('✅ Conexión a MongoDB cerrada');
    }
};

// Función para restaurar desde el backup si algo sale mal
const restoreFromBackup = async (backupInfo) => {
    if (!backupInfo || !backupInfo.jsonPath) {
        console.error('❌ No se puede restaurar: información de respaldo incompleta');
        return false;
    }
    
    try {
        console.log('\n🔄 Iniciando restauración desde respaldo...');
        
        // Leer el archivo JSON de respaldo
        const backupData = JSON.parse(await fs.readFile(backupInfo.jsonPath, 'utf8'));
        console.log(`📊 Restaurando ${backupData.length} pólizas...`);
        
        // Conectar a la base de datos si no está conectada
        let db;
        try {
            db = mongoose.connection.db;
        } catch (e) {
            await connectDB();
            db = mongoose.connection.db;
        }
        
        const collection = db.collection('policies');
        
        // Eliminar todas las pólizas actuales (cuidado con esto)
        await collection.deleteMany({});
        console.log('✅ Base de datos limpiada para restauración');
        
        // Insertar las pólizas del respaldo
        for (const policy of backupData) {
            // Convertir _id de string a ObjectId
            if (policy._id && typeof policy._id === 'string') {
                policy._id = new mongoose.Types.ObjectId(policy._id);
            }
            
            await collection.insertOne(policy);
        }
        
        console.log(`✅ Restauración completada: ${backupData.length} pólizas restauradas`);
        return true;
    } catch (error) {
        console.error('❌ Error durante la restauración:', error);
        return false;
    } finally {
        // Cerrar conexión si está abierta
        try {
            await mongoose.connection.close();
        } catch (e) {
            // Ignorar error si ya está cerrada
        }
    }
};

// Ejecutar la migración
(async () => {
    let connection;
    let backupInfo = null;
    
    try {
        console.log('🚀 Iniciando proceso de migración con respaldo automático');
        
        // Paso 1: Conectar a la base de datos
        connection = await connectDB();
        
        // Paso 2: Hacer respaldo
        backupInfo = await backupDatabase();
        
        // Paso 3: Ejecutar migración
        await migrateDatabase(backupInfo);
        
        console.log('\n✅ Proceso completo exitosamente');
        console.log(`ℹ️ Respaldo guardado en: ${backupInfo.backupDir}`);
        
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error en el proceso de migración:', error);
        
        if (backupInfo) {
            console.log('\n⚠️ Se detectó un error. ¿Deseas restaurar desde el respaldo? (Esperando 10 segundos)');
            console.log('ℹ️ Presiona Ctrl+C para cancelar y manejar manualmente');
            
            // Esperar 10 segundos antes de intentar restaurar automáticamente
            await delay(10000);
            
            console.log('\n🔄 Intentando restaurar desde respaldo...');
            const restored = await restoreFromBackup(backupInfo);
            
            if (restored) {
                console.log('✅ Base de datos restaurada exitosamente desde el respaldo');
            } else {
                console.error('❌ No se pudo restaurar automáticamente');
                console.log(`ℹ️ Puedes restaurar manualmente usando el archivo: ${backupInfo.jsonPath}`);
            }
        } else {
            console.error('❌ No se creó un respaldo antes del error, no es posible restaurar automáticamente');
        }
        
        process.exit(1);
    } finally {
        // Cerrar conexión si sigue abierta
        try {
            if (connection && connection.readyState === 1) {
                await connection.close();
            }
        } catch (e) {
            // Ignorar errores al cerrar
        }
    }
})();