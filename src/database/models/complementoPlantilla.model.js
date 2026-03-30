const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

/**
 * Modelo para Biblioteca Maestra de Complementos Reutilizables
 * 
 * Este modelo permite crear plantillas de complementos que pueden ser
 * reutilizadas en múltiples platos, evitando la creación manual repetitiva.
 * 
 * Ejemplos: "Término de cocción", "Guarnición", "Salsas", "Proteína"
 */
const complementoPlantillaSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    nombre: {
        type: String,
        required: [true, 'El nombre del complemento es requerido'],
        trim: true,
        unique: true,
        maxlength: [100, 'El nombre no puede exceder 100 caracteres']
    },
    nombreLower: {
        type: String,
        required: false,
        lowercase: true,
        trim: true
    },
    descripcion: {
        type: String,
        trim: true,
        maxlength: [500, 'La descripción no puede exceder 500 caracteres'],
        default: ''
    },
    opciones: [{
        type: String,
        trim: true,
        maxlength: [100, 'Cada opción no puede exceder 100 caracteres']
    }],
    obligatorio: {
        type: Boolean,
        default: false
    },
    seleccionMultiple: {
        type: Boolean,
        default: false
    },
    // ===== NUEVOS CAMPOS PARA CANTIDADES v2.0 =====
    // Modo de selección: 'opciones' (solo marcar) o 'cantidades' (especificar cantidad)
    modoSeleccion: { 
        type: String, 
        enum: ['opciones', 'cantidades'], 
        default: 'opciones' 
    },
    // Máximo de unidades que se pueden elegir en total dentro del grupo
    maxUnidadesGrupo: { type: Number, default: null },
    // Mínimo de unidades que se deben elegir
    minUnidadesGrupo: { type: Number, default: null },
    // Máximo de unidades que puede tener una sola opción
    maxUnidadesPorOpcion: { type: Number, default: null },
    // Si se permite repetir la misma opción múltiples veces
    permiteRepetirOpcion: { type: Boolean, default: true },
    // ===== FIN NUEVOS CAMPOS =====
    categoria: {
        type: String,
        trim: true,
        default: 'General',
        maxlength: [50, 'La categoría no puede exceder 50 caracteres']
    },
    activo: {
        type: Boolean,
        default: true
    },
    // Metadatos para auditoría
    creadoPor: {
        type: String,
        default: 'admin'
    },
    actualizadoPor: {
        type: String,
        default: 'admin'
    }
}, {
    timestamps: true,
    collection: 'complementos_plantilla'
});

// ============ ÍNDICES ============
// Índice para búsqueda por nombre (autocompletado)
complementoPlantillaSchema.index(
    { activo: 1, nombreLower: 1 },
    { name: 'idx_complemento_nombre_search' }
);

// Índice para filtrar por categoría
complementoPlantillaSchema.index(
    { activo: 1, categoria: 1 },
    { name: 'idx_complemento_categoria' }
);

// ============ HOOKS ============
complementoPlantillaSchema.pre('save', function(next) {
    // Normalizar nombre
    if (this.nombre) {
        this.nombre = this.nombre.trim();
        this.nombreLower = this.nombre.toLowerCase();
        
        if (!this.nombre) {
            return next(new Error('El nombre no puede estar vacío'));
        }
    }
    
    // Validar que haya al menos una opción si el complemento es obligatorio
    if (this.obligatorio && (!this.opciones || this.opciones.length === 0)) {
        return next(new Error('Un complemento obligatorio debe tener al menos una opción'));
    }
    
    // Limpiar opciones vacías y duplicados
    if (this.opciones && Array.isArray(this.opciones)) {
        const opcionesLimpias = this.opciones
            .map(op => typeof op === 'string' ? op.trim() : '')
            .filter(op => op.length > 0);
        
        // Remover duplicados preservando orden
        const opcionesUnicas = [...new Set(opcionesLimpias)];
        this.opciones = opcionesUnicas;
    }
    
    next();
});

// ============ MÉTODOS ESTÁTICOS ============

/**
 * Obtener todas las categorías disponibles
 */
complementoPlantillaSchema.statics.getCategorias = async function() {
    const categorias = await this.distinct('categoria', { activo: true });
    return categorias.sort();
};

/**
 * Buscar complementos por término
 */
complementoPlantillaSchema.statics.buscar = async function(termino, opciones = {}) {
    const query = { activo: true };
    
    if (termino && termino.trim()) {
        query.nombreLower = new RegExp(termino.toLowerCase().trim(), 'i');
    }
    
    if (opciones.categoria) {
        query.categoria = opciones.categoria;
    }
    
    return this.find(query)
        .sort({ nombre: 1 })
        .limit(opciones.limit || 100)
        .lean();
};

/**
 * Contar platos que usan un complemento específico
 */
complementoPlantillaSchema.statics.contarUsoEnPlatos = async function(complementoId, PlatoModel) {
    const complemento = await this.findById(complementoId);
    if (!complemento) return 0;
    
    // Buscar platos que tienen un grupo de complemento con el mismo nombre
    const count = await PlatoModel.countDocuments({
        'complementos.grupo': complemento.nombre
    });
    
    return count;
};

// Aplicar auto-incremento al campo id con identificador único para evitar conflicto
complementoPlantillaSchema.plugin(AutoIncrement, { 
    inc_field: 'id',
    id: 'complemento_plantilla_seq'
});

const ComplementoPlantilla = mongoose.model('ComplementoPlantilla', complementoPlantillaSchema);

module.exports = ComplementoPlantilla;
