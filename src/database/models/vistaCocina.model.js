/**
 * VISTA COCINA MODEL
 * Presets de platos y apariencia visual para monitores pasivos de cocina (Ver Cocina).
 * Diferente de Zona: una Vista de Cocina alimenta TVs de pared en modo solo lectura.
 */

const mongoose = require('mongoose');

const CONFIG_VISUAL_DEFAULT = {
    fuenteFamilia: 'Inter, system-ui, sans-serif',
    tamanioFuentePlato: 36,
    tamanioFuenteDetalle: 20,
    tamanioFuenteCronometro: 28,
    colorFondo: '#0a0a0f',
    colorTextoPrincipal: '#ffffff',
    colorTextoSecundario: '#9ca3af',
    colorAcento: '#d4af37',
    colorAlertaAmarilla: '#fbbf24',
    colorAlertaRoja: '#ef4444',
    colorFilaPlato: '#1a1a28',
    espaciadoFilas: 'normal',
    mostrarCocineroTomado: false,
    mostrarComplementos: true,
    modoAltoContraste: false,
    modoNocturno: true
};

const vistaCocinaSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60
    },

    descripcion: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ''
    },

    color: {
        type: String,
        default: '#d4af37',
        match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
    },

    icono: {
        type: String,
        default: 'tools-kitchen',
        maxlength: 50
    },

    activo: {
        type: Boolean,
        default: true
    },

    // ========== FILTROS DE PLATOS ==========
    filtrosPlatos: {
        modoInclusion: {
            type: Boolean,
            default: true
        },
        platosPermitidos: [{
            type: Number
        }],
        categoriasPermitidas: [{
            type: String
        }],
        tiposPermitidos: [{
            type: String
        }]
    },

    // ========== APARIENCIA VISUAL ==========
    configVisual: {
        fuenteFamilia: { type: String, default: CONFIG_VISUAL_DEFAULT.fuenteFamilia },
        tamanioFuentePlato: { type: Number, default: CONFIG_VISUAL_DEFAULT.tamanioFuentePlato },
        tamanioFuenteDetalle: { type: Number, default: CONFIG_VISUAL_DEFAULT.tamanioFuenteDetalle },
        tamanioFuenteCronometro: { type: Number, default: CONFIG_VISUAL_DEFAULT.tamanioFuenteCronometro },
        colorFondo: { type: String, default: CONFIG_VISUAL_DEFAULT.colorFondo },
        colorTextoPrincipal: { type: String, default: CONFIG_VISUAL_DEFAULT.colorTextoPrincipal },
        colorTextoSecundario: { type: String, default: CONFIG_VISUAL_DEFAULT.colorTextoSecundario },
        colorAcento: { type: String, default: CONFIG_VISUAL_DEFAULT.colorAcento },
        colorAlertaAmarilla: { type: String, default: CONFIG_VISUAL_DEFAULT.colorAlertaAmarilla },
        colorAlertaRoja: { type: String, default: CONFIG_VISUAL_DEFAULT.colorAlertaRoja },
        colorFilaPlato: { type: String, default: CONFIG_VISUAL_DEFAULT.colorFilaPlato },
        espaciadoFilas: { type: String, enum: ['compacto', 'normal', 'amplio'], default: 'normal' },
        mostrarCocineroTomado: { type: Boolean, default: CONFIG_VISUAL_DEFAULT.mostrarCocineroTomado },
        mostrarComplementos: { type: Boolean, default: CONFIG_VISUAL_DEFAULT.mostrarComplementos },
        modoAltoContraste: { type: Boolean, default: CONFIG_VISUAL_DEFAULT.modoAltoContraste },
        modoNocturno: { type: Boolean, default: CONFIG_VISUAL_DEFAULT.modoNocturno }
    },

    // ========== ORDENAMIENTO ==========
    ordenamiento: {
        criterio: {
            type: String,
            enum: ['tiempo', 'prioridad', 'mesa', 'alfabetico'],
            default: 'prioridad'
        },
        direccion: {
            type: String,
            enum: ['asc', 'desc'],
            default: 'desc'
        }
    },

    // ========== CRONOMETRO ==========
    configCronometro: {
        tiempoAmarillo: { type: Number, default: 15 },
        tiempoRojo: { type: Number, default: 20 }
    },

    // Auditoría
    creadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        default: null
    },
    actualizadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        default: null
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

vistaCocinaSchema.index({ nombre: 1 });
vistaCocinaSchema.index({ activo: 1 });

/**
 * Determina si un plato debe mostrarse segun los filtros de esta vista
 * @param {Object} plato - Plato de comanda (con platoId, categoria, tipo)
 * @returns {boolean}
 */
vistaCocinaSchema.methods.debeMostrarPlato = function(plato) {
    const f = this.filtrosPlatos;
    const platoId = plato.platoId ?? plato.id ?? plato._id;
    const categorias = plato.categorias || (plato.categoria ? [plato.categoria] : []);
    const tipos = plato.tipos || (plato.tipo ? [plato.tipo] : []);

    const coincidePlato = f.platosPermitidos.length === 0 || f.platosPermitidos.includes(Number(platoId));
    const coincideCategoria = f.categoriasPermitidas.length === 0 || categorias.some(c => f.categoriasPermitidas.includes(c));
    const coincideTipo = f.tiposPermitidos.length === 0 || tipos.some(t => f.tiposPermitidos.includes(t));
    const cumple = coincidePlato && coincideCategoria && coincideTipo;

    return f.modoInclusion ? cumple : !cumple;
};

vistaCocinaSchema.statics.getConfigVisualDefault = function() {
    return { ...CONFIG_VISUAL_DEFAULT };
};

module.exports = mongoose.model('VistaCocina', vistaCocinaSchema);