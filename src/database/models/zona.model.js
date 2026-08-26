/**
 * ZONA MODEL
 * Presets de filtros de cocina para personalizar tableros KDS
 */

const mongoose = require('mongoose');

const zonaSchema = new mongoose.Schema({
    // Nombre de la zona (ej: "Plancha", "Parrilla", "Postres fríos")
    nombre: {
        type: String,
        required: true,
        trim: true,
        maxlength: 50
    },
    
    // Descripción corta del propósito de la zona
    descripcion: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ''
    },
    
    // Color hexadecimal para identificación visual
    color: {
        type: String,
        default: '#d4af37',
        match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
    },
    
    // Emoji o nombre de icono (Tabler Icons)
    icono: {
        type: String,
        default: 'tools-kitchen',
        maxlength: 50
    },
    
    // ========== FILTROS DE PLATOS ==========
    filtrosPlatos: {
        // Modo de filtrado: true = inclusivo (solo mostrar estos), false = exclusivo (ocultar estos)
        modoInclusion: {
            type: Boolean,
            default: true
        },
        // IDs de platos específicos permitidos/bloqueados
        platosPermitidos: [{
            type: Number // platoId
        }],
        // Categorías permitidas/bloqueadas
        categoriasPermitidas: [{
            type: String
        }],
        // Tipos de plato permitidos (slugs de tipos_plato)
        tiposPermitidos: [{
            type: String
        }]
    },
    
    // ========== FILTROS DE COMANDAS ==========
    filtrosComandas: {
        // Áreas del restaurante que puede ver (areaId)
        areasPermitidas: [{
            type: Number
        }],
        // Mesas específicas (mesasId)
        mesasEspecificas: [{
            type: Number
        }],
        // Filtro por rango horario
        rangoHorario: {
            inicio: {
                type: String, // Formato HH:mm
                default: null
            },
            fin: {
                type: String, // Formato HH:mm
                default: null
            }
        },
        // Solo mostrar comandas prioritarias/urgentes
        soloPrioritarias: {
            type: Boolean,
            default: false
        }
    },
    
    // Estado activo/inactivo
    activo: {
        type: Boolean,
        default: true
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

// Índices
zonaSchema.index({ nombre: 1 });
zonaSchema.index({ activo: 1 });

// Método estático para obtener zona por defecto
zonaSchema.statics.getZonaPorDefecto = function() {
    return {
        nombre: '',
        descripcion: '',
        color: '#d4af37',
        icono: 'tools-kitchen',
        filtrosPlatos: {
            modoInclusion: true,
            platosPermitidos: [],
            categoriasPermitidas: [],
            tiposPermitidos: []
        },
        filtrosComandas: {
            areasPermitidas: [],
            mesasEspecificas: [],
            rangoHorario: { inicio: null, fin: null },
            soloPrioritarias: false
        },
        activo: true
    };
};

function idCatalogoParaFiltro(plato) {
    if (!plato || typeof plato !== 'object') return null;
    const nested = plato.plato && typeof plato.plato === 'object' ? plato.plato : null;
    const candidates = [plato.platoId, plato.id, nested && nested.id, nested && nested.platoId];
    for (const c of candidates) {
        if (c == null || c === '') continue;
        if (typeof c === 'object') continue;
        const s = String(c);
        if (/^[a-fA-F0-9]{24}$/.test(s)) continue;
        const n = Number(c);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
}

function tiposDePlatoParaFiltro(plato) {
    const nested = plato && plato.plato && typeof plato.plato === 'object' ? plato.plato : null;
    const out = [];
    const push = (v) => {
        if (Array.isArray(v)) v.forEach(push);
        else if (v != null && String(v).trim()) out.push(String(v).trim());
    };
    if (plato) {
        push(plato.tipos);
        push(plato.tipo);
    }
    if (nested) {
        push(nested.tipos);
        push(nested.tipo);
    }
    return out;
}

// Método para verificar si un plato debe mostrarse según los filtros
zonaSchema.methods.debeMostrarPlato = function(plato) {
    const filtros = this.filtrosPlatos;
    
    // Si no hay filtros configurados, mostrar todo
    if (!filtros.platosPermitidos?.length && 
        !filtros.categoriasPermitidas?.length && 
        !filtros.tiposPermitidos?.length) {
        return true;
    }
    
    const platoId = idCatalogoParaFiltro(plato);
    const categoria = plato.categoria || plato.plato?.categoria;
    const tipos = tiposDePlatoParaFiltro(plato);
    
    let coincide = false;
    
    // Verificar por ID de plato (numérico de catálogo; evita mismatch Number vs String)
    if (filtros.platosPermitidos?.length && platoId != null) {
        coincide = filtros.platosPermitidos.some(id => Number(id) === platoId);
    }
    
    // Verificar por categoría
    if (!coincide && filtros.categoriasPermitidas?.length && categoria) {
        coincide = filtros.categoriasPermitidas.includes(categoria);
    }
    
    // Verificar por tipo (legacy `tipo` y canónico `tipos[]`)
    if (!coincide && filtros.tiposPermitidos?.length && tipos.length) {
        coincide = tipos.some(t => filtros.tiposPermitidos.includes(t));
    }
    
    return filtros.modoInclusion ? coincide : !coincide;
};

// Método para verificar si una comanda debe mostrarse según los filtros
zonaSchema.methods.debeMostrarComanda = function(comanda) {
    const filtros = this.filtrosComandas;
    
    // Verificar filtro de áreas (por areaId)
    if (filtros.areasPermitidas?.length > 0) {
        const areaIdComanda = comanda.areaId || comanda.mesas?.areaId || comanda.mesas?.area;
        if (!filtros.areasPermitidas.includes(areaIdComanda)) {
            return false;
        }
    }
    
    // Verificar filtro de mesas específicas (por mesasId)
    if (filtros.mesasEspecificas?.length > 0) {
        const mesaIdComanda = comanda.mesasId || comanda.mesas?.mesasId;
        if (!filtros.mesasEspecificas.includes(mesaIdComanda)) {
            return false;
        }
    }
    
    // Verificar filtro de prioridad
    if (filtros.soloPrioritarias && !comanda.prioridadOrden) {
        return false;
    }
    
    return true;
};

const Zona = mongoose.model('Zona', zonaSchema);

module.exports = Zona;
