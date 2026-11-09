/**
 * Un envío RC o RA: XML firmado, ticket y CDR. No reemplaza el CDR del comprobante.
 * @module facturacion/models/loteSunat
 */

const mongoose = require('mongoose');

const loteSunatSchema = new mongoose.Schema({
    ruc: { type: String, required: true },
    tipo: { type: String, required: true, enum: ['RC', 'RA'] },
    codigo: { type: String, required: true },
    fechaReferencia: { type: String, required: true },
    comprobantes: { type: [String], default: [] },
    xmlRuta: { type: String, default: null },
    ticket: { type: String, default: null },
    intentos: { type: Number, default: 0 },
    estado: { type: String, default: 'EN_PROCESO' },
    codigoRespuesta: { type: String, default: null },
    cdrRuta: { type: String, default: null },
}, { timestamps: true, collection: 'lotes_sunat' });

loteSunatSchema.index({ ruc: 1, codigo: 1 }, { unique: true });

module.exports = mongoose.models.LoteSunat || mongoose.model('LoteSunat', loteSunatSchema);
