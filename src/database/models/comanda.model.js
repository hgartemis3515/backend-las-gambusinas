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
            default: 'en_espera',
            enum: ['en_espera', 'recoger', 'entregado'],
            validate: {
                validator: function(v) {
                    return ['en_espera', 'recoger', 'entregado'].includes(v);
                },
                message: 'El estado del plato debe ser: en_espera, recoger o entregado'
            }
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
        enum: ['en_espera', 'recoger', 'entregado'],
        validate: {
            validator: function(v) {
                return ['en_espera', 'recoger', 'entregado'].includes(v);
            },
            message: 'El status de la comanda debe ser: en_espera, recoger o entregado'
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
    comandaNumber: {
        type: Number
    },
    historialEstados: [{
        status: { type: String },
        timestamp: { type: Date, default: Date.now },
        usuario: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'mozos',
            default: null,
            required: false
        },
        accion: { type: String }
    }]
}, { setDefaultsOnInsert: true });

comandaSchema.plugin(AutoIncrement, { inc_field: 'comandaNumber' });

comandaSchema.pre('save', function (next) {
    if (this.isNew || this.isModified('platos')) {
        if (!this.cantidades || this.cantidades.length === 0) {
            this.cantidades = new Array(this.platos.length).fill(1);
        } else {
            const diff = this.platos.length - this.cantidades.length;
            if (diff > 0) {
                this.cantidades = this.cantidades.concat(new Array(diff).fill(1));
            }
            this.cantidades = this.cantidades.map(cantidad => cantidad == null ? 1 : cantidad);
        }
    }
    next();
});

const comandaModel = mongoose.model('Comanda', comandaSchema);

module.exports = comandaModel;
