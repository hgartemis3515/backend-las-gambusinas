/**
 * Serie de comprobantes y su último correlativo emitido.
 * El avance del correlativo solo ocurre vía `serieService.reservarCorrelativo` dentro de una transacción.
 * @module facturacion/models/serieComprobante
 */

const mongoose = require('mongoose');
const { TIPO_DOCUMENTO, REGEX_SERIE } = require('../constants/catalogosSunat');

const serieComprobanteSchema = new mongoose.Schema({
    ruc: { type: String, required: true, match: /^\d{11}$/ },
    sucursal: { type: String, required: true, default: 'principal' },
    tipo: { type: String, required: true, enum: [TIPO_DOCUMENTO.FACTURA, TIPO_DOCUMENTO.BOLETA, TIPO_DOCUMENTO.NOTA_CREDITO] },
    serie: {
        type: String,
        required: true,
        uppercase: true,
        validate: {
            validator(v) { return REGEX_SERIE[this.tipo] ? REGEX_SERIE[this.tipo].test(v) : false; },
            message: (p) => `Serie ${p.value} inválida para el tipo de comprobante`,
        },
    },
    ultimoNumero: { type: Number, required: true, default: 0, min: 0, max: 99999999 },
    activa: { type: Boolean, default: true },
    terminal: { type: String, default: null },
}, { timestamps: true, collection: 'series_comprobante' });

serieComprobanteSchema.index({ ruc: 1, tipo: 1, serie: 1 }, { unique: true });

module.exports = mongoose.models.SerieComprobante || mongoose.model('SerieComprobante', serieComprobanteSchema);
