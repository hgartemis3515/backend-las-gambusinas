const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

const areaSchema = new mongoose.Schema({
    areaId: { type: Number, unique: true },
    nombre: { 
        type: String, 
        required: true,
        unique: true,
        trim: true
    },
    descripcion: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    // ========== CAMPOS PARA MAPA DE MESAS ==========
    // Si el mapa del área está publicado (visible para mozos)
    mapaPublicado: {
        type: Boolean,
        default: false
    },
    
    // Habilitación del modo layout para esta área
    mapaHabilitado: {
        type: Boolean,
        default: false
    },
    
    // Sección de layout vinculada
    layoutSectionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LayoutSection',
        default: null
    },
    
    // Dimensiones del canvas (legado - para compatibilidad)
    canvasWidth: {
        type: Number,
        default: 1600
    },
    canvasHeight: {
        type: Number,
        default: 1200
    },
    
    // Color de fondo del área en el mapa
    color: {
        type: String,
        default: '#1a1a28'
    }
    // ========== FIN CAMPOS MAPA DE MESAS ==========
});

// Actualizar updatedAt antes de guardar
areaSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

areaSchema.plugin(AutoIncrement, { inc_field: 'areaId' });
const Area = mongoose.model("areas", areaSchema);

module.exports = Area;

