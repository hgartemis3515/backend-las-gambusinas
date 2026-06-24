const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

/**
 * TIPO DE PLATO
 * Catálogo maestro de tipos de menú (Desayuno, Carta, Cena, ...).
 * Antes eran un enum fijo en plato.model.js; ahora son configurables desde
 * el dashboard (tipos-de-platos.html).
 */
const tipoPlatoSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    slug: {
        type: String,
        required: [true, 'El slug es requerido'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^[a-z0-9]+(?:[ -][a-z0-9]+)*$/, 'El slug solo admite letras minúsculas, números, espacios y guiones']
    },
    nombre: {
        type: String,
        required: [true, 'El nombre es requerido'],
        trim: true,
        maxlength: [50, 'El nombre no puede exceder 50 caracteres']
    },
    nombreCorto: {
        type: String,
        trim: true,
        maxlength: [20, 'El nombre corto no puede exceder 20 caracteres'],
        default: ''
    },
    icono: {
        type: String,
        trim: true,
        maxlength: 50,
        default: '🍽️'
    },
    color: {
        type: String,
        trim: true,
        default: '#d4af37',
        match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'El color debe ser un hex válido (#RRGGBB)']
    },
    orden: {
        type: Number,
        default: 99
    },
    activo: {
        type: Boolean,
        default: true
    },
    esSistema: {
        type: Boolean,
        default: false
    },
    alias: [{
        type: String,
        trim: true,
        lowercase: true
    }],
    creadoPor: { type: String, default: 'admin' },
    actualizadoPor: { type: String, default: 'admin' }
}, {
    timestamps: true,
    collection: 'tipos_plato'
});

// ============ ÍNDICES ============
tipoPlatoSchema.index({ activo: 1, orden: 1 }, { name: 'idx_tipoplato_activos_orden' });
tipoPlatoSchema.index({ slug: 1 }, { unique: true, name: 'idx_tipoplato_slug' });

// ============ HOOKS ============
tipoPlatoSchema.pre('save', function (next) {
    if (this.nombre) {
        this.nombre = String(this.nombre).trim();
        if (!this.nombre) {
            return next(new Error('El nombre no puede estar vacío'));
        }
    }
    if (this.nombreCorto == null || this.nombreCorto === '') {
        this.nombreCorto = this.nombre ? this.nombre.toUpperCase() : '';
    }
    next();
});

// ============ MÉTODOS ESTÁTICOS ============

/**
 * Devuelve los slugs de tipos activos (para validación dinámica en plato.model).
 */
tipoPlatoSchema.statics.getSlugsActivos = async function () {
    const docs = await this.find({ activo: true }).select('slug alias -_id').lean();
    return docs;
};

/**
 * Mapa slug -> { slug, nombre, nombreCorto, icono, color, orden }
 * para uso en UIs (apps y dashboard).
 */
tipoPlatoSchema.statics.getMenuLigero = async function (soloActivos = true) {
    const filter = soloActivos ? { activo: true } : {};
    return this.find(filter)
        .sort({ orden: 1, nombre: 1 })
        .select('slug nombre nombreCorto icono color orden activo -_id')
        .lean();
};

tipoPlatoSchema.plugin(AutoIncrement, {
    inc_field: 'id',
    id: 'tipo_plato_seq'
});

const TipoPlato = mongoose.model('TipoPlato', tipoPlatoSchema);

module.exports = TipoPlato;