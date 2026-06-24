const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

// TIPOS_MENU legacy: se mantiene por compatibilidad; los tipos reales ahora
// viven en la colección tipos_plato (ver tipoPlato.model.js / seedTiposPlato.js).
// Se sigue exportando para no romper imports existentes (plato.repository, etc.).
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
        trim: true,
        default: 'plato-carta normal'
        // Sin enum: los tipos ahora se validan dinámicamente contra tipos_plato
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Complementos/variantes disponibles para este plato
    // NUEVA ESTRUCTURA v2.0: Soporte para cantidades por opción
    complementos: [{
        grupo: { type: String, required: true },           // Ej: "Proteína", "Guarnición", "Término"
        obligatorio: { type: Boolean, default: false },    // Si el mozo DEBE elegir al menos una opción
        seleccionMultiple: { type: Boolean, default: false }, // LEGACY: Si puede elegir varias opciones (equivale a maxUnidadesGrupo > 1)
        // ===== NUEVOS CAMPOS PARA CANTIDADES =====
        // Modo de selección: 'opciones' (solo marcar) o 'cantidades' (especificar cantidad)
        modoSeleccion: { 
            type: String, 
            enum: ['opciones', 'cantidades'], 
            default: 'opciones' 
        },
        // Máximo de unidades que se pueden elegir en total dentro del grupo
        // Ej: Si es 2, el usuario puede elegir: Pollo x2, o Pollo x1 + Res x1
        maxUnidadesGrupo: { type: Number, default: null },  // null = sin límite (o usar seleccionMultiple legacy)
        // Mínimo de unidades que se deben elegir (para grupos obligatorios con cantidad exacta)
        // Ej: Si es 2 y obligatorio=true, DEBE elegir exactamente 2 unidades en total
        minUnidadesGrupo: { type: Number, default: null },  // null = 0 (opcional) o 1 si obligatorio
        // Máximo de unidades que puede tener una sola opción
        // Ej: Si es 2, el usuario puede elegir Pollo x2 como máximo, pero no Pollo x3
        maxUnidadesPorOpcion: { type: Number, default: null }, // null = sin límite
        // Si se permite repetir la misma opción múltiples veces
        permiteRepetirOpcion: { type: Boolean, default: true },
        // ===== FIN NUEVOS CAMPOS =====
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

// Cache en memoria de slugs válidos (tipos_plato activos).
let _slugsValidosCache = null;
let _slugsValidosTs = 0;
const SLUGS_CACHE_TTL_MS = 60_000;

async function _getSlugsValidos() {
    const ahora = Date.now();
    if (_slugsValidosCache && (ahora - _slugsValidosTs) < SLUGS_CACHE_TTL_MS) {
        return _slugsValidosCache;
    }
    try {
        const TipoPlato = require('./tipoPlato.model');
        const docs = await TipoPlato.getSlugsActivos();
        const set = new Set();
        docs.forEach(d => {
            if (d.slug) set.add(d.slug);
            (d.alias || []).forEach(a => set.add(a));
        });
        // siempre incluir los legacy por seguridad
        TIPOS_MENU.forEach(t => set.add(t));
        _slugsValidosCache = set;
        _slugsValidosTs = ahora;
        return set;
    } catch (_) {
        // Si tipos_plato no existe aún (pre-migración), usar legacy
        return new Set(TIPOS_MENU);
    }
}

platoSchema.pre('save', async function (next) {
    try {
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
        if (this.tipo != null) {
            this.tipo = String(this.tipo).trim().toLowerCase();
            const validos = await _getSlugsValidos();
            if (!validos.has(this.tipo)) {
                return next(new Error(`tipo "${this.tipo}" no es válido. Crea el tipo en Tipos de Plato antes de asignarlo.`));
            }
        }
        next();
    } catch (err) {
        next(err);
    }
});

platoSchema.plugin(AutoIncrement, { inc_field: 'id' });

const plato = mongoose.model("platos", platoSchema);

module.exports = plato;
module.exports.TIPOS_MENU = TIPOS_MENU;