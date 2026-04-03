/**
 * Layout Controller
 * Gestión de secciones, items y publicación de layouts
 */

const LayoutSection = require('../database/models/layoutSection.model');
const LayoutItem = require('../database/models/layoutItem.model');
const Mesa = require('../database/models/mesas.model');
const Area = require('../database/models/area.model');

// ==================== SECCIONES ====================

/**
 * Obtener todas las secciones
 */
async function getSecciones(req, res) {
  try {
    const secciones = await LayoutSection.find({ activo: true })
      .sort({ orden: 1 });

    // Agregar conteo de items y mesas
    const seccionesConConteo = await Promise.all(secciones.map(async (sec) => {
      try {
        const itemCount = await LayoutItem.countDocuments({ sectionId: sec._id });
        const mesaCount = await Mesa.countDocuments({ 'mapaConfig.sectionId': sec._id });

        return {
          ...sec.toObject(),
          itemCount,
          mesaCount
        };
      } catch (e) {
        return {
          ...sec.toObject(),
          itemCount: 0,
          mesaCount: 0
        };
      }
    }));

    res.json({ success: true, secciones: seccionesConConteo });
  } catch (error) {
    console.error('Error al obtener secciones:', error);
    res.status(500).json({ success: false, error: 'Error al obtener secciones', details: error.message });
  }
}

/**
 * Obtener una sección por ID
 */
async function getSeccionById(req, res) {
  try {
    const { id } = req.params;

    const seccion = await LayoutSection.findById(id)
      .populate('areaId', 'nombre')
      .populate('publicadoBy', 'nombre email');

    if (!seccion) {
      return res.status(404).json({ success: false, error: 'Sección no encontrada' });
    }

    res.json({ success: true, seccion });
  } catch (error) {
    console.error('Error al obtener sección:', error);
    res.status(500).json({ success: false, error: 'Error al obtener sección' });
  }
}

/**
 * Obtener sección completa con items y mesas
 */
async function getSeccionCompleta(req, res) {
  try {
    const { id } = req.params;

    const seccion = await LayoutSection.findById(id);

    if (!seccion) {
      return res.status(404).json({ success: false, error: 'Sección no encontrada' });
    }

    // Obtener items de la sección
    let items = [];
    try {
      items = await LayoutItem.find({ sectionId: id, visible: true }).sort({ zIndex: 1 });
    } catch (e) {
      console.error('Error al obtener items:', e);
    }

    // Obtener mesas en la sección
    let mesas = [];
    try {
      mesas = await Mesa.find({ 'mapaConfig.sectionId': id });
    } catch (e) {
      console.error('Error al obtener mesas de la sección:', e);
    }

    // Obtener mesas sin sección para el panel lateral
    let mesasAreaSinSeccion = [];
    try {
      if (seccion.areaId) {
        mesasAreaSinSeccion = await Mesa.find({
          area: seccion.areaId,
          $or: [
            { 'mapaConfig.sectionId': { $exists: false } },
            { 'mapaConfig.sectionId': null }
          ]
        });
      } else {
        mesasAreaSinSeccion = await Mesa.find({
          $or: [
            { 'mapaConfig.sectionId': { $exists: false } },
            { 'mapaConfig.sectionId': null }
          ]
        });
      }
    } catch (e) {
      console.error('Error al obtener mesas sin sección:', e);
    }

    res.json({
      success: true,
      seccion: seccion.toObject(),
      items,
      mesas,
      mesasAreaSinSeccion
    });
  } catch (error) {
    console.error('Error al obtener sección completa:', error);
    res.status(500).json({ success: false, error: 'Error al obtener sección completa', details: error.message });
  }
}

/**
 * Crear nueva sección
 */
async function createSeccion(req, res) {
  try {
    const { nombre, areaId, canvasWidth, canvasHeight, gridSize, color, metadata } = req.body;

    // Verificar si ya existe una sección con el mismo nombre
    const existente = await LayoutSection.findOne({ nombre, activo: true });
    if (existente) {
      return res.status(400).json({ success: false, error: 'Ya existe una sección con ese nombre' });
    }

    // Obtener el máximo orden
    const ultimaSeccion = await LayoutSection.findOne().sort({ orden: -1 });
    const orden = ultimaSeccion ? ultimaSeccion.orden + 1 : 0;

    const seccion = new LayoutSection({
      nombre,
      areaId: areaId || null,
      canvasWidth: canvasWidth || 1600,
      canvasHeight: canvasHeight || 1200,
      gridSize: gridSize || 25,
      color: color || '#1a1a28',
      orden,
      metadata
    });

    await seccion.save();

    res.json({ success: true, seccion, message: 'Sección creada correctamente' });
  } catch (error) {
    console.error('Error al crear sección:', error);
    res.status(500).json({ success: false, error: 'Error al crear sección' });
  }
}

/**
 * Actualizar sección
 */
async function updateSeccion(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;

    const seccion = await LayoutSection.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!seccion) {
      return res.status(404).json({ success: false, error: 'Sección no encontrada' });
    }

    res.json({ success: true, seccion, message: 'Sección actualizada correctamente' });
  } catch (error) {
    console.error('Error al actualizar sección:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar sección' });
  }
}

/**
 * Eliminar sección
 */
async function deleteSeccion(req, res) {
  try {
    const { id } = req.params;

    // Verificar que no esté publicada
    const seccion = await LayoutSection.findById(id);
    if (!seccion) {
      return res.status(404).json({ success: false, error: 'Sección no encontrada' });
    }

    if (seccion.publicado) {
      return res.status(400).json({ success: false, error: 'No se puede eliminar una sección publicada' });
    }

    // Eliminar items asociados
    await LayoutItem.deleteMany({ sectionId: id });

    // Quitar referencia de mesas
    await Mesa.updateMany(
      { 'mapaConfig.sectionId': id },
      { $unset: { 'mapaConfig.sectionId': '' } }
    );

    // Marcar como inactiva en lugar de eliminar
    seccion.activo = false;
    await seccion.save();

    res.json({ success: true, message: 'Sección eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar sección:', error);
    res.status(500).json({ success: false, error: 'Error al eliminar sección' });
  }
}

/**
 * Publicar sección
 */
async function publicarSeccion(req, res) {
  try {
    const { id } = req.params;
    const adminId = req.admin?._id || req.userId;

    const seccion = await LayoutSection.findById(id);
    if (!seccion) {
      return res.status(404).json({ success: false, error: 'Sección no encontrada' });
    }

    await seccion.publicar(adminId);

    // Emitir evento socket para actualizar app de mozos
    if (global.io) {
      global.io.emit('layout-publicado', { sectionId: id, seccion });
    }

    res.json({
      success: true,
      seccion,
      message: 'Layout publicado correctamente. Los mozos verán los cambios.'
    });
  } catch (error) {
    console.error('Error al publicar sección:', error);
    res.status(500).json({ success: false, error: 'Error al publicar sección' });
  }
}

/**
 * Despublicar sección
 */
async function despublicarSeccion(req, res) {
  try {
    const { id } = req.params;

    const seccion = await LayoutSection.findById(id);
    if (!seccion) {
      return res.status(404).json({ success: false, error: 'Sección no encontrada' });
    }

    await seccion.despublicar();

    res.json({ success: true, seccion, message: 'Sección despublicada' });
  } catch (error) {
    console.error('Error al despublicar sección:', error);
    res.status(500).json({ success: false, error: 'Error al despublicar sección' });
  }
}

/**
 * Duplicar sección
 */
async function duplicarSeccion(req, res) {
  try {
    const { id } = req.params;

    const seccion = await LayoutSection.findById(id);
    if (!seccion) {
      return res.status(404).json({ success: false, error: 'Sección no encontrada' });
    }

    const nuevaSeccion = await seccion.duplicar();

    res.json({
      success: true,
      seccion: nuevaSeccion,
      message: 'Sección duplicada correctamente'
    });
  } catch (error) {
    console.error('Error al duplicar sección:', error);
    res.status(500).json({ success: false, error: 'Error al duplicar sección' });
  }
}

// ==================== ITEMS ====================

/**
 * Obtener items de una sección
 */
async function getItemsBySection(req, res) {
  try {
    const { sectionId } = req.params;

    const items = await LayoutItem.find({ sectionId, visible: true }).sort({ zIndex: 1 });

    res.json({ success: true, items });
  } catch (error) {
    console.error('Error al obtener items:', error);
    res.status(500).json({ success: false, error: 'Error al obtener items' });
  }
}

/**
 * Crear item
 */
async function createItem(req, res) {
  try {
    const { sectionId, tipo, x, y, width, height, texto, color, opacity, locked, zIndex } = req.body;

    const item = new LayoutItem({
      sectionId,
      tipo,
      x: x || 0,
      y: y || 0,
      width: width || 100,
      height: height || 20,
      texto,
      color: color || '#333333',
      opacity: opacity || 1,
      locked: locked || false,
      zIndex: zIndex || 1
    });

    await item.save();

    res.json({ success: true, item, message: 'Item creado correctamente' });
  } catch (error) {
    console.error('Error al crear item:', error);
    res.status(500).json({ success: false, error: 'Error al crear item' });
  }
}

/**
 * Actualizar item
 */
async function updateItem(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;

    const item = await LayoutItem.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({ success: false, error: 'Item no encontrado' });
    }

    res.json({ success: true, item });
  } catch (error) {
    console.error('Error al actualizar item:', error);
    res.status(500).json({ success: false, error: 'Error al actualizar item' });
  }
}

/**
 * Actualizar múltiples items (bulk)
 */
async function updateItemsBulk(req, res) {
  try {
    const { sectionId, items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'Se requiere un array de items' });
    }

    // Eliminar items existentes de la sección
    await LayoutItem.deleteMany({ sectionId });

    // Crear nuevos items
    if (items.length > 0) {
      const itemsToCreate = items.map(item => ({
        ...item,
        sectionId,
        _id: item.id || item._id || new mongoose.Types.ObjectId()
      }));

      await LayoutItem.insertMany(itemsToCreate);
    }

    res.json({ success: true, message: 'Items guardados correctamente' });
  } catch (error) {
    console.error('Error al guardar items:', error);
    res.status(500).json({ success: false, error: 'Error al guardar items' });
  }
}

/**
 * Eliminar item
 */
async function deleteItem(req, res) {
  try {
    const { id } = req.params;

    const item = await LayoutItem.findByIdAndDelete(id);

    if (!item) {
      return res.status(404).json({ success: false, error: 'Item no encontrado' });
    }

    res.json({ success: true, message: 'Item eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar item:', error);
    res.status(500).json({ success: false, error: 'Error al eliminar item' });
  }
}

const mongoose = require('mongoose');

module.exports = {
  // Secciones
  getSecciones,
  getSeccionById,
  getSeccionCompleta,
  createSeccion,
  updateSeccion,
  deleteSeccion,
  publicarSeccion,
  despublicarSeccion,
  duplicarSeccion,

  // Items
  getItemsBySection,
  createItem,
  updateItem,
  updateItemsBulk,
  deleteItem
};
