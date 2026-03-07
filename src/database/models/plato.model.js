const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

const TIPOS_MENU = ['platos-desayuno', 'plato-carta normal'];

const platoSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    nombre: { type: String, required: true },
    nombreLower: { type: String, required: false, unique: true },
    precio: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0 },
    categoria: {
        type: String,
        required: true,
        trim: true
    },
    tipo: {
        type: String,
        required: true,
        enum: TIPOS_MENU,
        default: 'plato-carta normal'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Complementos/variantes disponibles para este plato
    complementos: [{
        grupo: { type: String, required: true },           // Ej: "Proteína", "Guarnición", "Término"
        obligatorio: { type: Boolean, default: false },    // Si el mozo DEBE elegir una opción
        seleccionMultiple: { type: Boolean, default: false }, // Si puede elegir varias opciones
        opciones: [{ type: String }]                       // Ej: ["Pollo", "Carne", "Mixto"]
    }]
});

// ========== FASE A1: ÍNDICES OPTIMIZADOS ==========
// Índices existentes para queries por tipo y categoría
platoSchema.index({ categoria: 1 });
platoSchema.index({ tipo: 1, categoria: 1 });

// ÍNDICE 1: Platos activos por tipo y categoría (menú - endpoint frecuente)
// Query: platos para menú filtrados por isActive y tipo
platoSchema.index(
    { isActive: 1, tipo: 1, categoria: 1 },
    { name: 'idx_plato_menu' }
);

// ÍNDICE 2: Búsqueda por nombre para autocompletado (activos primero)
platoSchema.index(
    { isActive: 1, nombreLower: 1 },
    { name: 'idx_plato_nombre_search' }
);
// ========== FIN ÍNDICES FASE A1 ==========

platoSchema.pre('save', function (next) {
    if (this.nombre != null) {
        this.nombre = String(this.nombre).trim();
        this.nombreLower = this.nombre.toLowerCase();
        if (!this.nombre) {
            return next(new Error('nombre no puede estar vacío'));
        }
    }
    if (this.categoria != null) {
        this.categoria = String(this.categoria).trim();
        if (!this.categoria) {
            return next(new Error('categoria no puede estar vacía'));
        }
    }
    if (this.tipo != null && !TIPOS_MENU.includes(this.tipo)) {
        return next(new Error('tipo debe ser "platos-desayuno" o "plato-carta normal"'));
    }
    next();
});

platoSchema.plugin(AutoIncrement, { inc_field: 'id' });

const plato = mongoose.model("platos", platoSchema);

module.exports = plato;
module.exports.TIPOS_MENU = TIPOS_MENU;