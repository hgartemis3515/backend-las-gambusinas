const mongoose = require('mongoose');
const moment = require('moment-timezone');
const AutoIncrement = require('mongoose-sequence')(mongoose);
const calculosPrecios = require('../../utils/calculosPrecios');

const boucherSchema = new mongoose.Schema({
    boucherNumber: {
        type: Number
    },
    voucherId: {
        type: String,
        required: true,
        unique: true,
        minlength: 5,
        maxlength: 5,
        uppercase: true
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
    cliente: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cliente',
        default: null // Opcional: puede ser registrado o invitado
    },
    usadoEnComanda: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comanda',
        default: null // Comanda en la que se usó el boucher
    },
    fechaUso: {
        type: Date,
        default: null // Fecha exacta en que se usó el boucher
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
 comandaNumber: Number, // Número de comanda a la que pertenece
 complementosSeleccionados: [{
 grupo: { type: String },
 opcion: { type: String }
 }],
 // 🔥 TRAZABILIDAD: Información del cocinero que preparó el plato
 cocinero: { type: String, default: null },      // Nombre/alias del cocinero
 cocineroId: { 
 type: mongoose.Schema.Types.ObjectId,
 ref: 'mozos',
 default: null
 },
 tiempoPreparacion: { type: String, default: null } // Formato MM:SS
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
    // 🔥 CAMPOS DE DESCUENTO
    descuentos: [{
        comandaNumber: { type: Number },
        porcentaje: { type: Number, default: 0 },
        motivo: { type: String },
        monto: { type: Number, default: 0 },
        aplicadoPor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'mozos'
        }
    }],
    totalSinDescuento: {
        type: Number,
        default: null
    },
    montoDescuento: {
        type: Number,
        default: null
    },
    totalConDescuento: {
        type: Number,
        default: null
    },
    // Snapshot de configuración de IGV para auditoría
    configuracionIGV: {
        igvPorcentaje: { type: Number, default: 18 },
        preciosIncluyenIGV: { type: Boolean, default: false },
        nombreImpuesto: { type: String, default: 'IGV' },
        moneda: { type: String, default: 'PEN' },
        simboloMoneda: { type: String, default: 'S/.' }
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
boucherSchema.pre('save', async function (next) {
    try {
        // Calcular subtotal si no está definido
        if (!this.subtotal && this.platos && this.platos.length > 0) {
            this.subtotal = this.platos.reduce((sum, plato) => {
                return sum + (plato.subtotal || (plato.precio * plato.cantidad));
            }, 0);
        }
        
        // Obtener configuración de IGV desde la utilidad centralizada
        const configMoneda = await calculosPrecios.getConfigMonedaCached();
        
        // Guardar snapshot de configuración para auditoría
        this.configuracionIGV = {
            igvPorcentaje: configMoneda.igvPorcentaje,
            preciosIncluyenIGV: configMoneda.preciosIncluyenIGV,
            nombreImpuesto: configMoneda.nombreImpuestoPrincipal || 'IGV',
            moneda: configMoneda.moneda,
            simboloMoneda: configMoneda.simboloMoneda
        };
        
        // Calcular IGV y totales usando la configuración
        const totales = calculosPrecios.calcularTotales(this.subtotal || 0, configMoneda);
        
        // FIX: Usar == null para no sobreescribir 0 válido (descuento 100%)
        if (this.igv == null) {
            this.igv = totales.igv;
        }

        if (this.total == null) {
            this.total = totales.total;
        }
        
        // Formatear fecha de pago
        if (this.fechaPago && !this.fechaPagoString) {
            this.fechaPagoString = moment(this.fechaPago).tz("America/Lima").format("DD/MM/YYYY HH:mm:ss");
        }
        
        next();
    } catch (error) {
        // Fallback si falla la obtención de configuración
        console.error('Error en pre-save boucher:', error.message);
        
        // Usar valores por defecto (== null para no sobreescribir 0 válido)
        if (this.igv == null && this.subtotal) {
            this.igv = this.subtotal * 0.18;
        }
        if (this.total == null && this.subtotal) {
            this.total = this.subtotal + (this.igv || this.subtotal * 0.18);
        }
        if (this.fechaPago && !this.fechaPagoString) {
            this.fechaPagoString = moment(this.fechaPago).tz("America/Lima").format("DD/MM/YYYY HH:mm:ss");
        }
        
        next();
    }
});

// Especificar el nombre de la colección explícitamente como 'boucher'
const boucherModel = mongoose.model('Boucher', boucherSchema, 'boucher');

module.exports = boucherModel;

