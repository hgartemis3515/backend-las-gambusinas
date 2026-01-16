const mongoose = require('mongoose');
const moment = require('moment-timezone');
const AutoIncrement = require('mongoose-sequence')(mongoose);

const boucherSchema = new mongoose.Schema({
    boucherNumber: {
        type: Number
    },
    mesa: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mesas',
        required: true
    },
    numMesa: {
        type: Number,
        required: true
    },
    mozo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        required: true
    },
    nombreMozo: {
        type: String,
        required: true
    },
    comandas: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comanda'
    }],
    comandasNumbers: [{
        type: Number
    }],
    platos: [{
        plato: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'platos'
        },
        platoId: Number,
        nombre: {
            type: String,
            required: true
        },
        precio: {
            type: Number,
            required: true
        },
        cantidad: {
            type: Number,
            required: true,
            default: 1
        },
        subtotal: {
            type: Number,
            required: true
        },
        comandaNumber: Number // Número de comanda a la que pertenece
    }],
    subtotal: {
        type: Number,
        required: true,
        default: 0
    },
    igv: {
        type: Number,
        required: true,
        default: 0
    },
    total: {
        type: Number,
        required: true,
        default: 0
    },
    observaciones: String,
    fechaPago: {
        type: Date,
        default: () => {
            return moment.tz("America/Lima").toDate();
        }
    },
    fechaPagoString: {
        type: String
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { 
    timestamps: true,
    setDefaultsOnInsert: true 
});

boucherSchema.plugin(AutoIncrement, { inc_field: 'boucherNumber' });

// Pre-save hook para calcular totales y formatear fecha
boucherSchema.pre('save', function (next) {
    // Calcular subtotal si no está definido
    if (!this.subtotal && this.platos && this.platos.length > 0) {
        this.subtotal = this.platos.reduce((sum, plato) => {
            return sum + (plato.subtotal || (plato.precio * plato.cantidad));
        }, 0);
    }
    
    // Calcular IGV (18%)
    if (!this.igv && this.subtotal) {
        this.igv = this.subtotal * 0.18;
    }
    
    // Calcular total
    if (!this.total && this.subtotal) {
        this.total = this.subtotal + (this.igv || this.subtotal * 0.18);
    }
    
    // Formatear fecha de pago
    if (this.fechaPago && !this.fechaPagoString) {
        this.fechaPagoString = moment(this.fechaPago).tz("America/Lima").format("DD/MM/YYYY HH:mm:ss");
    }
    
    next();
});

const boucherModel = mongoose.model('Boucher', boucherSchema);

module.exports = boucherModel;

