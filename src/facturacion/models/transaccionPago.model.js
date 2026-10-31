/**
 * Transacción de pago agnóstica a la pasarela (Niubiz, Izipay, Culqi, efectivo, billeteras).
 * Nunca almacena PAN completo ni CVV.
 * @module facturacion/models/transaccionPago
 */

const mongoose = require('mongoose');
const { MEDIO_PAGO_SUNAT } = require('../constants/catalogosSunat');

const { Schema } = mongoose;

const transaccionPagoSchema = new Schema({
    proveedor: {
        type: String,
        required: true,
        enum: ['niubiz', 'izipay', 'culqi', 'efectivo', 'yape', 'plin', 'transferencia'],
    },
    modo: { type: String, required: true, enum: ['pos_integrado', 'online', 'manual'] },
    medio: { type: String, required: true, enum: Object.keys(MEDIO_PAGO_SUNAT) },
    referenciaInterna: { type: String, required: true },
    idTransaccionExterna: { type: String, default: null },
    codigoAutorizacion: { type: String, default: null },
    marcaTarjeta: { type: String, default: null },
    ultimos4: { type: String, default: null, match: /^\d{4}$/ },
    terminalId: { type: String, default: null },
    lote: { type: String, default: null },
    monto: { type: Number, required: true, min: 0 },
    propina: { type: Number, default: 0, min: 0 },
    moneda: { type: String, enum: ['PEN', 'USD'], default: 'PEN' },
    estado: {
        type: String,
        enum: ['pendiente', 'aprobada', 'rechazada', 'anulada', 'liquidada'],
        default: 'pendiente',
        index: true,
    },
    motivoRechazo: { type: String, default: null },
    boucher: { type: Schema.Types.ObjectId, ref: 'Boucher', default: null, index: true },
    comprobante: { type: Schema.Types.ObjectId, ref: 'Comprobante', default: null, index: true },
    pedido: { type: Schema.Types.ObjectId, ref: 'Pedido', default: null },
    mesa: { type: Schema.Types.ObjectId, ref: 'mesas', default: null },
    cajero: { type: String, default: null },
    /** Payload del proveedor ya redactado (sin datos sensibles de tarjeta). */
    payloadRedactado: { type: Schema.Types.Mixed, default: null },
    recibidoEn: { type: Date, default: Date.now },
    conciliadoEn: { type: Date, default: null },
}, { timestamps: true, collection: 'transacciones_pago' });

transaccionPagoSchema.index(
    { proveedor: 1, idTransaccionExterna: 1 },
    { unique: true, partialFilterExpression: { idTransaccionExterna: { $type: 'string' } } }
);
transaccionPagoSchema.index({ cajero: 1, recibidoEn: -1 }, { name: 'idx_pago_cajero_recibido' });

module.exports = mongoose.models.TransaccionPago || mongoose.model('TransaccionPago', transaccionPagoSchema);
