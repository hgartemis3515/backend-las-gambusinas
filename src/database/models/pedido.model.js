const mongoose = require('mongoose');
const moment = require('moment-timezone');
const AutoIncrement = require('mongoose-sequence')(mongoose);
const calculosPrecios = require('../../utils/calculosPrecios');

/**
 * Modelo Pedido - Agrupa comandas de una misma mesa/cliente durante una visita
 * 
 * CONCEPTO:
 * - Un Pedido representa el "ticket" completo de un cliente en una visita
 * - Puede contener múltiples comandas (agregadas en diferentes momentos)
 * - Los descuentos se aplican a nivel de Pedido, no a comandas individuales
 * - Al pagarse, genera un Boucher que consolida todo
 */
const pedidoSchema = new mongoose.Schema({
    // ID numérico visible para el usuario (auto-incrementado)
    pedidoId: {
        type: Number
    },
    
    // Mesa asociada (referencia principal)
    mesa: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mesas',
        required: true,
        index: true
    },
    
    // Número de mesa desnormalizado para lectura rápida
    numMesa: {
        type: Number,
        required: true
    },
    
    // Área de la mesa desnormalizada
    areaNombre: {
        type: String,
        default: null
    },
    
    // Mozo principal asignado al pedido
    mozo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        required: true
    },
    
    // Nombre del mozo desnormalizado
    nombreMozo: {
        type: String,
        required: true
    },
    
    // Cliente (opcional - si se identifica)
    cliente: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cliente',
        default: null
    },
    
    // Nombre del cliente desnormalizado
    clienteNombre: {
        type: String,
        default: null
    },
    
    // Comandas que pertenecen a este pedido
    comandas: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comanda'
    }],
    
    // Números de comanda para referencia rápida
    comandasNumbers: [{
        type: Number
    }],
    
    // Estado del pedido
    estado: {
        type: String,
        enum: ['abierto', 'cerrado', 'pagado', 'cancelado'],
        default: 'abierto',
        index: true
    },
    
    // ========== TOTALES (calculados dinámicamente) ==========
    
    // Subtotal sin IGV ni descuento (suma de precioTotal de comandas)
    subtotal: {
        type: Number,
        default: 0
    },
    
    // IGV calculado
    igv: {
        type: Number,
        default: 0
    },
    
    // Total sin descuento
    totalSinDescuento: {
        type: Number,
        default: 0
    },
    
    // ========== DESCUENTOS A NIVEL DE PEDIDO ==========
    
    // Porcentaje de descuento (0-100)
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
    
    // Motivo del descuento
    motivoDescuento: {
        type: String,
        default: null
    },
    
    // Usuario que aplicó el descuento
    descuentoAplicadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        default: null
    },
    
    // Fecha en que se aplicó el descuento
    descuentoAplicadoAt: {
        type: Date,
        default: null
    },
    
    // Monto del descuento calculado
    montoDescuento: {
        type: Number,
        default: 0
    },
    
    // Total con descuento aplicado (subtotal - descuento + IGV)
    totalConDescuento: {
        type: Number,
        default: 0
    },
    
    // Total final del pedido (para mostrar en UI)
    totalFinal: {
        type: Number,
        default: 0
    },
    
    // ========== TIMESTAMPS Y AUDITORÍA ==========
    
    // Fecha de apertura del pedido
    fechaApertura: {
        type: Date,
        default: () => moment.tz("America/Lima").toDate()
    },
    
    // Fecha de cierre (cuando se solicita el pago)
    fechaCierre: {
        type: Date,
        default: null
    },
    
    // Fecha de pago
    fechaPago: {
        type: Date,
        default: null
    },
    
    // Boucher generado al pagar
    boucher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Boucher',
        default: null
    },
    
    // Observaciones generales
    observaciones: {
        type: String,
        default: ''
    },
    
    // Activo/Inactivo para soft-delete
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    
    // Número de comandas en el grupo (desnormalizado)
    cantidadComandas: {
        type: Number,
        default: 0
    },
    
    // Total de platos en el pedido
    totalPlatos: {
        type: Number,
        default: 0
    }
    
}, { 
    timestamps: true,
    setDefaultsOnInsert: true 
});

// ========== ÍNDICES ==========

// Índice para buscar pedidos abiertos por mesa
pedidoSchema.index(
    { mesa: 1, estado: 1, isActive: 1 },
    { name: 'idx_pedido_mesa_abierto' }
);

// Índice para listar pedidos por fecha
pedidoSchema.index(
    { createdAt: -1, isActive: 1 },
    { name: 'idx_pedido_fecha' }
);

// Índice para buscar por estado
pedidoSchema.index(
    { estado: 1, isActive: 1 },
    { name: 'idx_pedido_estado' }
);

// ========== AUTO-INCREMENT ==========

pedidoSchema.plugin(AutoIncrement, { inc_field: 'pedidoId' });

// ========== PRE-SAVE HOOK ==========

pedidoSchema.pre('save', async function(next) {
    try {
        // Si hay cambios en las comandas, recalcular totales
        if (this.isModified('comandas') || this.isNew) {
            await this.calcularTotales();
        }
        
        // Si se está aplicando un descuento, recalcular
        if (this.isModified('descuento')) {
            this.aplicarCalculoDescuento();
        }
        
        next();
    } catch (error) {
        console.error('Error en pre-save de Pedido:', error);
        next(error);
    }
});

// ========== MÉTODOS DE INSTANCIA ==========

/**
 * Calcula los totales del pedido sumando todas las comandas
 */
pedidoSchema.methods.calcularTotales = async function() {
    const comandaModel = mongoose.model('Comanda');
    
    if (!this.comandas || this.comandas.length === 0) {
        this.subtotal = 0;
        this.igv = 0;
        this.totalSinDescuento = 0;
        this.totalFinal = 0;
        this.cantidadComandas = 0;
        this.totalPlatos = 0;
        return;
    }
    
    // Obtener todas las comandas del pedido
    const comandas = await comandaModel.find({
        _id: { $in: this.comandas },
        IsActive: true
    }).lean();
    
    // Sumar totales
    let subtotal = 0;
    let totalPlatos = 0;
    
    for (const comanda of comandas) {
        // Sumar el precioTotal de cada comanda
        subtotal += comanda.precioTotal || 0;
        totalPlatos += (comanda.platos || []).filter(p => !p.eliminado && !p.anulado).length;
    }
    
    // Obtener configuración de IGV
    const configMoneda = await calculosPrecios.getConfigMonedaCached();
    const igvPorcentaje = configMoneda.igvPorcentaje || 18;
    
    // Calcular IGV y total
    const igv = subtotal * (igvPorcentaje / 100);
    const totalSinDescuento = subtotal + igv;
    
    this.subtotal = subtotal;
    this.igv = igv;
    this.totalSinDescuento = totalSinDescuento;
    this.cantidadComandas = comandas.length;
    this.totalPlatos = totalPlatos;
    
    // Aplicar descuento si existe
    this.aplicarCalculoDescuento();
};

/**
 * Aplica el cálculo de descuento al total
 */
pedidoSchema.methods.aplicarCalculoDescuento = function() {
    if (this.descuento > 0 && this.totalSinDescuento > 0) {
        // Calcular monto de descuento sobre el subtotal
        const montoDescuento = this.subtotal * (this.descuento / 100);
        
        // Subtotal con descuento
        const subtotalConDescuento = this.subtotal - montoDescuento;
        
        // IGV sobre el monto con descuento
        const igvConDescuento = subtotalConDescuento * 0.18;
        
        this.montoDescuento = montoDescuento;
        this.totalConDescuento = subtotalConDescuento + igvConDescuento;
        this.totalFinal = this.totalConDescuento;
    } else {
        this.montoDescuento = 0;
        this.totalConDescuento = this.totalSinDescuento;
        this.totalFinal = this.totalSinDescuento;
    }
};

// ========== MÉTODOS ESTÁTICOS ==========

/**
 * Busca o crea un pedido abierto para una mesa
 * @param {ObjectId} mesaId - ID de la mesa
 * @param {ObjectId} mozoId - ID del mozo que crea la comanda
 * @param {Object} datosMesa - Datos desnormalizados de la mesa
 * @returns {Promise<Pedido>} - Pedido existente o nuevo
 */
pedidoSchema.statics.obtenerOcrearPedidoAbierto = async function(mesaId, mozoId, datosMesa = {}) {
    const Pedido = this;
    
    // Buscar pedido abierto para esta mesa
    let pedido = await Pedido.findOne({
        mesa: mesaId,
        estado: 'abierto',
        isActive: true
    });
    
    if (pedido) {
        console.log(`✅ Pedido abierto encontrado: #${pedido.pedidoId} para mesa ${datosMesa.numMesa || mesaId}`);
        return pedido;
    }
    
    // Crear nuevo pedido
    pedido = await Pedido.create({
        mesa: mesaId,
        numMesa: datosMesa.numMesa,
        areaNombre: datosMesa.areaNombre,
        mozo: mozoId,
        nombreMozo: datosMesa.nombreMozo,
        estado: 'abierto'
    });
    
    console.log(`✅ Nuevo pedido creado: #${pedido.pedidoId} para mesa ${datosMesa.numMesa || mesaId}`);
    
    return pedido;
};

/**
 * Obtiene pedidos con resumen para el dashboard
 */
pedidoSchema.statics.obtenerPedidosConResumen = async function(filtros = {}) {
    const Pedido = this;
    
    const query = { isActive: true, ...filtros };
    
    const pedidos = await Pedido.find(query)
        .populate('mesa', 'nummesa estado area')
        .populate('mozo', 'name')
        .populate('cliente', 'nombre dni')
        .sort({ createdAt: -1 })
        .lean();
    
    return pedidos;
};

// ========== EXPORT ==========

const pedidoModel = mongoose.model('Pedido', pedidoSchema);

module.exports = pedidoModel;
