const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

const platoSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    nombre: { type: String, required: true },
    precio: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0 },
    categoria: { type: String, required: true },
    tipo: { 
        type: String, 
        required: true,
        enum: ['platos-desayuno', 'plato-carta normal'],
        default: 'plato-carta normal'
    },
});

platoSchema.plugin(AutoIncrement, { inc_field: 'id' });

const plato = mongoose.model("platos", platoSchema);

module.exports = plato;
