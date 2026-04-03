const LayoutSection = require('../database/models/layoutSection.model');
const LayoutItem = require('../database/models/layoutItem.model');
const Mesa = require('../database/models/mesas.model');
const mongoose = require('mongoose');

// ==================== LAYOUT SECTIONS ====================

/**
 * Lista todas las secciones de layout
 */
async function listarSecciones(filtro = {}) {
    return await LayoutSection.find(filtro)
        .populate('areaId', 'nombre')
        .sort({ orden: 1 })
        .lean();
}

/**
 * Obtiene una sección por ID
 */
async function obtenerSeccionPorId(sectionId) {
    return await LayoutSection.findById(sectionId)
        .populate('areaId', 'nombre')
        .lean();
}

/**
 * Crea una nueva sección de layout
 */
async function crearSeccion(data) {
    const { nombre, areaId, canvasWidth, canvasHeight, gridSize, color, orden } = data;
    
    // Si hay área vinculada, verificar que existe
    if (areaId) {
        const Area = require('../database/models/area.model');
        const area = await Area.findById(areaId);
        if (!area) {
            const error = new Error('Área no encontrada');
            error.statusCode = 404;
            throw error;
        }
        
        // Actualizar área con referencia a la sección
        await Area.findByIdAndUpdate(areaId, {
            layoutSectionId: new mongoose.Types.ObjectId(),
            mapaHabilitado: true
        });
    }
    
    const seccion = new LayoutSection({
        nombre,
        areaId: areaId || null,
        canvasWidth: canvasWidth || 1600,
        canvasHeight: canvasHeight || 1200,
        gridSize: gridSize || 25,
        color: color || '#1a1a28',
        orden: orden || 0
    });
    
    return await seccion.save();
}

/**
 * Actualiza una sección existente
 */
async function actualizarSeccion(sectionId, data) {
    const seccion = await LayoutSection.findByIdAndUpdate(
        sectionId,
        { $set: data },
        { new: true, runValidators: true }
    ).populate('areaId', 'nombre');
    
    if (!seccion) {
        const error = new Error('Sección no encontrada');
        error.statusCode = 404;
        throw error;
    }
    
    return seccion;
}

/**
 * Elimina una sección y sus items asociados
 */
async function eliminarSeccion(sectionId) {
    const seccion = await LayoutSection.findById(sectionId);
    
    if (!seccion) {
        const error = new Error('Sección no encontrada');
        error.statusCode = 404;
        throw error;
    }
    
    // Eliminar items asociados
    await LayoutItem.deleteMany({ sectionId });
    
    // Desvincular mesas de esta sección
    await Mesa.updateMany(
        { 'mapaConfig.sectionId': sectionId },
        { $set: { 'mapaConfig.sectionId': null } }
    );
    
    // Desvincular área si existe
    if (seccion.areaId) {
        const Area = require('../database/models/area.model');
        await Area.findByIdAndUpdate(seccion.areaId, {
            layoutSectionId: null,
            mapaHabilitado: false
        });
    }
    
    await LayoutSection.findByIdAndDelete(sectionId);
    
    return { success: true, message: 'Sección eliminada correctamente' };
}

/**
 * Duplica una sección completa (items y posiciones de mesas)
 */
async function duplicarSeccion(sectionId) {
    const seccionOriginal = await LayoutSection.findById(sectionId);
    
    if (!seccionOriginal) {
        const error = new Error('Sección no encontrada');
        error.statusCode = 404;
        throw error;
    }
    
    // Crear nueva sección
    const nuevaSeccion = new LayoutSection({
        nombre: `${seccionOriginal.nombre} (copia)`,
        canvasWidth: seccionOriginal.canvasWidth,
        canvasHeight: seccionOriginal.canvasHeight,
        gridSize: seccionOriginal.gridSize,
        zoomDefault: seccionOriginal.zoomDefault,
        color: seccionOriginal.color,
        orden: seccionOriginal.orden + 1
    });
    
    await nuevaSeccion.save();
    
    // Duplicar items
    const itemsOriginales = await LayoutItem.find({ sectionId });
    const nuevosItems = itemsOriginales.map(item => ({
        sectionId: nuevaSeccion._id,
        tipo: item.tipo,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
        zIndex: item.zIndex,
        texto: item.texto,
        fontSize: item.fontSize,
        fontWeight: item.fontWeight,
        color: item.color,
        backgroundColor: item.backgroundColor,
        opacity: item.opacity,
        borderRadius: item.borderRadius,
        borderWidth: item.borderWidth,
        borderColor: item.borderColor,
        locked: false,
        visible: item.visible
    }));
    
    if (nuevosItems.length > 0) {
        await LayoutItem.insertMany(nuevosItems);
    }
    
    return {
        seccion: nuevaSeccion,
        itemsDuplicados: nuevosItems.length
    };
}

/**
 * Publica una sección (la hace visible para mozos)
 */
async function publicarSeccion(sectionId, adminId) {
    const seccion = await LayoutSection.findByIdAndUpdate(
        sectionId,
        {
            $set: {
                publicado: true,
                publicadoAt: new Date(),
                publicadoBy: adminId
            }
        },
        { new: true }
    ).populate('areaId', 'nombre');
    
    if (!seccion) {
        const error = new Error('Sección no encontrada');
        error.statusCode = 404;
        throw error;
    }
    
    // Si hay área vinculada, marcar como mapa publicado
    if (seccion.areaId) {
        const Area = require('../database/models/area.model');
        await Area.findByIdAndUpdate(seccion.areaId, {
            mapaPublicado: true
        });
    }
    
    return seccion;
}

/**
 * Despublica una sección
 */
async function despublicarSeccion(sectionId) {
    const seccion = await LayoutSection.findByIdAndUpdate(
        sectionId,
        {
            $set: {
                publicado: false
            }
        },
        { new: true }
    );
    
    if (!seccion) {
        const error = new Error('Sección no encontrada');
        error.statusCode = 404;
        throw error;
    }
    
    // Si hay área vinculada, desmarcar mapa publicado
    if (seccion.areaId) {
        const Area = require('../database/models/area.model');
        await Area.findByIdAndUpdate(seccion.areaId, {
            mapaPublicado: false
        });
    }
    
    return seccion;
}

// ==================== LAYOUT ITEMS ====================

/**
 * Obtiene todos los items de una sección
 */
async function obtenerItemsSeccion(sectionId) {
    return await LayoutItem.find({ sectionId })
        .sort({ zIndex: 1 })
        .lean();
}

/**
 * Guarda múltiples items en batch
 */
async function guardarItemsBatch(sectionId, items) {
    // Eliminar items existentes de la sección
    await LayoutItem.deleteMany({ sectionId });
    
    // Insertar nuevos items
    if (items && items.length > 0) {
        const itemsToInsert = items.map(item => ({
            sectionId: new mongoose.Types.ObjectId(sectionId),
            ...item,
            _id: item._id ? new mongoose.Types.ObjectId(item._id) : new mongoose.Types.ObjectId()
        }));
        
        await LayoutItem.insertMany(itemsToInsert);
        
        return { success: true, count: itemsToInsert.length };
    }
    
    return { success: true, count: 0 };
}

/**
 * Crea un nuevo item
 */
async function crearItem(data) {
    const item = new LayoutItem(data);
    return await item.save();
}

/**
 * Actualiza un item existente
 */
async function actualizarItem(itemId, data) {
    const item = await LayoutItem.findByIdAndUpdate(
        itemId,
        { $set: data },
        { new: true, runValidators: true }
    );
    
    if (!item) {
        const error = new Error('Item no encontrado');
        error.statusCode = 404;
        throw error;
    }
    
    return item;
}

/**
 * Elimina un item
 */
async function eliminarItem(itemId) {
    const item = await LayoutItem.findByIdAndDelete(itemId);
    
    if (!item) {
        const error = new Error('Item no encontrado');
        error.statusCode = 404;
        throw error;
    }
    
    return { success: true };
}

// ==================== DATOS COMPLETOS ====================

/**
 * Obtiene todos los datos de una sección (sección + items + mesas)
 */
async function obtenerDatosCompletosSeccion(sectionId) {
    const seccion = await obtenerSeccionPorId(sectionId);
    
    if (!seccion) {
        const error = new Error('Sección no encontrada');
        error.statusCode = 404;
        throw error;
    }
    
    const items = await obtenerItemsSeccion(sectionId);
    
    // Obtener mesas de esta sección
    const mesas = await Mesa.find({ 'mapaConfig.sectionId': sectionId })
        .select('nummesa estado area mesasId mapaConfig esMesaPrincipal mesaPrincipalId mesasUnidas nombreCombinado')
        .populate('area', 'nombre')
        .lean();
    
    // Si la sección tiene área vinculada, también obtener mesas de esa área sin sección
    let mesasAreaSinSeccion = [];
    if (seccion.areaId) {
        mesasAreaSinSeccion = await Mesa.find({
            area: seccion.areaId._id,
            $or: [
                { 'mapaConfig.sectionId': { $exists: false } },
                { 'mapaConfig.sectionId': null }
            ]
        })
            .select('nummesa estado area mesasId mapaConfig esMesaPrincipal mesaPrincipalId mesasUnidas nombreCombinado')
            .populate('area', 'nombre')
            .lean();
    }
    
    return {
        seccion,
        items,
        mesas,
        mesasAreaSinSeccion
    };
}

module.exports = {
    // Sections
    listarSecciones,
    obtenerSeccionPorId,
    crearSeccion,
    actualizarSeccion,
    eliminarSeccion,
    duplicarSeccion,
    publicarSeccion,
    despublicarSeccion,
    
    // Items
    obtenerItemsSeccion,
    guardarItemsBatch,
    crearItem,
    actualizarItem,
    eliminarItem,
    
    // Datos completos
    obtenerDatosCompletosSeccion
};
