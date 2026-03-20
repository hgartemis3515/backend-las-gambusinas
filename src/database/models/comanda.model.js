const mongoose = require('mongoose');
const moment = require('moment-timezone');
const AutoIncrement = require('mongoose-sequence')(mongoose);

const comandaSchema = new mongoose.Schema({
    mozos: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos' },
    mesas: { type: mongoose.Schema.Types.ObjectId, ref: 'mesas' },
    cliente: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Cliente',
        default: null // Se asigna automáticamente al confirmar pago
    },
    // ========== FASE A1: CAMPOS DESNORMALIZADOS PARA LECTURA RÁPIDA ==========
    // Estos campos se actualizan al crear/modificar la comanda para evitar populate en listados
    mozoNombre: { type: String, default: null },           // Ej: "Juan Pérez"
    mesaNumero: { type: Number, default: null },            // Ej: 15
    areaNombre: { type: String, default: null },            // Ej: "Terraza"
    clienteNombre: { type: String, default: null },         // Ej: "María García"
    // Resumen de platos para listados ligeros
    totalPlatos: { type: Number, default: 0 },              // Total de items en la comanda
    platosActivos: { type: Number, default: 0 },            // Platos no eliminados/anulados
    // ==========================================================================
    // Referencia al Pedido que agrupa esta comanda (se asigna automáticamente al crear)
    pedido: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Pedido',
        default: null,
        index: true
    },
    dividedFrom: {
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Comanda',
        default: null // Para rastrear si esta comanda fue dividida
    },
    platos: [{
        plato: { type: mongoose.Schema.Types.ObjectId, ref: 'platos' },
        platoId: { type: Number }, // ID numérico del plato para búsqueda alternativa
        estado: { 
            type: String, 
            default: 'pedido',
            enum: ['pedido', 'en_espera', 'recoger', 'entregado', 'pagado'],
            validate: {
                validator: function(v) {
                    return ['pedido', 'en_espera', 'recoger', 'entregado', 'pagado'].includes(v);
                },
                message: 'El estado del plato debe ser: pedido, en_espera, recoger, entregado o pagado'
            }
        },
        // NUEVO: Timestamps de transiciones de estado
        tiempos: {
            pedido: { type: Date, default: () => moment.tz("America/Lima").toDate() },
            en_espera: Date,
            recoger: Date,
            entregado: Date,
            pagado: Date
        },
        // Complementos seleccionados por el mozo para este plato
        complementosSeleccionados: [{
            grupo: { type: String },   // Ej: "Proteína"
            opcion: { type: String }   // Ej: "Pollo"
        }],
        // Nota especial para este plato (ej: "Sin sal, extra limón")
        notaEspecial: { type: String, default: '' },
        // 🔥 AUDITORÍA: Campos para tracking de eliminación
        eliminado: { 
            type: Boolean, 
            default: false,
            index: true
        },
        eliminadoPor: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'mozos',
            default: null
        },
        eliminadoAt: { 
            type: Date, 
            default: null
        },
        eliminadoRazon: { 
            type: String, 
            default: null
        },
        estadoAlEliminar: { type: String, default: null },
        generoDesperdicio: { type: Boolean, default: false },
        // 🔥 ANULACIÓN DESDE COCINA: Campos para tracking de anulación
        anulado: { 
            type: Boolean, 
            default: false,
            index: true
        },
        anuladoPor: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'mozos',
            default: null
        },
        anuladoAt: { 
            type: Date, 
            default: null
        },
        anuladoRazon: { 
            type: String, 
            default: null
        },
        anuladoSourceApp: {
            type: String,
            enum: ['mozos', 'cocina', 'admin', 'api'],
            default: null
        },
        estadoAlAnular: { type: String, default: null },
        tipoAnulacion: { 
            type: String, 
            enum: ['producto_roto', 'insumo_agotado', 'error_preparacion', 'cliente_cancelo', 'otro', null],
            default: null
        },
        // ========== TEMA 4: PROCESAMIENTO CON IDENTIFICACIÓN DE COCINERO ==========
        // Indica qué cocinero está actualmente preparando este plato
        procesandoPor: {
            cocineroId: { 
                type: mongoose.Schema.Types.ObjectId, 
                ref: 'mozos',
                default: null 
            },
            nombre: { type: String, default: null },      // Nombre completo
            alias: { type: String, default: null },       // Alias del cocinero
            timestamp: { type: Date, default: null }      // Cuándo tomó el plato
        },
        // Indica qué cocinero terminó de preparar este plato
        procesadoPor: {
            cocineroId: { 
                type: mongoose.Schema.Types.ObjectId, 
                ref: 'mozos',
                default: null 
            },
            nombre: { type: String, default: null },
            alias: { type: String, default: null },
            timestamp: { type: Date, default: null }
        }
    }],
    cantidades: {
        type: [Number],
        default: function () {
            return new Array(this.platos.length).fill(1);
        }
    },
    observaciones: String,
    status: {
        type: String,
        default: 'en_espera',
        enum: ['en_espera', 'recoger', 'entregado', 'pagado', 'cancelado'],
        validate: {
            validator: function(v) {
                return ['en_espera', 'recoger', 'entregado', 'pagado', 'cancelado'].includes(v);
            },
            message: 'El status de la comanda debe ser: en_espera, recoger, entregado, pagado o cancelado'
        }
    },
    IsActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: () => {
            return moment.tz("America/Lima").toDate();
        }
    },
    updatedAt: {
        type: Date,
        default: () => {
            return moment.tz("America/Lima").toDate();
        }
    },
    comandaNumber: {
        type: Number
    },
    // Timestamps de cambios de estado
    tiempoEnEspera: {
        type: Date,
        default: null
    },
    tiempoRecoger: {
        type: Date,
        default: null
    },
    tiempoEntregado: {
        type: Date,
        default: null
    },
    tiempoPagado: {
        type: Date,
        default: null
    },
    // Campos de auditoría
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        default: null
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        default: null
    },
    deviceId: {
        type: String,
        default: null
    },
    sourceApp: {
        type: String,
        enum: ['mozos', 'cocina', 'admin', 'api'],
        default: null
    },
    historialEstados: [{
        status: { type: String },
        statusAnterior: { type: String },
        timestamp: { type: Date, default: () => moment.tz("America/Lima").toDate() },
        usuario: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'mozos',
            default: null,
            required: false
        },
        accion: { type: String },
        deviceId: { type: String, default: null },
        sourceApp: { type: String, enum: ['mozos', 'cocina', 'admin', 'api'], default: null },
        motivo: { type: String, default: null }
    }],
    // Campos de auditoría para soft-delete (ESTANDARIZADO: solo IsActive)
    fechaEliminacion: {
        type: Date,
        default: null
    },
    motivoEliminacion: {
        type: String,
        default: null
    },
    eliminadaPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        default: null
    },
    historialPlatos: [{
        platoId: { type: Number },
        nombreOriginal: { type: String },
        cantidadOriginal: { type: Number },
        cantidadFinal: { type: Number },
        estado: { 
            type: String,
            enum: ['activo', 'eliminado', 'modificado', 'eliminado-completo', 'anulado'],
            default: 'activo'
        },
        timestamp: { type: Date, default: Date.now },
        usuario: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'mozos',
            default: null
        },
        motivo: { type: String, default: null },
        // Campos específicos para anulación desde cocina
        anuladoPor: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'mozos', 
            default: null 
        },
        anuladoSourceApp: { 
            type: String, 
            enum: ['mozos', 'cocina', 'admin', 'api', null], 
            default: null 
        },
        tipoAnulacion: { type: String, default: null }
    }],
    precioTotalOriginal: {
        type: Number,
        default: 0
    },
    precioTotal: {
        type: Number,
        default: 0,
        index: true
    },
    version: {
        type: Number,
        default: 1,
        index: true
    },
    // Campo para prevenir duplicación en cierres de caja
    incluidoEnCierre: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CierreCajaRestaurante',
        default: null,
        index: true
    },
    // v5.5: Campo de prioridad para ordenamiento en cocina
    prioridadOrden: {
        type: Number,
        default: 0,
        index: true
    },
    // ========== TEMA 4: PROCESAMIENTO CON IDENTIFICACIÓN DE COCINERO (NIVEL COMANDA) ==========
    // Indica qué cocinero está procesando TODA la comanda (cuando se toma completa)
    procesandoPor: {
        cocineroId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'mozos',
            default: null 
        },
        nombre: { type: String, default: null },
        alias: { type: String, default: null },
        timestamp: { type: Date, default: null }
    },
    // Indica qué cocinero completó TODA la comanda
    procesadoPor: {
        cocineroId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'mozos',
            default: null 
        },
        nombre: { type: String, default: null },
        alias: { type: String, default: null },
        timestamp: { type: Date, default: null }
    },
    // ========== DESCUENTOS: Campos para gestión de descuentos (solo admin/supervisor) ==========
    descuento: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
        validate: {
            validator: function(v) {
                return Number.isInteger(v) && v >= 0 && v <= 100;
            },
            message: 'El descuento debe ser un número entero entre 0 y 100'
        }
    },
    motivoDescuento: {
        type: String,
        default: null
    },
    descuentoAplicadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        default: null
    },
    descuentoAplicadoAt: {
        type: Date,
        default: null
    },
    totalCalculado: {
        type: Number,
        default: 0,
        index: true
    },
    totalSinDescuento: {
        type: Number,
        default: 0
    },
    montoDescuento: {
        type: Number,
        default: 0
    }
    // ========== FIN DESCUENTOS ==========
}, { setDefaultsOnInsert: true });

// ========== FASE A1: ÍNDICES COMPUESTOS OPTIMIZADOS (Patrón ESR: Equality-Sort-Range) ==========

// ÍNDICE 1: Comandas del día para cocina (CRÍTICO - endpoint más usado)
// Query: listarComandaPorFechaEntregado
// Filtros: createdAt (rango), status, IsActive
// Sort: prioridadOrden, createdAt, comandaNumber
comandaSchema.index(
    { IsActive: 1, status: 1, createdAt: -1 },
    { name: 'idx_comanda_cocina_fecha' }
);

// ÍNDICE 2: Comandas activas por mesa (para pagos y estado de mesa)
// Query: getComandasParaPagar, validaciones de mesa
comandaSchema.index(
    { mesas: 1, IsActive: 1, status: 1 },
    { name: 'idx_comanda_mesa_activa' }
);

// ÍNDICE 3: Comandas por fecha general (mozos y dashboard)
// Query: listarComandaPorFecha
comandaSchema.index(
    { createdAt: -1, IsActive: 1 },
    { name: 'idx_comanda_fecha_general' }
);

// ÍNDICE 4: Para filtrado de eliminadas y activas (limpieza y auditoría)
comandaSchema.index(
    { IsActive: 1, eliminada: 1 },
    { name: 'idx_comanda_activa_eliminada' }
);

// ÍNDICE 5: Para ordenamiento por prioridad en cocina
comandaSchema.index(
    { IsActive: 1, status: 1, prioridadOrden: -1, createdAt: -1 },
    { name: 'idx_comanda_prioridad_cocina' }
);

// ========== FIN ÍNDICES FASE A1 ==========

comandaSchema.plugin(AutoIncrement, { inc_field: 'comandaNumber' });

comandaSchema.pre('save', async function (next) {
    // Validar que platos y cantidades tengan la misma longitud
    if (this.isNew || this.isModified('platos')) {
        if (this.platos && this.platos.length > 0) {
            if (!this.cantidades || this.cantidades.length === 0) {
                this.cantidades = new Array(this.platos.length).fill(1);
            } else if (this.platos.length !== this.cantidades.length) {
                // Rechazar si no coinciden (no corregir automáticamente)
                const error = new Error(`Desincronización: ${this.platos.length} platos pero ${this.cantidades.length} cantidades. Deben coincidir.`);
                error.name = 'ValidationError';
                return next(error);
            }
            this.cantidades = this.cantidades.map(cantidad => cantidad == null ? 1 : cantidad);
        }
    }
    
    // Calcular precioTotal automáticamente si hay platos
    if ((this.isNew || this.isModified('platos') || this.isModified('cantidades')) && this.platos && this.platos.length > 0) {
        try {
            const platoModel = mongoose.model('platos');
            let precioTotal = 0;
            
            // Si los platos están populados, usar directamente
            for (let i = 0; i < this.platos.length; i++) {
                const platoItem = this.platos[i];
                const cantidad = this.cantidades[i] || 1;
                
                let precio = 0;
                if (platoItem.plato && typeof platoItem.plato === 'object' && platoItem.plato.precio) {
                    // Plato ya populado
                    precio = platoItem.plato.precio;
                } else if (platoItem.plato) {
                    // Buscar plato en BD
                    const plato = await platoModel.findById(platoItem.plato);
                    if (plato && plato.precio) {
                        precio = plato.precio;
                    }
                }
                
                precioTotal += precio * cantidad;
            }
            
            this.precioTotal = precioTotal;
            
            // Si es nueva comanda, también establecer precioTotalOriginal
            if (this.isNew && !this.precioTotalOriginal) {
                this.precioTotalOriginal = precioTotal;
            }
            
            // 🔥 IMPORTANTE: Recalcular totalCalculado si hay descuento aplicado
            // Esto asegura que al agregar nuevos platos, el descuento persista sobre el nuevo total
            if (this.descuento > 0) {
                // Calcular precioTotalSinEliminar (solo platos activos)
                let precioTotalSinEliminar = 0;
                for (let i = 0; i < this.platos.length; i++) {
                    const platoItem = this.platos[i];
                    if (!platoItem.eliminado && !platoItem.anulado) {
                        const cantidad = this.cantidades[i] || 1;
                        let precio = 0;
                        if (platoItem.plato && typeof platoItem.plato === 'object' && platoItem.plato.precio) {
                            precio = platoItem.plato.precio;
                        } else if (platoItem.plato) {
                            const plato = await platoModel.findById(platoItem.plato);
                            if (plato && plato.precio) {
                                precio = plato.precio;
                            }
                        }
                        precioTotalSinEliminar += precio * cantidad;
                    }
                }
                
                const igvPorcentaje = 0.18;
                const subtotalSinDescuento = precioTotalSinEliminar;
                const montoDescuento = subtotalSinDescuento * (this.descuento / 100);
                const subtotalConDescuento = subtotalSinDescuento - montoDescuento;
                const igvConDescuento = subtotalConDescuento * igvPorcentaje;
                
                this.totalSinDescuento = subtotalSinDescuento * (1 + igvPorcentaje);
                this.montoDescuento = montoDescuento;
                this.totalCalculado = subtotalConDescuento + igvConDescuento;
                
                console.log(`💰 [pre-save] Recalculando totales con descuento ${this.descuento}%:`, {
                    subtotalSinDescuento,
                    montoDescuento,
                    totalCalculado: this.totalCalculado
                });
            }
        } catch (error) {
            // Si hay error al calcular, continuar sin precioTotal
            console.warn('⚠️ Error al calcular precioTotal:', error.message);
        }
    }
    
    // Actualizar updatedAt en cada modificación
    if (!this.isNew) {
        this.updatedAt = moment.tz("America/Lima").toDate();
    }
    
    next();
});

const comandaModel = mongoose.model('Comanda', comandaSchema);

module.exports = comandaModel;
