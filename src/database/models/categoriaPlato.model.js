const mongoose = require('mongoose');
const { validarCodigoMozo } = require('../../utils/validarCodigoPlato');

/**
 * Catálogo de categorías de platos (nombre + código de mozo).
 * El nombre en `platos.categoria` sigue siendo el agrupador; aquí vive el código de mozo
 * y permite renombrar / mover sin perder metadatos.
 */
const categoriaPlatoSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
    },
    nombreLower: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    codigoMozo: {
        type: String,
        default: '',
        trim: true,
        uppercase: true,
        validate: {
            validator(v) {
                return validarCodigoMozo(v).valido;
            },
            message: 'El código de mozo de la categoría debe tener 1 a 4 letras o números',
        },
    },
    /** Ruta pública, p. ej. /uploads/categorias/xxx.jpg. El código no es único: puede repetirse entre tipos de menú. */
    imagenUrl: {
        type: String,
        default: '',
        trim: true,
        maxlength: 240,
    },
    orden: { type: Number, default: 99 },
    /** Prioridad en una carta (slug de tipo). Menor = más arriba. Si falta, se usa codigoMozo 1–10. */
    ordenPorTipo: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({}),
    },
    /** Slugs de carta donde la categoría no se muestra al mozo. */
    ocultoEnTipos: {
        type: [String],
        default: () => [],
    },
}, { timestamps: true });

categoriaPlatoSchema.pre('validate', function (next) {
    const n = String(this.nombre || '').trim();
    this.nombre = n;
    this.nombreLower = n.toLowerCase();
    const r = validarCodigoMozo(this.codigoMozo);
    this.codigoMozo = r.valido ? r.codigo : '';
    next();
});

module.exports = mongoose.model('categorias_plato', categoriaPlatoSchema);
