/**
 * PERFIL VER COCINA MODEL
 * Perfiles con nombre compartidos entre dispositivos.
 * tipo: ver_cocina (Personalizar Ver Cocina) | tablas_kds (Vista tablas KDS).
 */

const mongoose = require('mongoose');

const perfilVerCocinaSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60,
    },

    // Configuración visual completa (snapshot del panel Personalizar).
    // Se sanitiza en el controller (claves camelCase visuales; se fusiona al actualizar).
    config: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
    },

    // Usuario que creó/elaboró el perfil (auditoría). El perfil es compartido.
    creadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        default: null,
    },

    actualizadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        default: null,
    },

    activo: {
        type: Boolean,
        default: true,
    },

    // ver_cocina = Personalizar Ver Cocina Completo
    // tablas_kds = Vista y alertas de las tablas KDS
    tipo: {
        type: String,
        enum: ['ver_cocina', 'tablas_kds'],
        default: 'ver_cocina',
        index: true,
    },
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

perfilVerCocinaSchema.index({ tipo: 1, nombre: 1 }, {
    unique: true,
    partialFilterExpression: { activo: true },
});
perfilVerCocinaSchema.index({ tipo: 1, activo: 1 });

module.exports = mongoose.model('PerfilVerCocina', perfilVerCocinaSchema);
