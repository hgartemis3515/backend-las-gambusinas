/**
 * Boleta de talonario físico emitida cuando no se pudo usar el sistema.
 * No usa las series electrónicas B### / F###.
 * @module facturacion/models/contingencia
 */

const mongoose = require('mongoose');

const contingenciaSchema = new mongoose.Schema({
    ruc: { type: String, required: true, match: /^\d{11}$/ },
    serieTalonario: { type: String, required: true, match: /^\d{1,4}$/ },
    numero: { type: String, required: true, match: /^\d{1,8}$/ },
    fechaEmision: { type: Date, required: true },
    motivo: { type: String, required: true, enum: ['corte_energia', 'caida_red', 'averia_hardware'] },
    cliente: {
        tipoDoc: { type: String, default: '0' },
        numDoc: { type: String, default: '-' },
        nombre: { type: String, default: 'CLIENTES VARIOS' },
    },
    items: [{
        _id: false,
        descripcion: { type: String, required: true },
        cantidad: { type: Number, required: true, min: 0.001 },
        importe: { type: Number, required: true, min: 0 },
    }],
    total: { type: Number, required: true, min: 0 },
    estado: { type: String, enum: ['REGISTRADO', 'ENVIADO', 'INFORMADO_RESUMEN'], default: 'REGISTRADO' },
    ticketSunat: { type: String, default: null },
    registradoPor: { type: String, default: null },
}, { timestamps: true, collection: 'comprobantes_contingencia' });

contingenciaSchema.index({ ruc: 1, serieTalonario: 1, numero: 1 }, { unique: true });

module.exports = mongoose.models.Contingencia || mongoose.model('Contingencia', contingenciaSchema);
