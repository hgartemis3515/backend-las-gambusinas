const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

const mesasSchema = new mongoose.Schema({
    mesasId: { type: Number, unique: true },
    nummesa: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, required: true},
    estado: {
        type: String,
        enum: ['libre', 'esperando', 'pedido', 'preparado', 'pagado', 'reservado'],
        default: 'libre',
        required: true
    },
    area: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'areas',
        required: true
    },
    
    // ========== CAMPOS PARA GRUPOS DE MESAS (Juntar/Separar) ==========
    // Una mesa puede ser:
    // - Independiente: esMesaPrincipal=true, mesasUnidas=[]
    // - Principal de grupo: esMesaPrincipal=true, mesasUnidas=[...ids de secundarias]
    // - Secundaria de grupo: esMesaPrincipal=false, mesaPrincipalId=ID de la principal
    
    esMesaPrincipal: {
        type: Boolean,
        default: true,
        required: true
    },
    
    mesaPrincipalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mesas',
        default: null
    },
    
    mesasUnidas: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mesas'
    }],
    
    fechaUnion: {
        type: Date,
        default: null
    },
    
    unidoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        default: null
    },
    
    motivoUnion: {
        type: String,
        default: null
    },
    
    // Nombre combinado para mesas juntadas (ej: "Mesa 1 y Mesa 2")
    nombreCombinado: {
        type: String,
        default: null
    },
    // ========== FIN CAMPOS GRUPOS DE MESAS ==========
    
    // ========== CAMPOS PARA MAPA DE MESAS ==========
    // Configuración de posición y estilo en el editor de mapa
    mapaConfig: {
        // Posición en píxeles
        x: { type: Number, default: null },
        y: { type: Number, default: null },
        
        // Dimensiones
        width: { type: Number, default: 80 },
        height: { type: Number, default: 80 },
        
        // Forma visual
        shape: { type: String, enum: ['rect', 'round'], default: 'rect' },
        
        // Sección de layout a la que pertenece
        sectionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'LayoutSection',
            default: null
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
            default: 10
        },
        
        // Bloqueo de edición
        locked: {
            type: Boolean,
            default: false
        },
        
        // Visibilidad en el mapa
        visible: { type: Boolean, default: true }
    }
    // ========== FIN CAMPOS MAPA DE MESAS ==========
});

// ========== FASE A1: ÍNDICES OPTIMIZADOS ==========
// Índice compuesto único existente para nummesa por área
mesasSchema.index({ nummesa: 1, area: 1 }, { unique: true });

// ÍNDICE 1: Búsqueda por estado y área (mapa de mesas - endpoint frecuente)
// Query: mesas por estado (libre, pedido, preparado, etc.)
mesasSchema.index(
    { isActive: 1, estado: 1, area: 1 },
    { name: 'idx_mesa_estado_area' }
);

// ÍNDICE 2: Mesas activas ordenadas por número (listado rápido)
mesasSchema.index(
    { isActive: 1, nummesa: 1 },
    { name: 'idx_mesa_activa_num' }
);

// ÍNDICE 3: Mesas que son principales de grupo
mesasSchema.index(
    { esMesaPrincipal: 1, isActive: 1 },
    { name: 'idx_mesa_principal' }
);

// ÍNDICE 4: Buscar mesas secundarias por su mesa principal
mesasSchema.index(
    { mesaPrincipalId: 1 },
    { name: 'idx_mesa_principal_ref' }
);
// ========== FIN ÍNDICES FASE A1 ==========

mesasSchema.plugin(AutoIncrement, { inc_field: 'mesasId' });
const mesas = mongoose.model("mesas", mesasSchema);

module.exports = mesas;
