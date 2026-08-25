const mongoose = require('mongoose');
const moment = require('moment-timezone');

/**
 * Modelo de Reserva para el sistema de reservas de Las Gambusinas
 * 
 * Estados:
 * - pendiente: Creada, esperando la fecha/hora programada
 * - activa: El mozo autorizado inicio la atencion
 * - rechazada: Expiro el tiempo de espera sin ser atendida
 * - completada: La reserva fue atendida y finalizada
 */
const reservaSchema = new mongoose.Schema({
    // Referencia a la mesa reservada
    mesa: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mesas',
        required: true,
        index: true
    },
    
    // Mozo asignado (opcional - solo ese mozo podra atender la mesa)
    mozo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        default: null
    },
    
    // Datos del cliente (no requiere cliente registrado)
    // PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1: nombre obligatorio cuando la reserva
    // se crea desde App Mozos. El alta desde dashboard sigue permitiendo null
    // por compatibilidad con reservas legacy/sin cliente.
    clienteNombre: {
        type: String,
        default: null,
        trim: true
    },
    clienteTelefono: {
        type: String,
        default: null,
        trim: true
    },
    
    // Numero de personas
    numPersonas: {
        type: Number,
        required: true,
        min: 1
    },
    
    // Fecha y hora programada de la reserva (hora de ATENCIÓN al cliente)
    fechaReserva: {
        type: Date,
        required: true,
        index: true
    },

    // PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1: fecha en que la cocina debe empezar a
    // preparar la comanda. Se calcula como fechaReserva - minutosAntesCocina
    // (default 20 min). El mozo NO la edita; la persistimos para que el job
    // (timeoutService) la use sin recalcular (la config puede cambiar).
    fechaCocina: {
        type: Date,
        default: null,
        index: true
    },
    
    // Tiempo de espera en minutos despues de la hora programada
    tiempoEspera: {
        type: Number,
        enum: [5, 10, 20],
        default: 10
    },
    
    // Platos pre-seleccionados (opcional)
    // MEJORA: soporte de complementosSeleccionados (v3.0) alineado al modelo de comanda/App Mozos.
    platos: [{
        plato: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'platos'
        },
        cantidad: {
            type: Number,
            default: 1,
            min: 1
        },
        tipoServicio: {
            type: String,
            enum: ['mesa', 'para_llevar'],
            default: 'mesa'
        },
        complementosSeleccionados: [{
            grupo: { type: String, default: '' },
            opcion: { type: String, default: '' },
            cantidad: { type: Number, default: 1, min: 1 },
            precio: { type: Number, default: 0 },   // snapshot; backend revalida
            pronombre: { type: String, default: '', trim: true }
        }],
        notaEspecial: {
            type: String,
            default: ''
        }
    }],
    
    // Metodo de pago preferido (opcional)
    metodoPago: {
        type: String,
        enum: ['efectivo', 'tarjeta', 'yape', 'plin', 'transferencia', null],
        default: null
    },
    
    // Notas adicionales
    notas: {
        type: String,
        default: null,
        trim: true
    },
    
    // Estado de la reserva
        estado: {
        type: String,
        enum: ['pendiente_aprobar', 'pendiente', 'activa', 'rechazada', 'completada', 'cancelada'],
        default: 'pendiente',
        index: true
    },
    
    // Timestamps
    creadoEn: {
        type: Date,
        default: () => moment.tz("America/Lima").toDate()
    },
    actualizadoEn: {
        type: Date,
        default: () => moment.tz("America/Lima").toDate()
    },
    
    // Referencia a la comanda generada (cuando se activa)
    comandaGenerada: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comanda',
        default: null
    },
    
    // Quien creo la reserva (admin)
    creadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        default: null
    },

    // ========== PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1 ==========
    // Cocinero encargado de la comanda reservada (vista KDS Reservadas "Mías").
    // Opcional: si no se asigna, la comanda sigue la asignación automática.
    cocineroEncargado: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        default: null
    },

    // Bloque de pago adelantado (PPA) opcional ligado a la reserva.
    // Si activo=true se crea un TicketPagoAdelantado con origen='reserva' que
    // cocina aprueba en la bandeja PPA existente. La aprobación NO activa
    // la cocina (solo valida el cobro); la cocina se activa por el job a fechaCocina.
    pagoAdelantado: {
        activo: { type: Boolean, default: false },
        ticketId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TicketPagoAdelantado',
            default: null
        },
        estadoTicket: {
            type: String,
            enum: [null, 'pendiente_aprobacion', 'aprobado', 'rechazado'],
            default: null
        },
        totalPlatos: { type: Number, default: 0 },
        montoPagado: { type: Number, default: 0 },
        montoPendiente: { type: Number, default: 0 }
    }
    // ========== FIN PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1 ==========
});

// ========== INDICES OPTIMIZADOS ==========

// Indice para buscar reservas pendientes por fecha de expiracion
reservaSchema.index(
    { estado: 1, fechaReserva: 1 },
    { name: 'idx_reserva_estado_fecha' }
);

// Indice para validar reservas activas por mesa
reservaSchema.index(
    { mesa: 1, estado: 1 },
    { name: 'idx_reserva_mesa_estado' }
);

// Indice para filtrar por rango de fechas
reservaSchema.index(
    { fechaReserva: 1 },
    { name: 'idx_reserva_fecha' }
);

// Indice para buscar por mozo asignado
reservaSchema.index(
    { mozo: 1, estado: 1 },
    { name: 'idx_reserva_mozo_estado' }
);

// PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1: indice para el job de activacion por fechaCocina
reservaSchema.index(
    { estado: 1, fechaCocina: 1 },
    { name: 'idx_reserva_estado_fechaCocina' }
);

// PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1: indice para vista KDS Reservadas por encargado
reservaSchema.index(
    { cocineroEncargado: 1, estado: 1 },
    { name: 'idx_reserva_encargado_estado' }
);

// ========== METODOS DEL SCHEMA ==========

/**
 * Calcular la fecha de expiracion de la reserva
 * @returns {Date} Fecha de expiracion (fechaReserva + tiempoEspera)
 */
reservaSchema.methods.calcularFechaExpiracion = function() {
    return moment(this.fechaReserva)
        .add(this.tiempoEspera, 'minutes')
        .toDate();
};

/**
 * Verificar si la reserva ha expirado
 * @returns {boolean}
 */
reservaSchema.methods.haExpirado = function() {
    if (this.estado !== 'pendiente') return false;
    const fechaExpiracion = this.calcularFechaExpiracion();
    return new Date() > fechaExpiracion;
};

/**
 * Verificar si la reserva esta proxima a expirar (5 minutos o menos)
 * @returns {boolean}
 */
reservaSchema.methods.proximaAExpirar = function() {
    if (this.estado !== 'pendiente') return false;
    const fechaExpiracion = this.calcularFechaExpiracion();
    const cincoMinutosAntes = moment(fechaExpiracion).subtract(5, 'minutes').toDate();
    return new Date() >= cincoMinutosAntes && new Date() < fechaExpiracion;
};

/**
 * Obtener tiempo restante en milisegundos
 * @returns {number} Milisegundos restantes o 0 si ya expiro
 */
reservaSchema.methods.tiempoRestante = function() {
    if (this.estado !== 'pendiente') return 0;
    const fechaExpiracion = this.calcularFechaExpiracion();
    const restante = fechaExpiracion.getTime() - Date.now();
    return Math.max(0, restante);
};

// ========== PRE-SAVE HOOK ==========
reservaSchema.pre('save', function(next) {
    // Actualizar fecha de modificacion
    if (!this.isNew) {
        this.actualizadoEn = moment.tz("America/Lima").toDate();
    }
    next();
});

// ========== METODOS ESTATICOS ==========

/**
 * Obtener estados validos
 */
reservaSchema.statics.getEstados = function() {
    return ['pendiente_aprobar', 'pendiente', 'activa', 'rechazada', 'completada', 'cancelada'];
};

/**
 * Obtener tiempos de espera validos
 */
reservaSchema.statics.getTiemposEspera = function() {
    return [5, 10, 20];
};

/**
 * Obtener metodos de pago validos
 */
reservaSchema.statics.getMetodosPago = function() {
    return ['efectivo', 'tarjeta', 'yape', 'plin', 'transferencia'];
};

const Reserva = mongoose.model('Reserva', reservaSchema);

module.exports = Reserva;
