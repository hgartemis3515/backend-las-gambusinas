const mongoose = require('mongoose');

/**
 * LayoutItem - Elementos decorativos/estructurales del canvas
 * NO son mesas, son barreras, paredes, etiquetas, zonas, etc.
 */
const layoutItemSchema = new mongoose.Schema({
    // Sección a la que pertenece
    sectionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LayoutSection',
        required: true
    },
    
    // Tipo de elemento
    tipo: {
        type: String,
        enum: ['barrier', 'wall', 'door', 'label', 'zone', 'decoration'],
        required: true
    },
    
    // Posición
    x: {
        type: Number,
        default: 0
    },
    y: {
        type: Number,
        default: 0
    },
    
    // Dimensiones
    width: {
        type: Number,
        default: 100
    },
    height: {
        type: Number,
        default: 20
    },
    
    // Rotación en grados
    rotation: {
        type: Number,
        default: 0,
        min: 0,
        max: 360
    },
    
    // Profundidad (z-index)
    zIndex: {
        type: Number,
        default: 1
    },
    
    // Para labels - texto
    texto: {
        type: String,
        default: null
    },
    fontSize: {
        type: Number,
        default: 14,
        min: 8,
        max: 72
    },
    fontWeight: {
        type: String,
        enum: ['normal', 'bold'],
        default: 'normal'
    },
    
    // Estilos visuales
    color: {
        type: String,
        default: '#333333'
    },
    backgroundColor: {
        type: String,
        default: 'transparent'
    },
    opacity: {
        type: Number,
        default: 1,
        min: 0,
        max: 1
    },
    borderRadius: {
        type: Number,
        default: 0
    },
    borderWidth: {
        type: Number,
        default: 0
    },
    borderColor: {
        type: String,
        default: '#333333'
    },
    
    // Bloqueo de edición
    locked: {
        type: Boolean,
        default: false
    },
    
    // Visibilidad
    visible: {
        type: Boolean,
        default: true
    },
    
    // Metadatos adicionales (para extensiones futuras)
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true,
    collection: 'layoutitems'
});

// Índices
layoutItemSchema.index({ sectionId: 1, zIndex: 1 });
layoutItemSchema.index({ sectionId: 1, tipo: 1 });

const LayoutItem = mongoose.model('LayoutItem', layoutItemSchema);

module.exports = LayoutItem;
