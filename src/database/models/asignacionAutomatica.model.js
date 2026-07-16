/**
 * ASIGNACION AUTOMATICA DE PLATOS - CONFIG MODEL
 * Singleton (mismo _id fijo) con la config global + reglas por plato/categoría.
 * Patrón idéntico a configuracionSistema.model.js.
 */

const mongoose = require('mongoose');

const CONFIG_ID = 'asignacion_automatica_unica';

const backupSchema = new mongoose.Schema({
    cocineroId: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', required: true },
    orden: { type: Number, default: 0 }
}, { _id: false });

const reglasPlatoSchema = new mongoose.Schema({
    platoId: { type: Number, required: true, index: true },
    activo: { type: Boolean, default: true },
    cocineroPrimarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', default: null },
    backups: { type: [backupSchema], default: [] },
    maxMismoPlato: { type: Number, default: null }, // null = usar defaults.maxMismoPlatoPorCocinero
    estrategia: { type: String, default: null, enum: [
        null,
        'fijo_por_plato',
        'fijo_por_categoria',
        'cadena_overflow',
        'menor_carga',
        'round_robin',
        'hibrido',
        'respetar_zona'
    ]},
    notas: { type: String, default: '', trim: true }
}, { _id: false });

const reglasCategoriaSchema = new mongoose.Schema({
    categoria: { type: String, required: true, trim: true, index: true },
    activo: { type: Boolean, default: true },
    cocineroPrimarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', default: null },
    backups: { type: [backupSchema], default: [] },
    maxMismoPlato: { type: Number, default: null },
    estrategia: { type: String, default: null, enum: [
        null,
        'fijo_por_plato',
        'fijo_por_categoria',
        'cadena_overflow',
        'menor_carga',
        'round_robin',
        'hibrido',
        'respetar_zona'
    ]},
    notas: { type: String, default: '', trim: true }
}, { _id: false });

const asignacionAutomaticaSchema = new mongoose.Schema({
    _id: { type: String, default: CONFIG_ID },
    habilitada: { type: Boolean, default: false },
    defaults: {
        maxMismoPlatoPorCocinero: { type: Number, default: 5, min: 1, max: 50 },
        maxPlatosTotalesEnCurso: { type: Number, default: 10, min: 1, max: 100 },
        modoSinCandidato: {
            type: String,
            default: 'dejar_sin_asignar',
            enum: ['dejar_sin_asignar', 'pool_supervisor', 'round_robin_zona']
        },
        soloCocinerosConectados: { type: Boolean, default: true },
        respetarZonas: { type: Boolean, default: true },
        estrategiaDefault: {
            type: String,
            default: 'hibrido',
            enum: ['fijo_por_plato', 'fijo_por_categoria', 'cadena_overflow', 'menor_carga', 'round_robin', 'hibrido', 'respetar_zona']
        }
    },
    reglasPorPlato: { type: [reglasPlatoSchema], default: [] },
    reglasPorCategoria: { type: [reglasCategoriaSchema], default: [] },
    actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', default: null }
}, {
    timestamps: true,
    _id: false,
    strict: true
});

asignacionAutomaticaSchema.index({ _id: 1 }, { unique: true });

const CONFIGURACION_DEFAULT = {
    habilitada: false,
    defaults: {
        maxMismoPlatoPorCocinero: 5,
        maxPlatosTotalesEnCurso: 10,
        modoSinCandidato: 'dejar_sin_asignar',
        soloCocinerosConectados: true,
        respetarZonas: true,
        estrategiaDefault: 'hibrido'
    },
    reglasPorPlato: [],
    reglasPorCategoria: []
};

asignacionAutomaticaSchema.statics.obtenerConfiguracion = async function() {
    let config = await this.findById(CONFIG_ID);
    if (!config) {
        config = await this.create({ _id: CONFIG_ID, ...CONFIGURACION_DEFAULT });
        console.log('✅ Configuración de Asignación Automática creada con valores por defecto');
    }
    return config;
};

const AsignacionAutomatica = mongoose.model('AsignacionAutomatica', asignacionAutomaticaSchema, 'asignacion_automatica');

// Adjuntar constantes al modelo para que Jest.mock no las pierda
AsignacionAutomatica.CONFIG_ID = CONFIG_ID;
AsignacionAutomatica.CONFIGURACION_DEFAULT = CONFIGURACION_DEFAULT;

module.exports = AsignacionAutomatica;