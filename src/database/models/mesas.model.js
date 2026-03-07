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

// ========== FASE A1: ÍNDICES OPTIMIZADOS ==========
// Índice compuesto único existente para nummesa por área
mesasSchema.index({ nummesa: 1, area: 1 }, { unique: true });

// ÍNDICE 1: Búsqueda por estado y área (mapa de mesas - endpoint frecuente)
// Query: mesas por estado (libre, pedido, preparado, etc.)
mesasSchema.index(
    { isActive: 1, estado: 1, area: 1 },
    { name: 'idx_mesa_estado_area' }
);

// ÍNDICE 2: Mesas activas ordenadas por número (listado rápido)
mesasSchema.index(
    { isActive: 1, nummesa: 1 },
    { name: 'idx_mesa_activa_num' }
);
// ========== FIN ÍNDICES FASE A1 ==========

mesasSchema.plugin(AutoIncrement, { inc_field: 'mesasId' });
const mesas = mongoose.model("mesas", mesasSchema);

module.exports = mesas;
