const mongoose = require('mongoose');

const layoutSectionSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true
    },
    
    // Área vinculada (opcional - puede haber secciones sin área)
    areaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'areas',
        default: null
    },
    
    // Dimensiones del canvas
    canvasWidth: {
        type: Number,
        default: 1600,
        min: 400,
        max: 4000
    },
    canvasHeight: {
        type: Number,
        default: 1200,
        min: 300,
        max: 3000
    },
    
    // Configuración de grid
    gridSize: {
        type: Number,
        default: 25,
        min: 10,
        max: 100
    },
    
    // Zoom por defecto (0.5 = 50%, 1 = 100%, 2 = 200%)
    zoomDefault: {
        type: Number,
        default: 1,
        min: 0.25,
        max: 3
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
        ref: 'admins',
        default: null
    },
    
    // Versionado
    borradorVersion: {
        type: Number,
        default: 1
    },
    
    // Estilos
    color: {
        type: String,
        default: '#1a1a28'
    },
    
    // Estado activo
    activo: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    collection: 'layoutsections'
});

// Índices
layoutSectionSchema.index({ areaId: 1 });
layoutSectionSchema.index({ orden: 1 });
layoutSectionSchema.index({ publicado: 1, activo: 1 });

const LayoutSection = mongoose.model('LayoutSection', layoutSectionSchema);

module.exports = LayoutSection;
