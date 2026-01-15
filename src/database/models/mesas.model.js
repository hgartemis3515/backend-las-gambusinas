const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

const mesasSchema = new mongoose.Schema({
    mesasId: { type: Number, unique: true },
    nummesa: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, required: true},
    estado: {
        type: String,
        enum: ['libre', 'esperando', 'pedido', 'preparado', 'pagado', 'reservado'],
        default: 'libre',
        required: true
    },
    area: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'areas',
        required: true
    }
});

// Índice compuesto para garantizar unicidad de nummesa por área
mesasSchema.index({ nummesa: 1, area: 1 }, { unique: true });

mesasSchema.plugin(AutoIncrement, { inc_field: 'mesasId' });
const mesas = mongoose.model("mesas", mesasSchema);

module.exports = mesas;
