const Area = require('../database/models/area.model');
const { syncJsonFile } = require('../utils/jsonSync');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DATA_DIR = path.join(__dirname, '../../data');

const listarAreas = async () => {
    try {
        const data = await Area.find({}).sort({ nombre: 1 });
        return data;
    } catch (error) {
        console.error("Error al listar áreas:", error);
        throw error;
    }
};

const obtenerAreaPorId = async (id) => {
    try {
        const area = await Area.findById(id);
        return area;
    } catch (error) {
        console.error("Error al obtener área:", error);
        throw error;
    }
};

const crearArea = async (data) => {
    try {
        // Validar que el nombre sea único
        const areaExistente = await Area.findOne({ 
            nombre: { $regex: new RegExp(`^${data.nombre}$`, 'i') } 
        });
        
        if (areaExistente) {
            throw new Error(`Ya existe un área con el nombre "${data.nombre}"`);
        }

        const nuevaArea = await Area.create(data);
        const todasLasAreas = await listarAreas();
        await syncJsonFile('areas.json', todasLasAreas);
        return todasLasAreas;
    } catch (error) {
        console.error("Error al crear área:", error);
        throw error;
    }
};

const actualizarArea = async (id, newData) => {
    try {
        // Si se está actualizando el nombre, validar que sea único
        if (newData.nombre) {
            const areaExistente = await Area.findOne({ 
                nombre: { $regex: new RegExp(`^${newData.nombre}$`, 'i') },
                _id: { $ne: id }
            });
            
            if (areaExistente) {
                throw new Error(`Ya existe un área con el nombre "${newData.nombre}"`);
            }
        }

        newData.updatedAt = Date.now();
        await Area.findByIdAndUpdate(id, newData, { new: true });
        const todasLasAreas = await listarAreas();
        await syncJsonFile('areas.json', todasLasAreas);
        return todasLasAreas;
    } catch (error) {
        console.error("Error al actualizar área:", error);
        throw error;
    }
};

/**
 * Importa áreas desde data/areas.json a MongoDB.
 * Preserva _id del JSON para que mesas puedan referenciarlas.
 */
const importarAreasDesdeJSON = async () => {
    try {
        const filePath = path.join(DATA_DIR, 'areas.json');
        if (!fs.existsSync(filePath)) {
            console.log('⚠️ Archivo areas.json no encontrado');
            return { imported: 0, updated: 0, errors: 0 };
        }
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!Array.isArray(jsonData)) {
            console.log('⚠️ areas.json no contiene un array válido');
            return { imported: 0, updated: 0, errors: 0 };
        }
        let imported = 0, errors = 0;
        for (const item of jsonData) {
            try {
                const existente = await Area.findOne({ areaId: item.areaId });
                if (existente) continue;
                await Area.create({
                    _id: item._id ? new mongoose.Types.ObjectId(item._id) : undefined,
                    areaId: item.areaId,
                    nombre: item.nombre,
                    descripcion: item.descripcion != null ? item.descripcion : '',
                    isActive: item.isActive !== false,
                    createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
                    updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined
                });
                imported++;
            } catch (err) {
                errors++;
                console.error(`❌ Error al importar área ${item.nombre || item.areaId}:`, err.message);
            }
        }
        if (imported > 0 || errors > 0) {
            console.log(`✅ Áreas: ${imported} importadas${errors ? `, ${errors} errores` : ''}`);
        }
        return { imported, updated: 0, errors };
    } catch (error) {
        console.error('❌ Error al importar áreas:', error.message);
        return { imported: 0, updated: 0, errors: 1 };
    }
};

const borrarArea = async (id) => {
    try {
        // Verificar si hay mesas asociadas a esta área
        const mesasModel = require('../database/models/mesas.model');
        const mesasConArea = await mesasModel.find({ area: id });
        
        if (mesasConArea.length > 0) {
            throw new Error(`No se puede eliminar el área porque tiene ${mesasConArea.length} mesa(s) asociada(s)`);
        }

        await Area.findByIdAndDelete(id);
        const todasLasAreas = await listarAreas();
        await syncJsonFile('areas.json', todasLasAreas);
        return todasLasAreas;
    } catch (error) {
        console.error("Error al eliminar área:", error);
        throw error;
    }
};

module.exports = {
    listarAreas,
    obtenerAreaPorId,
    crearArea,
    actualizarArea,
    borrarArea,
    importarAreasDesdeJSON
};

