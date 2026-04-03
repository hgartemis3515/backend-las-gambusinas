/**
 * LayoutItem Model
 * Elementos decorativos/estructurales del canvas (NO son mesas)
 * Tipos: barrier, wall, door, label, zone, decoration
 */

const mongoose = require('mongoose');

const layoutItemSchema = new mongoose.Schema({
  // Referencia a la sección
  sectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LayoutSection',
    required: [true, 'La sección es requerida']
  },

  // Tipo de elemento
  tipo: {
    type: String,
    enum: ['barrier', 'wall', 'door', 'label', 'zone', 'decoration'],
    required: [true, 'El tipo es requerido']
  },

  // Posición
  x: {
    type: Number,
    default: 0,
    min: [0, 'La posición X no puede ser negativa']
  },

  y: {
    type: Number,
    default: 0,
    min: [0, 'La posición Y no puede ser negativa']
  },

  // Dimensiones
  width: {
    type: Number,
    default: 100,
    min: [10, 'El ancho mínimo es 10px'],
    max: [2000, 'El ancho máximo es 2000px']
  },

  height: {
    type: Number,
    default: 20,
    min: [10, 'El alto mínimo es 10px'],
    max: [2000, 'El alto máximo es 2000px']
  },

  // Rotación (grados)
  rotation: {
    type: Number,
    default: 0,
    min: [0, 'La rotación mínima es 0'],
    max: [360, 'La rotación máxima es 360']
  },

  // Orden de apilamiento
  zIndex: {
    type: Number,
    default: 1,
    min: [0, 'El zIndex mínimo es 0']
  },

  // Para labels - texto
  texto: {
    type: String,
    trim: true,
    maxlength: [100, 'El texto no puede exceder 100 caracteres']
  },

  // Para labels - tamaño de fuente
  fontSize: {
    type: Number,
    default: 14,
    min: [8, 'El tamaño mínimo de fuente es 8'],
    max: [72, 'El tamaño máximo de fuente es 72']
  },

  // Para labels - peso de fuente
  fontWeight: {
    type: String,
    enum: ['normal', 'bold', 'lighter', 'bolder'],
    default: 'normal'
  },

  // Color
  color: {
    type: String,
    default: '#333333',
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Color debe ser un valor hexadecimal válido']
  },

  // Opacidad
  opacity: {
    type: Number,
    default: 1,
    min: [0.1, 'La opacidad mínima es 0.1'],
    max: [1, 'La opacidad máxima es 1']
  },

  // Bloqueado para edición
  locked: {
    type: Boolean,
    default: false
  },

  // Visible
  visible: {
    type: Boolean,
    default: true
  },

  // Metadatos adicionales
  metadata: {
    descripcion: String,
    categoria: String,
    customData: mongoose.Schema.Types.Mixed
  }

}, {
  timestamps: true
});

// Índices
layoutItemSchema.index({ sectionId: 1 });
layoutItemSchema.index({ sectionId: 1, zIndex: 1 });
layoutItemSchema.index({ tipo: 1 });

// Método para verificar colisión con otro item
layoutItemSchema.methods.colisionaCon = function(otroItem) {
  if (!otroItem || otroItem._id.equals(this._id)) return false;

  return !(
    this.x + this.width <= otroItem.x ||
    otroItem.x + otroItem.width <= this.x ||
    this.y + this.height <= otroItem.y ||
    otroItem.y + otroItem.height <= this.y
  );
};

// Método para mover
layoutItemSchema.methods.mover = function(nuevaX, nuevaY, gridSize = 25) {
  // Snap al grid
  this.x = Math.round(nuevaX / gridSize) * gridSize;
  this.y = Math.round(nuevaY / gridSize) * gridSize;
  return this.save();
};

// Método para redimensionar
layoutItemSchema.methods.redimensionar = function(nuevoAncho, nuevoAlto, gridSize = 25) {
  this.width = Math.round(nuevoAncho / gridSize) * gridSize;
  this.height = Math.round(nuevoAlto / gridSize) * gridSize;
  return this.save();
};

// Método para rotar
layoutItemSchema.methods.rotar = function(grados) {
  this.rotation = (this.rotation + grados) % 360;
  return this.save();
};

// Static para obtener items por sección
layoutItemSchema.statics.getBySection = async function(sectionId) {
  return this.find({ sectionId, visible: true }).sort({ zIndex: 1 });
};

// Static para obtener items por tipo
layoutItemSchema.statics.getByType = async function(sectionId, tipo) {
  return this.find({ sectionId, tipo, visible: true }).sort({ zIndex: 1 });
};

// Static para crear múltiples items
layoutItemSchema.statics.createBulk = async function(sectionId, items) {
  const itemsToCreate = items.map(item => ({
    ...item,
    sectionId
  }));

  return this.insertMany(itemsToCreate);
};

// Static para actualizar múltiples items
layoutItemSchema.statics.updateBulk = async function(items) {
  const bulkOps = items.map(item => ({
    updateOne: {
      filter: { _id: item.id || item._id },
      update: { $set: item }
    }
  }));

  return this.bulkWrite(bulkOps);
};

// Static para eliminar todos los items de una sección
layoutItemSchema.statics.deleteBySection = async function(sectionId) {
  return this.deleteMany({ sectionId });
};

const LayoutItem = mongoose.model('LayoutItem', layoutItemSchema);

module.exports = LayoutItem;
