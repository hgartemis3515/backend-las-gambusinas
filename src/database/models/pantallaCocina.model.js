/**
 * PANTALLA COCINA MODEL
 * Representa un televisor físico (1-8) en la cocina y la Vista de Cocina asignada.
 */

const mongoose = require('mongoose');

const pantallaCocinaSchema = new mongoose.Schema({
    numeroPantalla: {
        type: Number,
        required: true,
        min: 1,
        max: 16
    },

    nombre: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60
    },

    vistaCocinaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VistaCocina',
        default: null
    },

    activo: {
        type: Boolean,
        default: true
    },

    orden: {
        type: Number,
        default: 0
    },

    configDespliegue: {
        anchoVentana: { type: Number, default: 1920 },
        altoVentana: { type: Number, default: 1080 },
        posicionX: { type: Number, default: 0 },
        posicionY: { type: Number, default: 0 },
        pantallaCompleta: { type: Boolean, default: true },
        ocultarCursor: { type: Boolean, default: true },
        ocultarBarraTareas: { type: Boolean, default: true }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

pantallaCocinaSchema.index({ numeroPantalla: 1 }, { unique: true });
pantallaCocinaSchema.index({ activo: 1 });

module.exports = mongoose.model('PantallaCocina', pantallaCocinaSchema);