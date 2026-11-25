'use strict';

const mongoose = require('mongoose');

const noticiaProgramadaSchema = new mongoose.Schema({
    programadaPara: { type: Date, required: true, index: true },
    estado: {
        type: String,
        enum: ['pendiente', 'enviando', 'enviada', 'cancelada', 'error'],
        default: 'pendiente',
        index: true,
    },
    intentos: { type: Number, default: 0 },
    enviandoDesde: { type: Date, default: null },
    enviadaAt: { type: Date, default: null },
    muestraHasta: { type: Date, default: null },
    noticiaId: { type: String, default: '' },
    error: { type: String, default: '' },
    titulo: { type: String, default: '', maxlength: 120, trim: true },
    cuerpoHtml: { type: String, default: '' },
    autor: {
        id: { type: String, default: '' },
        nombre: { type: String, default: '' },
        rol: { type: String, default: '' },
    },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    destinos: { type: [String], default: [] },
    cocinaAlcance: { type: String, default: 'todas' },
    pantallas: { type: [Number], default: [] },
    mozosAlcance: { type: String, default: 'todos' },
    mozoIds: { type: [String], default: [] },
    segundosEnPantalla: { type: Number, default: 15 },
    segundosSalirMozos: { type: Number, default: 6 },
}, { timestamps: true });

noticiaProgramadaSchema.index({ estado: 1, programadaPara: 1 });

module.exports = mongoose.model('noticias_programadas', noticiaProgramadaSchema);
