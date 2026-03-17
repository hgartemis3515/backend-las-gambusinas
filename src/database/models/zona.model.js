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
    
    // Emoji o nombre de icono
    icono: {
        type: String,
        default: '🍳',
        maxlength: 4
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
        // Tipos de plato permitidos
        tiposPermitidos: [{
            type: String,
            enum: ['platos-desayuno', 'plato-carta normal']
        }]
    },
    
    // ========== FILTROS DE COMANDAS ==========
    filtrosComandas: {
        // Áreas del restaurante que puede ver
        areasPermitidas: [{
            type: String
        }],
        // Mesas específicas
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
        icono: '🍳',
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

// Método para verificar si un plato debe mostrarse según los filtros
zonaSchema.methods.debeMostrarPlato = function(plato) {
    const filtros = this.filtrosPlatos;
    
    // Si no hay filtros configurados, mostrar todo
    if (!filtros.platosPermitidos?.length && 
        !filtros.categoriasPermitidas?.length && 
        !filtros.tiposPermitidos?.length) {
        return true;
    }
    
    const platoId = plato.platoId || plato.id;
    const categoria = plato.categoria || plato.plato?.categoria;
    const tipo = plato.tipo || plato.plato?.tipo;
    
    let coincide = false;
    
    // Verificar por ID de plato
    if (filtros.platosPermitidos?.length && filtros.platosPermitidos.includes(platoId)) {
        coincide = true;
    }
    
    // Verificar por categoría
    if (!coincide && filtros.categoriasPermitidas?.length && filtros.categoriasPermitidas.includes(categoria)) {
        coincide = true;
    }
    
    // Verificar por tipo
    if (!coincide && filtros.tiposPermitidos?.length && filtros.tiposPermitidos.includes(tipo)) {
        coincide = true;
    }
    
    return filtros.modoInclusion ? coincide : !coincide;
};

// Método para verificar si una comanda debe mostrarse según los filtros
zonaSchema.methods.debeMostrarComanda = function(comanda) {
    const filtros = this.filtrosComandas;
    
    // Verificar filtro de áreas
    if (filtros.areasPermitidas?.length > 0) {
        const areaComanda = comanda.areaNombre || comanda.mesas?.areaNombre;
        if (!filtros.areasPermitidas.includes(areaComanda)) {
            return false;
        }
    }
    
    // Verificar filtro de mesas específicas
    if (filtros.mesasEspecificas?.length > 0) {
        const mesaNumero = comanda.mesaNumero || comanda.mesas?.nummesa;
        if (!filtros.mesasEspecificas.includes(mesaNumero)) {
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
