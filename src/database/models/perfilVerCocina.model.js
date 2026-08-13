/**
 * PERFIL VER COCINA MODEL
 * Perfiles de personalización visual "Ver Cocina" con nombre.
 * Guardan TODO el localDesign del panel "Personalizar" de CocinaMonitorLayout
 * para reutilizarlo en el flujo "Distribuir Cocina en monitores" (perfilId=<id>).
 *
 * Un perfil es global (no está atado a un cocinero): el encargado lo crea desde
 * el monitor principal y lo aplica a las ventanas hijas que quiera.
 */

const mongoose = require('mongoose');

const perfilVerCocinaSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60,
    },

    // Configuración visual completa (localDesign del panel Personalizar).
    // Se sanitiza en el controller contra PERFIL_VER_COCINA_KEYS.
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
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

perfilVerCocinaSchema.index({ nombre: 1 }, {
    unique: true,
    partialFilterExpression: { activo: true },
});
perfilVerCocinaSchema.index({ activo: 1 });

module.exports = mongoose.model('PerfilVerCocina', perfilVerCocinaSchema);
