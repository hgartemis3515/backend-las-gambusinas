/**
 * Notificacion Repository
 * Importación de notificaciones desde JSON
 */

const Notificacion = require('../database/models/notificacion.model');
const fs = require('fs');
const path = require('path');

/**
 * Importar notificaciones desde data/notificaciones.json
 * Crea la colección si no existe
 */
async function importarNotificacionesDesdeJSON() {
    try {
        const filePath = path.join(__dirname, '../../data/notificaciones.json');
        
        if (!fs.existsSync(filePath)) {
            console.log('   Notificaciones: archivo no existe, creando colección vacía');
            return { imported: 0, skipped: 0 };
        }
        
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (!Array.isArray(data) || data.length === 0) {
            console.log('   Notificaciones: archivo vacío, colección lista');
            return { imported: 0, skipped: 0 };
        }
        
        let imported = 0;
        let skipped = 0;
        
        for (const notif of data) {
            // Verificar si ya existe por algún identificador único
            const exists = await Notificacion.findById(notif._id).lean();
            
            if (!exists) {
                await Notificacion.create(notif);
                imported++;
            } else {
                skipped++;
            }
        }
        
        if (imported > 0 || skipped > 0) {
            console.log(`   Notificaciones: ${imported} agregadas, ${skipped} existentes saltadas`);
        }
        
        return { imported, skipped };
        
    } catch (error) {
        // No crítico - las notificaciones son opcionales
        console.warn('   Notificaciones: error al importar (no crítico):', error.message);
        return { imported: 0, skipped: 0, error: error.message };
    }
}

/**
 * Inicializar colección de notificaciones
 */
async function inicializarNotificaciones() {
    try {
        // Crear índices si no existen
        await Notificacion.createIndexes();
        console.log('   Notificaciones: índices creados');
        return true;
    } catch (error) {
        console.warn('   Notificaciones: error al crear índices:', error.message);
        return false;
    }
}

module.exports = {
    importarNotificacionesDesdeJSON,
    inicializarNotificaciones
};
