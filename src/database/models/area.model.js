const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

const areaSchema = new mongoose.Schema({
    areaId: { type: Number, unique: true },
    nombre: { 
        type: String, 
        required: true,
        unique: true,
        trim: true
    },
    descripcion: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Actualizar updatedAt antes de guardar
areaSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

areaSchema.plugin(AutoIncrement, { inc_field: 'areaId' });
const Area = mongoose.model("areas", areaSchema);

module.exports = Area;

