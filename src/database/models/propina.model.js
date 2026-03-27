const mongoose = require('mongoose');
const moment = require('moment-timezone');
const AutoIncrement = require('mongoose-sequence')(mongoose);

/**
 * MODELO PROPINA
 * Sistema de propinas para mozos del restaurante Las Gambusinas
 * 
 * Una propina se registra después de que una mesa es pagada (estado "pagado")
 * Puede ser monto fijo o porcentaje sobre el total del boucher
 */

const propinaSchema = new mongoose.Schema({
    // ID auto-incremental para fácil referencia
    propinaId: {
        type: Number,
        unique: true
    },
    
    // Referencia a la mesa
    mesaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mesas',
        required: true
    },
    
    // Snapshot del número de mesa (para reportes históricos)
    numMesa: {
        type: Number,
        required: true
    },
    
    // Referencia al boucher asociado
    boucherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Boucher',
        required: true
    },
    
    // Snapshot del número de boucher
    boucherNumber: {
        type: Number,
        required: true
    },
    
    // Mozo que atendió la mesa (quién recibe la propina)
    mozoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        required: true
    },
    
    // Snapshot del nombre del mozo
    nombreMozo: {
        type: String,
        required: true
    },
    
    // Monto final de la propina (calculado)
    montoPropina: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Tipo de propina
    tipo: {
        type: String,
        enum: ['monto', 'porcentaje', 'ninguna'],
        required: true,
        default: 'monto'
    },
    
    // Si tipo = "monto", el valor fijo
    montoFijo: {
        type: Number,
        min: 0,
        default: null
    },
    
    // Si tipo = "porcentaje", el porcentaje aplicado (10, 15, 20, etc.)
    porcentaje: {
        type: Number,
        min: 0,
        max: 100,
        default: null
    },
    
    // Total del boucher sobre el que se calculó la propina
    totalBoucher: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Nota opcional del mozo
    nota: {
        type: String,
        maxlength: 200,
        default: null
    },
    
    // Fecha y hora de registro
    fechaRegistro: {
        type: Date,
        default: () => moment.tz("America/Lima").toDate()
    },
    
    // Fecha formateada para fácil consulta
    fechaRegistroString: {
        type: String
    },

    // Día calendario (America/Lima) para agregados rápidos YYYY-MM-DD
    fechaDia: {
        type: String,
        index: true
    },
    
    // Estado de la mesa al momento de registrar
    estadoMesa: {
        type: String,
        default: 'pagado'
    },
    
    // Usuario que registró la propina (para auditoría)
    registradoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos'
    },
    
    // Nombre del usuario que registró
    registradoPorNombre: {
        type: String
    },
    
    // Soft delete
    activo: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    collection: 'propinas'
});

// ========== ÍNDICES ==========

// Índice para reportes por mozo (más común)
propinaSchema.index(
    { mozoId: 1, fechaRegistro: -1 },
    { name: 'idx_propina_mozo_fecha' }
);

// Índice para historial por mesa
propinaSchema.index(
    { mesaId: 1, fechaRegistro: -1 },
    { name: 'idx_propina_mesa_fecha' }
);

// Índice para relación con boucher
propinaSchema.index(
    { boucherId: 1 },
    { name: 'idx_propina_boucher' }
);

// Índice para listado general ordenado por fecha
propinaSchema.index(
    { fechaRegistro: -1 },
    { name: 'idx_propina_fecha' }
);

// Índice para filtrar por activo
propinaSchema.index(
    { activo: 1, fechaRegistro: -1 },
    { name: 'idx_propina_activo_fecha' }
);

propinaSchema.index(
    { activo: 1, mozoId: 1, fechaRegistro: -1 },
    { name: 'idx_propina_activo_mozo_fecha' }
);

propinaSchema.index(
    { activo: 1, mesaId: 1, fechaRegistro: -1 },
    { name: 'idx_propina_activo_mesa_fecha' }
);

propinaSchema.index(
    { activo: 1, tipo: 1, fechaRegistro: -1 },
    { name: 'idx_propina_activo_tipo_fecha' }
);

propinaSchema.index(
    { fechaDia: 1, mozoId: 1, activo: 1 },
    { name: 'idx_propina_fechaDia_mozo_activo' }
);

// Una sola propina activa por boucher (evita duplicados; soft-delete libera el boucher)
propinaSchema.index(
    { boucherId: 1 },
    {
        unique: true,
        partialFilterExpression: { activo: true },
        name: 'idx_propina_unique_boucher_activo'
    }
);

// ========== HOOKS ==========

// Pre-save: formatear fecha y día calendario (coherencia monto/tipo la resuelve el backend)
propinaSchema.pre('save', function(next) {
    if (this.fechaRegistro && !this.fechaRegistroString) {
        this.fechaRegistroString = moment(this.fechaRegistro)
            .tz("America/Lima")
            .format("DD/MM/YYYY HH:mm:ss");
    }
    if (this.fechaRegistro) {
        this.fechaDia = moment(this.fechaRegistro).tz('America/Lima').format('YYYY-MM-DD');
    }
    next();
});

// ========== MÉTODOS ESTÁTICOS ==========

/**
 * Obtener propinas de un mozo en un rango de fechas
 */
propinaSchema.statics.getPropinasPorMozo = async function(mozoId, fechaInicio, fechaFin) {
    const inicio = moment.tz(fechaInicio, 'America/Lima').startOf('day').toDate();
    const fin = moment.tz(fechaFin, 'America/Lima').endOf('day').toDate();
    
    return this.find({
        mozoId: mongoose.Types.ObjectId(mozoId),
        fechaRegistro: { $gte: inicio, $lte: fin },
        activo: true
    }).sort({ fechaRegistro: -1 });
};

/**
 * Obtener resumen de propinas del día
 */
propinaSchema.statics.getResumenDia = async function(fecha = null) {
    const fechaConsulta = fecha 
        ? moment.tz(fecha, 'America/Lima')
        : moment.tz('America/Lima');
    
    const inicio = fechaConsulta.clone().startOf('day').toDate();
    const fin = fechaConsulta.clone().endOf('day').toDate();
    
    const propinas = await this.find({
        fechaRegistro: { $gte: inicio, $lte: fin },
        activo: true
    });
    
    const totalPropinas = propinas.reduce((sum, p) => sum + p.montoPropina, 0);
    const cantidadPropinas = propinas.length;
    const promedioPropina = cantidadPropinas > 0 ? totalPropinas / cantidadPropinas : 0;
    
    // Agrupar por mozo
    const porMozo = {};
    propinas.forEach(p => {
        const mozoId = p.mozoId.toString();
        if (!porMozo[mozoId]) {
            porMozo[mozoId] = {
                mozoId: p.mozoId,
                nombreMozo: p.nombreMozo,
                totalPropinas: 0,
                cantidad: 0
            };
        }
        porMozo[mozoId].totalPropinas += p.montoPropina;
        porMozo[mozoId].cantidad++;
    });
    
    return {
        fecha: fechaConsulta.format('YYYY-MM-DD'),
        totalPropinas,
        cantidadPropinas,
        promedioPropina: Math.round(promedioPropina * 100) / 100,
        porMozo: Object.values(porMozo).sort((a, b) => b.totalPropinas - a.totalPropinas)
    };
};

// Auto-increment para propinaId
propinaSchema.plugin(AutoIncrement, { inc_field: 'propinaId' });

const Propina = mongoose.model('Propina', propinaSchema);

module.exports = Propina;
