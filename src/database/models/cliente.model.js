const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

const clienteSchema = new mongoose.Schema({
    clienteId: { 
        type: Number, 
        unique: true 
    },
    dni: { 
        type: String, 
        sparse: true, // Permite múltiples nulls pero valores únicos
        default: null
    },
    nombre: { 
        type: String,
        default: null
    },
    telefono: { 
        type: String,
        default: null
    },
    email: { 
        type: String,
        default: null
    },
    tipo: { 
        type: String, 
        enum: ['registrado', 'invitado'], 
        default: 'registrado' 
    },
    numeroInvitado: { 
        type: Number,
        default: null // Solo para clientes tipo 'invitado'
    },
    totalConsumido: { 
        type: Number, 
        default: 0 
    },
    visitas: { 
        type: Number, 
        default: 0 
    },
    comandas: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comanda'
    }],
    bouchers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Boucher'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { 
    timestamps: true,
    setDefaultsOnInsert: true 
});

// Validación condicional: nombre requerido solo si tipo es 'registrado'
clienteSchema.pre('validate', function(next) {
    if (this.tipo === 'registrado' && !this.nombre) {
        return next(new Error('El nombre es requerido para clientes registrados'));
    }
    if (this.tipo === 'invitado') {
        // Para invitados, el nombre se genera automáticamente
        if (!this.numeroInvitado) {
            return next(new Error('numeroInvitado es requerido para clientes invitados'));
        }
        this.nombre = `Invitado-${this.numeroInvitado}`;
    }
    next();
});

// Pre-save hook para generar nombre automático para invitados
clienteSchema.pre('save', function(next) {
    if (this.tipo === 'invitado' && this.numeroInvitado) {
        this.nombre = `Invitado-${this.numeroInvitado}`;
    }
    next();
});

// Índices
clienteSchema.index({ dni: 1 }, { sparse: true, unique: true });
clienteSchema.index({ tipo: 1 });
clienteSchema.index({ numeroInvitado: 1 }, { sparse: true });

// Plugin de auto-incremento para clienteId
clienteSchema.plugin(AutoIncrement, { inc_field: 'clienteId' });

const clienteModel = mongoose.model('Cliente', clienteSchema, 'clientes');

module.exports = clienteModel;

