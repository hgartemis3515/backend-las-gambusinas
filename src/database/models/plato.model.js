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
        required: false,
        trim: true,
        default: 'plato-carta normal'
        // LEGACY: valor único. Se conserva por compatibilidad. El campo
        // canónico ahora es `tipos` (array) que permite que un plato
        // pertenezca a 1 o más tipos de menú simultáneamente.
    },
    // Nuevo: lista de tipos de menú a los que pertenece el plato (1 o más).
    // Cada elemento debe ser un slug válido de tipos_plato.
    tipos: {
        type: [String],
        default: undefined,
        validate: {
            validator: function (arr) {
                // Se permite vacío temporalmente durante la migración; se
                // normaliza en pre('save') copiando `tipo` si corresponde.
                return Array.isArray(arr);
            },
            message: 'tipos debe ser un array de slugs'
        }
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
// Índice para el nuevo campo `tipos` (búsquedas $in por menú)
platoSchema.index({ tipos: 1, categoria: 1 });

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
        let slugsValidos = null;
        if (this.tipo != null || (Array.isArray(this.tipos) && this.tipos.length)) {
            slugsValidos = await _getSlugsValidos();

            // Normalizar y validar `tipo` (legacy) si vino seteado
            if (this.tipo != null) {
                this.tipo = String(this.tipo).trim().toLowerCase();
                if (this.tipo && !slugsValidos.has(this.tipo)) {
                    return next(new Error(`tipo "${this.tipo}" no es válido. Crea el tipo en Tipos de Plato antes de asignarlo.`));
                }
            }

            // Normalizar array `tipos`: lower, trim, único, filtrar vacíos
            if (Array.isArray(this.tipos)) {
                const seen = new Set();
                const limpios = [];
                for (const t of this.tipos) {
                    if (t == null) continue;
                    const slug = String(t).trim().toLowerCase();
                    if (!slug) continue;
                    if (!slugsValidos.has(slug)) {
                        return next(new Error(`tipo "${slug}" no es válido. Crea el tipo en Tipos de Plato antes de asignarlo.`));
                    }
                    if (!seen.has(slug)) { seen.add(slug); limpios.push(slug); }
                }
                this.tipos = limpios;
            }

            // Sincronizar `tipo` legacy con el primer elemento de `tipos`
            if (Array.isArray(this.tipos) && this.tipos.length) {
                this.tipo = this.tipos[0];
            } else if (this.tipo) {
                // Si solo vino `tipo` (legacy), reflejarlo en `tipos`
                this.tipos = [this.tipo];
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