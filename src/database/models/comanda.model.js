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
        generoDesperdicio: { type: Boolean, default: false }
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
            enum: ['activo', 'eliminado', 'modificado', 'eliminado-completo'],
            default: 'activo'
        },
        timestamp: { type: Date, default: Date.now },
        usuario: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'mozos',
            default: null
        },
        motivo: { type: String, default: null }
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
    }
}, { setDefaultsOnInsert: true });

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
