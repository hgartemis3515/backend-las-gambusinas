const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

const clienteSchema = new mongoose.Schema({
    clienteId: { 
        type: Number, 
        unique: true 
    },
    dni: { 
        type: String,
        // Sin default: invitados no deben guardar dni:null (rompe índice unique aunque sea sparse)
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
clienteSchema.index({ tipo: 1 });
clienteSchema.index({ numeroInvitado: 1 }, { sparse: true });
clienteSchema.index({ dni: 1 }, { unique: true, sparse: true });

// Plugin de auto-incremento para clienteId
clienteSchema.plugin(AutoIncrement, { inc_field: 'clienteId' });

const clienteModel = mongoose.model('Cliente', clienteSchema, 'clientes');

/** Índice dni sparse + quitar dni:null legacy en invitados */
async function ensureClienteIndexes() {
    try {
        if (mongoose.connection.readyState !== 1) return;

        const collection = mongoose.connection.collection('clientes');
        const indexes = await collection.indexes();
        const dniIndex = indexes.find((idx) => idx?.key?.dni === 1);

        if (dniIndex && !dniIndex.sparse) {
            await collection.dropIndex(dniIndex.name);
            console.log(`🧹 Índice clientes.dni legacy eliminado: ${dniIndex.name}`);
        }

        await clienteModel.syncIndexes();

        const unsetResult = await collection.updateMany(
            { $or: [{ dni: null }, { dni: '' }] },
            { $unset: { dni: '' } }
        );
        if (unsetResult.modifiedCount > 0) {
            console.log(`🧹 clientes: dni vacío/null eliminado en ${unsetResult.modifiedCount} documento(s)`);
        }
    } catch (error) {
        console.error('Error al sincronizar índices de clientes:', error.message);
    }
}

if (mongoose.connection.readyState === 1) {
    ensureClienteIndexes();
} else {
    mongoose.connection.once('open', ensureClienteIndexes);
}

module.exports = clienteModel;

