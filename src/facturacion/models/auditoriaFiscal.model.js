/**
 * Hechos fiscales que no se reescriben: saltos de correlativo.
 * @module facturacion/models/auditoriaFiscal
 */

const mongoose = require('mongoose');

const auditoriaFiscalSchema = new mongoose.Schema({
    tipo: { type: String, required: true, enum: ['gap', 'rechazo'] },
    ruc: { type: String, default: '' },
    tipoComprobante: { type: String, default: '' },
    serie: { type: String, default: '' },
    faltantes: { type: [Number], default: [] },
    rangos: { type: [mongoose.Schema.Types.Mixed], default: [] },
    detalle: { type: String, default: '' },
}, { timestamps: true, collection: 'auditoria_fiscal' });

module.exports = mongoose.models.AuditoriaFiscal || mongoose.model('AuditoriaFiscal', auditoriaFiscalSchema);
