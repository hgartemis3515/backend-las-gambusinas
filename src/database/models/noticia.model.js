'use strict';

const mongoose = require('mongoose');

const noticiaSchema = new mongoose.Schema({
    fechaOperativa: { type: String, required: true, index: true },
    titulo: { type: String, default: '', maxlength: 120, trim: true },
    cuerpoHtml: { type: String, default: '' },
    imagenes: { type: [String], default: [] },
    autor: {
        id: { type: String, default: '' },
        nombre: { type: String, default: '' },
        rol: { type: String, default: '' },
    },
    vigente: { type: Boolean, default: true, index: true },
    destinos: { type: [String], default: ['cocina', 'mozos'] },
    cocinaAlcance: { type: String, default: 'todas' },
    pantallas: { type: [Number], default: [] },
    mozosAlcance: { type: String, default: 'todos' },
    mozoIds: { type: [String], default: [] },
    segundosEnPantalla: { type: Number, default: 15 },
}, { timestamps: true });

noticiaSchema.index({ fechaOperativa: 1, vigente: 1, createdAt: -1 });

module.exports = mongoose.model('noticias', noticiaSchema);
