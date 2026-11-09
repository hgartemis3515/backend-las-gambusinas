/**
 * Correlativo diario de resúmenes (RC) y bajas (RA).
 * @module facturacion/models/correlativoEnvio
 */

const mongoose = require('mongoose');

const correlativoEnvioSchema = new mongoose.Schema({
    ruc: { type: String, required: true, match: /^\d{11}$/ },
    tipo: { type: String, required: true, enum: ['RC', 'RA'] },
    fecha: { type: String, required: true, match: /^\d{8}$/ },
    ultimo: { type: Number, required: true, default: 0, min: 0 },
}, { collection: 'correlativos_envio' });

correlativoEnvioSchema.index({ ruc: 1, tipo: 1, fecha: 1 }, { unique: true });

module.exports = mongoose.models.CorrelativoEnvio || mongoose.model('CorrelativoEnvio', correlativoEnvioSchema);
