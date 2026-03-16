/**
 * CONFIG COCINERO MODEL
 * Configuración personalizada del tablero KDS para cada cocinero
 */

const mongoose = require('mongoose');
const moment = require('moment-timezone');

const configCocineroSchema = new mongoose.Schema({
    // Referencia al usuario/mozo
    usuarioId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        required: true,
        unique: true,
        index: true
    },
    
    // Alias o nombre a mostrar en cocina (opcional, si es diferente al nombre real)
    aliasCocinero: {
        type: String,
        default: null,
        trim: true,
        maxlength: 50
    },
    
    // ========== FILTROS DE PLATOS ==========
    filtrosPlatos: {
        // Modo de filtrado: true = inclusivo (solo mostrar estos), false = exclusivo (ocultar estos)
        modoInclusion: {
            type: Boolean,
            default: true // Por defecto inclusivo (muestra todo)
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
        // Mesas específicas (null = todas las de las áreas permitidas)
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
    
    // ========== CONFIGURACIÓN DEL TABLERO KDS ==========
    configTableroKDS: {
        // Tiempos de alerta (en minutos)
        tiempoAmarillo: {
            type: Number,
            default: 15,
            min: 1,
            max: 60
        },
        tiempoRojo: {
            type: Number,
            default: 20,
            min: 1,
            max: 120
        },
        // Número máximo de tarjetas visibles
        maxTarjetasVisibles: {
            type: Number,
            default: 20,
            min: 5,
            max: 100
        },
        // Modo alto volumen: vista compacta, menos animaciones
        modoAltoVolumen: {
            type: Boolean,
            default: false
        },
        // Sonido de notificación
        sonidoNotificacion: {
            type: Boolean,
            default: true
        },
        // Modo nocturno
        modoNocturno: {
            type: Boolean,
            default: true
        },
        // Columnas del grid
        columnasGrid: {
            type: Number,
            default: 5,
            min: 1,
            max: 8
        },
        // Filas del grid
        filasGrid: {
            type: Number,
            default: 1,
            min: 1,
            max: 4
        },
        // Tamaño de fuente
        tamanioFuente: {
            type: Number,
            default: 15,
            min: 12,
            max: 24
        }
    },
    
    // ========== ESTADÍSTICAS DE SESIÓN ==========
    estadisticas: {
        ultimaConexion: {
            type: Date,
            default: null
        },
        totalSesiones: {
            type: Number,
            default: 0
        },
        platosPreparados: {
            type: Number,
            default: 0
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
configCocineroSchema.index({ usuarioId: 1 });
configCocineroSchema.index({ activo: 1 });

// Virtual para obtener el nombre a mostrar
configCocineroSchema.virtual('nombreDisplay').get(function() {
    return this.aliasCocinero || this.usuarioId?.name || 'Cocinero';
});

// Método estático para obtener configuración por defecto
configCocineroSchema.statics.getConfiguracionPorDefecto = function() {
    return {
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
        configTableroKDS: {
            tiempoAmarillo: 15,
            tiempoRojo: 20,
            maxTarjetasVisibles: 20,
            modoAltoVolumen: false,
            sonidoNotificacion: true,
            modoNocturno: true,
            columnasGrid: 5,
            filasGrid: 1,
            tamanioFuente: 15
        },
        estadisticas: {
            ultimaConexion: null,
            totalSesiones: 0,
            platosPreparados: 0
        }
    };
};

// Método para verificar si un plato debe mostrarse según los filtros
configCocineroSchema.methods.debeMostrarPlato = function(plato) {
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
    
    // Si modoInclusion es true, solo mostrar los que coinciden
    // Si modoInclusion es false, mostrar los que NO coinciden
    return filtros.modoInclusion ? coincide : !coincide;
};

// Método para verificar si una comanda debe mostrarse según los filtros
configCocineroSchema.methods.debeMostrarComanda = function(comanda) {
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

const ConfigCocinero = mongoose.model('ConfigCocinero', configCocineroSchema);

module.exports = ConfigCocinero;
