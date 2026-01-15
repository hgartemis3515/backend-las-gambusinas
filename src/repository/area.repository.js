const Area = require('../database/models/area.model');
const { syncJsonFile } = require('../utils/jsonSync');

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
    borrarArea
};

