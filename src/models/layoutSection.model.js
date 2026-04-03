/**
 * LayoutSection Model
 * Representa una sección/área visual del mapa del restaurante
 * Separa la lógica de "área operativa" de "sección de layout"
 */

const mongoose = require('mongoose');

const layoutSectionSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre de la sección es requerido'],
    trim: true,
    maxlength: [50, 'El nombre no puede exceder 50 caracteres']
  },

  // Área vinculada (opcional - puede no estar vinculada a un área operativa)
  areaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Area',
    default: null
  },

  // Dimensiones del canvas
  canvasWidth: {
    type: Number,
    default: 1600,
    min: [400, 'El ancho mínimo es 400px'],
    max: [4000, 'El ancho máximo es 4000px']
  },

  canvasHeight: {
    type: Number,
    default: 1200,
    min: [300, 'El alto mínimo es 300px'],
    max: [3000, 'El alto máximo es 3000px']
  },

  // Configuración del grid
  gridSize: {
    type: Number,
    default: 25,
    min: [10, 'El grid mínimo es 10px'],
    max: [100, 'El grid máximo es 100px']
  },

  // Zoom por defecto
  zoomDefault: {
    type: Number,
    default: 1,
    min: [0.5, 'El zoom mínimo es 0.5'],
    max: [2, 'El zoom máximo es 2']
  },

  // Orden de visualización
  orden: {
    type: Number,
    default: 0
  },

  // Estado de publicación
  publicado: {
    type: Boolean,
    default: false
  },

  publicadoAt: {
    type: Date,
    default: null
  },

  publicadoBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },

  // Control de versiones de borrador
  borradorVersion: {
    type: Number,
    default: 1
  },

  // Color de fondo del canvas
  color: {
    type: String,
    default: '#1a1a28',
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Color debe ser un valor hexadecimal válido']
  },

  // Estado activo
  activo: {
    type: Boolean,
    default: true
  },

  // Metadatos adicionales
  metadata: {
    descripcion: String,
    icono: String,
    tags: [String]
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual para items del layout
layoutSectionSchema.virtual('items', {
  ref: 'LayoutItem',
  localField: '_id',
  foreignField: 'sectionId'
});

// Virtual para mesas en esta sección
layoutSectionSchema.virtual('mesas', {
  ref: 'Mesa',
  localField: '_id',
  foreignField: 'mapaConfig.sectionId'
});

// Índices
layoutSectionSchema.index({ areaId: 1 });
layoutSectionSchema.index({ publicado: 1 });
layoutSectionSchema.index({ orden: 1 });

// Método para publicar
layoutSectionSchema.methods.publicar = function(adminId) {
  this.publicado = true;
  this.publicadoAt = new Date();
  this.publicadoBy = adminId;
  return this.save();
};

// Método para despublicar
layoutSectionSchema.methods.despublicar = function() {
  this.publicado = false;
  return this.save();
};

// Método para duplicar sección
layoutSectionSchema.methods.duplicar = async function() {
  const LayoutItem = mongoose.model('LayoutItem');
  const Mesa = mongoose.model('Mesa');

  // Crear nueva sección
  const nuevaSeccion = new this.constructor({
    nombre: `${this.nombre} (copia)`,
    areaId: this.areaId,
    canvasWidth: this.canvasWidth,
    canvasHeight: this.canvasHeight,
    gridSize: this.gridSize,
    zoomDefault: this.zoomDefault,
    orden: this.orden + 1,
    color: this.color,
    metadata: this.metadata
  });

  await nuevaSeccion.save();

  // Duplicar items
  const items = await LayoutItem.find({ sectionId: this._id });
  for (const item of items) {
    const nuevoItem = new LayoutItem({
      ...item.toObject(),
      _id: undefined,
      sectionId: nuevaSeccion._id,
      createdAt: undefined,
      updatedAt: undefined
    });
    await nuevoItem.save();
  }

  return nuevaSeccion;
};

// Static para obtener secciones con conteo
layoutSectionSchema.statics.getWithCounts = async function() {
  const LayoutItem = mongoose.model('LayoutItem');
  const Mesa = mongoose.model('Mesa');

  const secciones = await this.find({ activo: true }).sort({ orden: 1 });

  const seccionesConConteo = await Promise.all(secciones.map(async (sec) => {
    const itemCount = await LayoutItem.countDocuments({ sectionId: sec._id });
    const mesaCount = await Mesa.countDocuments({ 'mapaConfig.sectionId': sec._id });
    return {
      ...sec.toObject(),
      itemCount,
      mesaCount
    };
  }));

  return seccionesConConteo;
};

const LayoutSection = mongoose.model('LayoutSection', layoutSectionSchema);

module.exports = LayoutSection;
