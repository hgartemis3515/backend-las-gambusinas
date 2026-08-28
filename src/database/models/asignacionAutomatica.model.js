/**
 * ASIGNACION AUTOMATICA DE PLATOS - CONFIG MODEL (v2: Perfiles + Calendario semanal)
 * ---------------------------------------------------------------------------
 * Singleton (mismo _id fijo) con la config global + (NUEVO) perfiles con nombre
 * y plantilla semanal de franjas horarias.
 *
 * MODELO MENTAL (resumen):
 * - Un PERFIL agrupa un mapa plato→cocinero (primario + backups) y reglas por
 *   categoría. Es una "configuración con nombre" reutilizable (ej: "Almuerzo",
 *   "Cena", "Fin de semana"). No se aplica por sí solo; debe estarreferenciado
 *   por una franja del calendario para estar activo en un momento dado.
 * - Un BLOQUE de calendario dice: "en estos días de la semana (diasSemana),
 *   entre horaInicio y horaFin (America/Lima), aplica este perfilId".
 *   La plantilla es semanal: el calendario SIEMPRE se proyecta sobre la semana
 *   actual; no guarda fechas absolutas.
 * - En runtime, el motor (ver asignacionAutomaticaService.resolverPerfilActivo)
 *   resuelve, para el día+hora actual de Lima, qué bloque (y por ende qué
 *   perfil) está activo. Si no hay bloque activo → no se auto-asigna
 *   (v1, motivo "sin_franja_activa"). Si hay varios solapados, gana el más
 *   específico (menos días en diasSemana), luego el de horaInicio más tarde,
 *   luego el más reciente por orden de creación (ver service).
 * - MIGRACIÓN: si existe config legacy con reglasPorPlato/reglasPorCategoria
 *   planas en la raíz y sin perfiles, se crea automáticamente un perfil
 *   "Principal" con esas reglas + un bloque 00:00–23:59 todos los días, para
 *   no romper la operación 24/7 existente. Los campos raíz se dejan como
 *   legacy/deprecated (se leen pero la fuente de verdad son los perfiles).
 *
 * Patrón idéntico a configuracionSistema.model.js (singleton con _id fijo).
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { migrarCuposFactoryV3 } = require('../../utils/asignacionAutomaticaCupos');

const CONFIG_ID = 'asignacion_automatica_unica';

// ---------------------------- Sub-esquemas de reglas (compartidos) ----------------------------

const backupSchema = new mongoose.Schema({
    cocineroId: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', required: true },
    orden: { type: Number, default: 0 }
}, { _id: false });

const estrategiasEnum = [
    null,
    'fijo_por_plato',
    'fijo_por_categoria',
    'cadena_overflow',
    'menor_carga',
    'round_robin',
    'hibrido',
    'respetar_zona'
];

/**
 * Regla por plato: define primario + backups para un platoId concreto.
 * Vive DENTRO de un perfil (no en la raíz del documento).
 */
const reglasPlatoSchema = new mongoose.Schema({
    platoId: { type: Number, required: true, index: true },
    activo: { type: Boolean, default: true },
    cocineroPrimarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', default: null },
    backups: { type: [backupSchema], default: [] },
    maxMismoPlato: { type: Number, default: null }, // null = usar defaults.maxMismoPlatoPorCocinero
    estrategia: { type: String, default: null, enum: estrategiasEnum },
    notas: { type: String, default: '', trim: true }
}, { _id: false });

/**
 * Regla por categoría: igual que por plato pero key por nombre de categoría.
 */
const reglasCategoriaSchema = new mongoose.Schema({
    categoria: { type: String, required: true, trim: true, index: true },
    activo: { type: Boolean, default: true },
    cocineroPrimarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', default: null },
    backups: { type: [backupSchema], default: [] },
    maxMismoPlato: { type: Number, default: null },
    estrategia: { type: String, default: null, enum: estrategiasEnum },
    notas: { type: String, default: '', trim: true }
}, { _id: false });

// ---------------------------- Perfil ----------------------------

/**
 * Perfil de asignación: conjunto nombrado de reglas por plato/categoría.
 * - id: string estable (uuid) para referenciar desde calendario.bloques[].perfilId.
 * - nombre: único case-insensitive dentro del documento.
 * - activo: soft-disable (si false, ni el calendario ni el runtime lo usan).
 */
const perfilSchema = new mongoose.Schema({
    id: { type: String, required: true, default: () => uuidv4() },
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, default: '', trim: true },
    color: { type: String, default: '#D4AF37', trim: true }, // hex para chip en calendario
    activo: { type: Boolean, default: true },
    reglasPorPlato: { type: [reglasPlatoSchema], default: [] },
    reglasPorCategoria: { type: [reglasCategoriaSchema], default: [] },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() }
}, { _id: false, id: false });

// ---------------------------- Bloque de calendario ----------------------------

/**
 * Bloque de calendario (plantilla semanal).
 * - diasSemana: convención moment.js `day()` = 0=Dom, 1=Lun, ..., 6=Sáb.
 *   Ej: [1] = solo lunes; [1,2,3,4,5] = Lun–Vie; [0..6] = toda la semana.
 * - horaInicio/horaFin: "HH:mm" America/Lima. Si horaFin < horaInicio, cruza medianoche
 *   (turno noche). diasSemana = días en que EMPIEZA el turno. Fin exclusivo.
 * - perfilId: referencia a perfiles[].id (validada al guardar bloque).
 * - activo: soft-disable del bloque.
 */
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

const asignacionAutomaticaSchema = new mongoose.Schema({
    _id: { type: String, default: CONFIG_ID },
    habilitada: { type: Boolean, default: false },
    defaults: {
        maxMismoPlatoPorCocinero: { type: Number, default: 20, min: 1, max: 50 },
        maxPlatosTotalesEnCurso: { type: Number, default: 40, min: 1, max: 100 },
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
    // NUEVO v2: perfiles con nombre y calendario semanal.
    perfiles: { type: [perfilSchema], default: [] },
    calendario: {
        bloques: { type: [bloqueCalendarioSchema], default: [] }
    },
    // LEGACY v1: reglas planas en la raíz. Se conservan por compatibilidad/rollback
    // pero la fuente de verdad en runtime son los perfiles (ver service).
    // La migración mueve estos campos a un perfil "Principal" y los vacía.
    reglasPorPlato: { type: [reglasPlatoSchema], default: [] },
    reglasPorCategoria: { type: [reglasCategoriaSchema], default: [] },
    actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', default: null },
    cuposDefaultV3: { type: Boolean, default: false }
}, {
    timestamps: true,
    _id: false,
    strict: true
});

// Singleton con `_id` string: Mongo indexa `_id` por defecto; no redefinir.

const CONFIGURACION_DEFAULT = {
    habilitada: false,
    defaults: {
        maxMismoPlatoPorCocinero: 20,
        maxPlatosTotalesEnCurso: 40,
        modoSinCandidato: 'dejar_sin_asignar',
        soloCocinerosConectados: true,
        respetarZonas: true,
        estrategiaDefault: 'hibrido'
    },
    perfiles: [],
    calendario: { bloques: [] },
    reglasPorPlato: [],
    reglasPorCategoria: [],
    cuposDefaultV3: true
};

/**
 * MIGRACIÓN v1 → v2:
 * Si el documento existe pero NO tiene perfiles (esquema legacy), crea un
 * perfil "Principal" con las reglasPorPlato/reglasPorCategoria raíz y un bloque
 * 00:00–23:59 todos los días, para mantener operación 24/7 tras el deploy.
 * Mutación in-place sobre `doc` (subdocumentos mongoose). No persiste aquí;
 * el caller decide si guardar.
 */
function migrarAV2(doc) {
    if (!doc) return doc;
    const tienePerfiles = Array.isArray(doc.perfiles) && doc.perfiles.length > 0;
    const tieneBloques = Array.isArray(doc.calendario?.bloques) && doc.calendario.bloques.length > 0;
    if (tienePerfiles) {
        // Ya migrado: asegurarnos de que cada perfil tenga id estable.
        doc.perfiles.forEach(p => { if (!p.id) p.id = uuidv4(); });
        // Y que cada bloque tenga id.
        if (doc.calendario && Array.isArray(doc.calendario.bloques)) {
            doc.calendario.bloques.forEach(b => { if (!b.id) b.id = uuidv4(); });
        }
        return doc;
    }

    const reglasPlato = Array.isArray(doc.reglasPorPlato) ? doc.reglasPorPlato : [];
    const reglasCat = Array.isArray(doc.reglasPorCategoria) ? doc.reglasPorCategoria : [];

    // Perfil Principal con las reglas legacy.
    const perfilId = uuidv4();
    if (!Array.isArray(doc.perfiles)) doc.perfiles = [];
    doc.perfiles.push({
        id: perfilId,
        nombre: 'Principal',
        descripcion: 'Perfil creado automáticamente desde reglas previas (migración v2).',
        color: '#D4AF37',
        activo: true,
        reglasPorPlato: reglasPlato.map(r => ({ ...r })),
        reglasPorCategoria: reglasCat.map(r => ({ ...r })),
        createdAt: new Date(),
        updatedAt: new Date()
    });

    // Bloque 00:00–23:59 todos los días para no romper operación.
    if (!doc.calendario || typeof doc.calendario !== 'object') doc.calendario = { bloques: [] };
    if (!Array.isArray(doc.calendario.bloques)) doc.calendario.bloques = [];
    if (!tieneBloques) {
        doc.calendario.bloques.push({
            id: uuidv4(),
            perfilId,
            diasSemana: [0, 1, 2, 3, 4, 5, 6],
            horaInicio: '00:00',
            horaFin: '23:59',
            etiqueta: 'Default 24h (migración)',
            activo: true,
            createdAt: new Date()
        });
    }

    // Vaciar campos legacy (la fuente de verdad ahora son los perfiles).
    doc.reglasPorPlato = [];
    doc.reglasPorCategoria = [];

    console.log('✅ Migración v2: perfil "Principal" + bloque 24h creados desde reglas legacy');
    return doc;
}

/**
 * Obtiene el singleton, creándolo con defaults si no existe, y aplicando
 * migración v1→v2 in-place si corresponde. Persiste la migración si hubo cambios.
 */
asignacionAutomaticaSchema.statics.obtenerConfiguracion = async function() {
    let config = await this.findById(CONFIG_ID);
    if (!config) {
        config = await this.create({ _id: CONFIG_ID, ...CONFIGURACION_DEFAULT });
        console.log('✅ Configuración de Asignación Automática creada con valores por defecto');
        return config;
    }
    // Migración perezosa v1→v2 si el doc aún no tiene perfiles.
    const antesPerfiles = Array.isArray(config.perfiles) ? config.perfiles.length : 0;
    migrarAV2(config);
    if (config.perfiles.length !== antesPerfiles || (Array.isArray(config.reglasPorPlato) && config.reglasPorPlato.length === 0 && antesPerfiles === 0)) {
        // Guardar solo si la migración realmente añadió perfiles (o vació legacy).
        if (config.isModified && config.isModified()) {
            await config.save();
            console.log('✅ Migración v2 persistida');
        }
    }
    // Paridad con guarniciones: si hay perfiles pero el calendario está vacío,
    // sembrar bloque 24h para que el toggle ON asigne (sin_franja_activa silenciaba platos).
    const perfiles = config.perfiles || [];
    const bloques = config.calendario?.bloques || [];
    if (perfiles.length > 0 && bloques.length === 0) {
        const perfilId = (perfiles.find(p => p.activo !== false) || perfiles[0]).id;
        if (perfilId) {
            const seeded = await this.findOneAndUpdate(
                { _id: CONFIG_ID, 'calendario.bloques.0': { $exists: false } },
                {
                    $push: {
                        'calendario.bloques': {
                            id: uuidv4(),
                            perfilId,
                            diasSemana: [0, 1, 2, 3, 4, 5, 6],
                            horaInicio: '00:00',
                            horaFin: '23:59',
                            etiqueta: 'Default 24h',
                            activo: true,
                            createdAt: new Date()
                        }
                    }
                },
                { new: true }
            );
            if (seeded) config = seeded;
        }
    }
    config = await migrarCuposFactoryV3(this, CONFIG_ID, config, {
        mismoKey: 'maxMismoPlatoPorCocinero', mismoOld: 5, mismoNew: 20,
        totalKey: 'maxPlatosTotalesEnCurso', totalOld: 10, totalNew: 40,
        log: '✅ Cupos default de asignación (platos) migrados a 20 / 40'
    });
    return config;
};

const AsignacionAutomatica = mongoose.model('AsignacionAutomatica', asignacionAutomaticaSchema, 'asignacion_automatica');

// Adjuntar constantes al modelo para que Jest.mock no las pierda
AsignacionAutomatica.CONFIG_ID = CONFIG_ID;
AsignacionAutomatica.CONFIGURACION_DEFAULT = CONFIGURACION_DEFAULT;
AsignacionAutomatica.migrarAV2 = migrarAV2;
AsignacionAutomatica.generarId = uuidv4;

module.exports = AsignacionAutomatica;
