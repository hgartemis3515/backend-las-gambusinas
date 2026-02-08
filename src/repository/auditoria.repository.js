const AuditoriaAcciones = require("../database/models/auditoriaAcciones.model");
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DATA_DIR = path.join(__dirname, '../../data');

/**
 * Importa registros de auditoría desde data/auditoria.json
 * Evita duplicados verificando por _id
 */
const importarAuditoriaDesdeJSON = async () => {
    try {
        const filePath = path.join(DATA_DIR, 'auditoria.json');
        if (!fs.existsSync(filePath)) {
            console.log('⚠️ Archivo auditoria.json no encontrado');
            return { imported: 0, updated: 0, errors: 0 };
        }
        
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!Array.isArray(jsonData)) {
            console.log('⚠️ auditoria.json no contiene un array válido');
            return { imported: 0, updated: 0, errors: 0 };
        }
        
        const toObjId = (id) => {
            if (!id) return null;
            if (mongoose.Types.ObjectId.isValid(id)) {
                return new mongoose.Types.ObjectId(id);
            }
            return null;
        };
        
        let imported = 0;
        let errors = 0;
        
        for (const item of jsonData) {
            try {
                // Verificar si ya existe por _id
                const existente = await AuditoriaAcciones.findById(item._id);
                if (existente) {
                    continue; // Ya existe, saltar
                }
                
                // Preparar datos para crear
                const auditoriaData = {
                    _id: toObjId(item._id),
                    accion: item.accion,
                    entidadId: toObjId(item.entidadId),
                    entidadTipo: item.entidadTipo,
                    usuario: toObjId(item.usuario),
                    datosAntes: item.datosAntes || null,
                    datosDespues: item.datosDespues || null,
                    motivo: item.motivo || null,
                    ip: item.ip || null,
                    deviceId: item.deviceId || null,
                    timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
                    metadata: item.metadata || {}
                };
                
                // Agregar timestamps si existen en el JSON
                if (item.createdAt) {
                    auditoriaData.createdAt = new Date(item.createdAt);
                }
                if (item.updatedAt) {
                    auditoriaData.updatedAt = new Date(item.updatedAt);
                }
                
                await AuditoriaAcciones.create(auditoriaData);
                imported++;
            } catch (err) {
                errors++;
                console.error(`❌ Error al importar auditoría ${item._id}:`, err.message);
            }
        }
        
        if (imported > 0 || errors > 0) {
            console.log(`✅ Auditoría: ${imported} importados${errors ? `, ${errors} errores` : ''}`);
        }
        
        return { imported, updated: 0, errors };
    } catch (error) {
        console.error('❌ Error al importar auditoría:', error.message);
        return { imported: 0, updated: 0, errors: 1 };
    }
};

module.exports = {
    importarAuditoriaDesdeJSON
};

