/**
 * PANTALLA COCINA MODEL
 * Representa un televisor fisico (1-8) en la cocina.
 *
 * Modos de uso:
 *  - Personalizado: vistaCocinaId asignado (filtro por tipo de plato).
 *  - Kiosko (Completo por cocinero): cocineroId asignado + deviceTokenHash
 *    para autenticacion automatica del TV sin login humano repetido.
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

    // Modo Personalizado: enlace a una Vista de Cocina (filtro por tipo de plato)
    vistaCocinaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VistaCocina',
        default: null
    },

    // Modo Kiosko: cocinero fijo cuyo filtro se aplica a "Ver Cocina Completo"
    cocineroId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Mozo',
        default: null
    },

    // 'completo' (Ver Cocina Completo filtrado por cocinero) | 'personalizado' (VistaCocina)
    modoVista: {
        type: String,
        enum: ['completo', 'personalizado'],
        default: 'completo'
    },

    activo: {
        type: Boolean,
        default: true
    },

    orden: {
        type: Number,
        default: 0
    },

    // Token de dispositivo para autenticacion kiosko (bcrypt hash)
    deviceTokenHash: {
        type: String,
        default: null
    },
    deviceTokenCreatedAt: {
        type: Date,
        default: null
    },

    // Heartbeat del TV (ultima vez que la pantalla contacto al backend)
    ultimaConexion: {
        type: Date,
        default: null
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