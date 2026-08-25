/**
 * ASIGNACION AUTOMATICA DE GUARNICIONES - CONFIG MODEL (v1.1)
 * ---------------------------------------------------------------------------
 * Singleton (mismo _id fijo) con la config global + perfiles con nombre y
 * plantilla semanal de franjas horarias. Patrón idéntico a
 * asignacionAutomatica.model.js pero con reglas por `guarnicionKey` en vez de
 * platoId, y metadatos de estación / crítica de emplatado / tiempo medio.
 *
 * MODELO MENTAL:
 * - Un PERFIL agrupa reglas por guarnición (clave `grupo::opcion` normalizada)
 *   y por grupo (Proteína, Guarnición, Salsa...). Es una "configuración con
 *   nombre" reutilizable (ej: "Almuerzo", "Cena"). No se aplica por sí solo;
 *   debe estar referenciado por una franja del calendario.
 * - En runtime, el motor (asignacionAutomaticaGuarnicionesService.resolverPerfilActivo)
 *   resuelve qué perfil está activo AHORA. Si no hay bloque → no se auto-asigna.
 *
 * Diferencias vs asignacionAutomatica.model.js:
 * - `reglasPorGuarnicion` usa `guarnicionKey` (string normalizado) en vez de platoId.
 * - Cada regla lleva `estacionRecomendada`, `criticaEmplatado`, `tiempoMedioPreparacion`.
 * - `reglasPorGrupo` (en vez de reglasPorCategoria) agrupa por el `grupo` del complemento.
 * - El motor excluye SIEMPRE al cocinero del plato principal (no configurable en v1).
 */
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const CONFIG_ID = 'asignacion_automatica_guarniciones';

// Estaciones canónicas (sugeridas; el campo es String libre para custom del local).
const ESTACIONES_SUGERIDAS = ['fritura', 'plancha', 'parrilla', 'frios', 'postres', 'guarniciones', 'general'];

// ---------------------------- Sub-esquemas de reglas ----------------------------

const backupSchema = new mongoose.Schema({
    cocineroId: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', required: true },
    orden: { type: Number, default: 0 }
}, { _id: false });

const estrategiasEnum = [
    null,
    'fijo_por_guarnicion',
    'fijo_por_grupo',
    'cadena_overflow',
    'menor_carga',
    'round_robin',
    'hibrido',
    'respetar_estacion',
    'batch_mismo_cocinero'
];

/**
 * Regla por guarnición (clave `grupo::opcion` normalizada).
 * Vive DENTRO de un perfil.
 */
const reglasGuarnicionSchema = new mongoose.Schema({
    guarnicionKey: { type: String, required: true, trim: true, index: true },
    // Etiqueta legible para mostrar en admin (ej: "Proteína :: Pollo").
    etiqueta: { type: String, default: '', trim: true },
    activo: { type: Boolean, default: true },
    cocineroPrimarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', default: null },
    backups: { type: [backupSchema], default: [] },
    maxMismoGuarnicion: { type: Number, default: null },
    estrategia: { type: String, default: null, enum: estrategiasEnum },
    // Metadatos operativos (reglas de negocio adicionales §1, §2, §4):
    estacionRecomendada: { type: String, default: null, trim: true },  // 'fritura' | 'plancha' | ...
    criticaEmplatado: { type: Boolean, default: false },                // debe llegar al pase con el principal
    tiempoMedioPreparacion: { type: Number, default: null, min: 0 },   // segundos (para alertas 1.5×)
    // Categoría de tiempo para fallback a config.tiemposGuarnicion.tiemposDefault.
    categoriaTiempo: { type: String, default: null, enum: ['rapido', 'medio', 'lento', null] },
    notas: { type: String, default: '', trim: true }
}, { _id: false });

/**
 * Regla por grupo (el `grupo` del complemento: "Proteína", "Guarnición", "Salsa").
 */
const reglasGrupoSchema = new mongoose.Schema({
    grupo: { type: String, required: true, trim: true, index: true },
    activo: { type: Boolean, default: true },
    cocineroPrimarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', default: null },
    backups: { type: [backupSchema], default: [] },
    maxMismoGuarnicion: { type: Number, default: null },
    estrategia: { type: String, default: null, enum: estrategiasEnum },
    estacionRecomendada: { type: String, default: null, trim: true },
    notas: { type: String, default: '', trim: true }
}, { _id: false });

// ---------------------------- Perfil ----------------------------

const perfilSchema = new mongoose.Schema({
    id: { type: String, required: true, default: () => uuidv4() },
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, default: '', trim: true },
    color: { type: String, default: '#7CB342', trim: true }, // verde guarnición
    activo: { type: Boolean, default: true },
    reglasPorGuarnicion: { type: [reglasGuarnicionSchema], default: [] },
    reglasPorGrupo: { type: [reglasGrupoSchema], default: [] },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() }
}, { _id: false, id: false });

// ---------------------------- Bloque de calendario (igual que platos) ----------------------------

const bloqueCalendarioSchema = new mongoose.Schema({
    id: { type: String, required: true, default: () => uuidv4() },
    perfilId: { type: String, required: true },
    diasSemana: {
        type: [Number],
        required: true,
        validate: {
            validator: (arr) => Array.isArray(arr) && arr.length > 0 &&
                arr.every(d => Number.isInteger(d) && d >= 0 && d <= 6),
            message: 'diasSemana debe ser un array no vacío de enteros 0..6 (0=Dom, 6=Sáb)'
        }
    },
    horaInicio: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    horaFin: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    etiqueta: { type: String, default: '', trim: true },
    activo: { type: Boolean, default: true },
    createdAt: { type: Date, default: () => new Date() }
}, { _id: false, id: false });

// ---------------------------- Documento singleton ----------------------------

const asignacionAutomaticaGuarnicionesSchema = new mongoose.Schema({
    _id: { type: String, default: CONFIG_ID },
    habilitada: { type: Boolean, default: false },
    defaults: {
        maxMismoGuarnicionPorCocinero: { type: Number, default: 6, min: 1, max: 50 },
        maxUnidadesTotalesEnCurso: { type: Number, default: 12, min: 1, max: 100 },
        modoSinCandidato: {
            type: String,
            default: 'dejar_sin_asignar',
            enum: ['dejar_sin_asignar', 'pool_supervisor', 'round_robin_estacion']
        },
        soloCocinerosConectados: { type: Boolean, default: true },
        respetarZonas: { type: Boolean, default: true },
        // v1: priorizar estación recomendada (true). Si false, ignora estación y usa solo regla primario/backups.
        priorizarEstacion: { type: Boolean, default: true },
        // v1: agrupar batchs de misma guarnición en el mismo cocinero (true).
        agruparBatchs: { type: Boolean, default: true },
        estrategiaDefault: {
            type: String,
            default: 'respetar_estacion',
            enum: ['fijo_por_guarnicion', 'fijo_por_grupo', 'cadena_overflow', 'menor_carga', 'round_robin', 'hibrido', 'respetar_estacion', 'batch_mismo_cocinero']
        }
    },
    perfiles: { type: [perfilSchema], default: [] },
    calendario: {
        bloques: { type: [bloqueCalendarioSchema], default: [] }
    },
    actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', default: null }
}, {
    timestamps: true,
    strict: true
});

const CONFIGURACION_DEFAULT = {
    habilitada: false,
    defaults: {
        maxMismoGuarnicionPorCocinero: 6,
        maxUnidadesTotalesEnCurso: 12,
        modoSinCandidato: 'dejar_sin_asignar',
        soloCocinerosConectados: true,
        respetarZonas: true,
        priorizarEstacion: true,
        agruparBatchs: true,
        estrategiaDefault: 'respetar_estacion'
    },
    perfiles: [],
    calendario: { bloques: [] }
};

/**
 * Obtiene el singleton, creándolo con defaults si no existe.
 */
function bloque24h(perfilId) {
    return {
        id: uuidv4(),
        perfilId,
        diasSemana: [0, 1, 2, 3, 4, 5, 6],
        horaInicio: '00:00',
        horaFin: '23:59',
        etiqueta: 'Default 24h',
        activo: true,
        createdAt: new Date()
    };
}

asignacionAutomaticaGuarnicionesSchema.statics.obtenerConfiguracion = async function () {
    let config = await this.findById(CONFIG_ID);
    if (!config) {
        config = await this.create({ _id: CONFIG_ID, ...CONFIGURACION_DEFAULT });
        console.log('✅ Configuración de Asignación Automática de Guarniciones creada con valores por defecto');
        return config;
    }
    const perfiles = config.perfiles || [];
    const bloques = config.calendario?.bloques || [];
    if (perfiles.length > 0 && bloques.length === 0) {
        const perfilId = (perfiles.find(p => p.activo !== false) || perfiles[0]).id;
        if (perfilId) {
            const seeded = await this.findOneAndUpdate(
                { _id: CONFIG_ID, 'calendario.bloques.0': { $exists: false } },
                { $push: { 'calendario.bloques': bloque24h(perfilId) } },
                { new: true }
            );
            if (seeded) config = seeded;
        }
    }
    return config;
};

const AsignacionAutomaticaGuarniciones = mongoose.model(
    'AsignacionAutomaticaGuarniciones',
    asignacionAutomaticaGuarnicionesSchema,
    'asignacion_automatica_guarniciones'
);

AsignacionAutomaticaGuarniciones.CONFIG_ID = CONFIG_ID;
AsignacionAutomaticaGuarniciones.CONFIGURACION_DEFAULT = CONFIGURACION_DEFAULT;
AsignacionAutomaticaGuarniciones.ESTACIONES_SUGERIDAS = ESTACIONES_SUGERIDAS;
AsignacionAutomaticaGuarniciones.generarId = uuidv4;

module.exports = AsignacionAutomaticaGuarniciones;
