const mongoose = require('mongoose');
const moment = require('moment-timezone');
const AutoIncrement = require('mongoose-sequence')(mongoose);

/**
 * MODELO META DE MOZO
 * Sistema de gestión de metas para el personal de salón
 * 
 * Permite definir objetivos de rendimiento para mozos:
 * - Ventas diarias/semanales/mensuales
 * - Mesas atendidas
 * - Tickets generados
 * - Ticket promedio
 * - Propinas promedio
 */

// Tipos de metas disponibles
const TIPOS_META = {
    ventas: { 
        nombre: 'Ventas', 
        unidad: 'S/.', 
        descripcion: 'Total facturado por el mozo en el período',
        icono: '💰'
    },
    mesas_atendidas: { 
        nombre: 'Mesas atendidas', 
        unidad: 'mesas', 
        descripcion: 'Cantidad de mesas distintas con pago procesado',
        icono: '🪑'
    },
    tickets_generados: { 
        nombre: 'Tickets generados', 
        unidad: 'tickets', 
        descripcion: 'Cantidad de bouchers/tickets emitidos',
        icono: '🎫'
    },
    ticket_promedio: { 
        nombre: 'Ticket promedio', 
        unidad: 'S/.', 
        descripcion: 'Valor promedio por ticket (ventas ÷ tickets)',
        icono: '📊'
    },
    propinas_promedio: { 
        nombre: 'Propinas promedio', 
        unidad: 'S/.', 
        descripcion: 'Propina promedio por ticket',
        icono: '💡'
    }
};

// Períodos disponibles
const PERIODOS = ['diario', 'semanal', 'mensual'];

// Estados de cumplimiento
const ESTADOS_CUMPLIMIENTO = [
    'sin_iniciar',
    'en_progreso',
    'en_riesgo',
    'encaminado',
    'cumplido',
    'superado'
];

const metaMozoSchema = new mongoose.Schema({
    // ========== IDENTIFICACIÓN ==========
    metaId: {
        type: Number,
        unique: true
    },
    
    // ========== CONFIGURACIÓN DE LA META ==========
    tipo: {
        type: String,
        enum: Object.keys(TIPOS_META),
        required: [true, 'El tipo de meta es requerido']
    },
    
    valorObjetivo: {
        type: Number,
        required: [true, 'El valor objetivo es requerido'],
        min: [0, 'El valor objetivo debe ser mayor o igual a 0']
    },
    
    // Tipo de valor: absoluto (S/. 500) o relativo (porcentaje)
    tipoValor: {
        type: String,
        enum: ['absoluto', 'relativo'],
        default: 'absoluto'
    },
    
    // Operador de comparación: mayor o igual, menor o igual, igual
    operador: {
        type: String,
        enum: ['gte', 'lte', 'eq'],
        default: 'gte'
    },
    
    // ========== PERÍODO Y VIGENCIA ==========
    periodo: {
        type: String,
        enum: PERIODOS,
        required: [true, 'El período es requerido']
    },
    
    vigenciaInicio: {
        type: Date,
        required: [true, 'La fecha de inicio es requerida']
    },
    
    vigenciaFin: {
        type: Date,
        required: [true, 'La fecha de fin es requerida']
    },
    
    // ========== APLICACIÓN / ASIGNACIÓN ==========
    // Mozos específicos a los que aplica esta meta
    mozosAplican: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos'
    }],
    
    // Si aplica a todos los mozos activos
    aplicarATodos: {
        type: Boolean,
        default: false
    },
    
    // Si aplica por turno
    aplicarTurno: {
        type: String,
        enum: ['manana', 'noche', 'todos'],
        default: 'todos'
    },
    
    // ========== ESTADO ==========
    activo: {
        type: Boolean,
        default: true
    },
    
    // Si es una plantilla reutilizable
    esPlantilla: {
        type: Boolean,
        default: false
    },
    
    // Referencia a la plantilla desde la que se creó (si aplica)
    plantillaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MetasMozos'
    },
    
    // Nombre de la plantilla (para mostrar en UI)
    nombre: {
        type: String,
        default: ''
    },
    
    descripcion: {
        type: String,
        default: ''
    },
    
    // ========== NOTIFICACIONES ==========
    notificar: {
        type: Boolean,
        default: false
    },
    
    notificadoEn: {
        type: Date
    },
    
    // Veces que se ha usado esta plantilla
    vecesUsada: {
        type: Number,
        default: 0
    },
    
    // ========== AUDITORÍA ==========
    creadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos'
    },
    
    actualizadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos'
    },
    
    creadoPorNombre: {
        type: String,
        default: ''
    },
    
    actualizadoPorNombre: {
        type: String,
        default: ''
    },
    
    // ========== MÉTRICAS CALCULADAS (snapshots) ==========
    // Última vez que se calcularon las métricas
    ultimaActualizacionMetricas: {
        type: Date
    },
    
    // Porcentaje de cumplimiento promedio del equipo
    cumplimientoPromedio: {
        type: Number,
        default: 0
    },
    
    // Cantidad de mozos que cumplen la meta
    mozosCumpliendo: {
        type: Number,
        default: 0
    },
    
    // Cantidad de mozos en riesgo
    mozosEnRiesgo: {
        type: Number,
        default: 0
    }
    
}, {
    timestamps: true,
    collection: 'metas_mozos'
});

// ========== ÍNDICES ==========

// Índice para metas activas por período
metaMozoSchema.index(
    { activo: 1, vigenciaInicio: 1, vigenciaFin: 1 },
    { name: 'idx_metas_activo_vigencia' }
);

// Índice para buscar metas por mozo
metaMozoSchema.index(
    { mozosAplican: 1 },
    { name: 'idx_metas_mozos_aplican' }
);

// Índice para plantillas
metaMozoSchema.index(
    { esPlantilla: 1 },
    { name: 'idx_metas_plantilla' }
);

// Índice para filtrar por tipo y período
metaMozoSchema.index(
    { tipo: 1, periodo: 1, activo: 1 },
    { name: 'idx_metas_tipo_periodo_activo' }
);

// Índice para filtrar por turno
metaMozoSchema.index(
    { aplicarTurno: 1, activo: 1 },
    { name: 'idx_metas_turno_activo' }
);

// ========== HOOKS ==========

// Pre-save: validar fechas
metaMozoSchema.pre('save', function(next) {
    // Validar que la fecha de fin sea posterior a la de inicio
    if (this.vigenciaFin < this.vigenciaInicio) {
        return next(new Error('La fecha de fin debe ser posterior a la fecha de inicio'));
    }
    
    // Validar que haya al menos un mozo asignado o aplicarATodos sea true
    if (!this.aplicarATodos && (!this.mozosAplican || this.mozosAplican.length === 0)) {
        return next(new Error('Debe asignar al menos un mozo o marcar "aplicar a todos"'));
    }
    
    next();
});

// ========== MÉTODOS DE INSTANCIA ==========

/**
 * Verificar si la meta está vigente en la fecha actual
 */
metaMozoSchema.methods.estaVigente = function(fecha = new Date()) {
    return this.activo && 
           this.vigenciaInicio <= fecha && 
           this.vigenciaFin >= fecha;
};

/**
 * Verificar si la meta es futura (aún no inicia)
 */
metaMozoSchema.methods.esFutura = function(fecha = new Date()) {
    return this.activo && this.vigenciaInicio > fecha;
};

/**
 * Verificar si la meta ya finalizó
 */
metaMozoSchema.methods.finalizo = function(fecha = new Date()) {
    return this.vigenciaFin < fecha;
};

/**
 * Obtener el estado de cumplimiento basado en el porcentaje
 */
metaMozoSchema.methods.calcularEstadoCumplimiento = function(porcentajeAvance, enTurno = true) {
    if (!enTurno && porcentajeAvance === 0) return 'sin_iniciar';
    if (porcentajeAvance >= 120) return 'superado';
    if (porcentajeAvance >= 100) return 'cumplido';
    if (porcentajeAvance >= 80) return 'encaminado';
    if (porcentajeAvance >= 50) return 'en_progreso';
    return 'en_riesgo';
};

/**
 * Calcular proyección de cumplimiento
 */
metaMozoSchema.methods.calcularProyeccion = function(valorActual, horasTranscurridas = 4, horasTotales = 8) {
    if (horasTranscurridas === 0) {
        return { alcanzara: false, valorProyectado: 0, brecha: this.valorObjetivo };
    }
    
    const ritmoActual = valorActual / horasTranscurridas;
    const valorProyectado = ritmoActual * horasTotales;
    const alcanzara = valorProyectado >= this.valorObjetivo;
    const brecha = this.valorObjetivo - valorProyectado;
    
    return {
        alcanzara,
        valorProyectado: Math.round(valorProyectado * 100) / 100,
        brecha: Math.round(brecha * 100) / 100,
        ritmoActual: Math.round(ritmoActual * 100) / 100
    };
};

// ========== MÉTODOS ESTÁTICOS ==========

/**
 * Obtener metas activas (vigentes)
 */
metaMozoSchema.statics.getMetasActivas = async function() {
    const ahora = new Date();
    return this.find({
        activo: true,
        esPlantilla: false,
        vigenciaInicio: { $lte: ahora },
        vigenciaFin: { $gte: ahora }
    }).sort({ createdAt: -1 });
};

/**
 * Obtener metas futuras (programadas)
 */
metaMozoSchema.statics.getMetasFuturas = async function() {
    const ahora = new Date();
    return this.find({
        activo: true,
        esPlantilla: false,
        vigenciaInicio: { $gt: ahora }
    }).sort({ vigenciaInicio: 1 });
};

/**
 * Obtener plantillas disponibles
 */
metaMozoSchema.statics.getPlantillas = async function() {
    return this.find({
        esPlantilla: true
    }).sort({ createdAt: -1 });
};

/**
 * Obtener historial de metas (finalizadas o inactivas)
 */
metaMozoSchema.statics.getHistorial = async function(limite = 50) {
    const ahora = new Date();
    return this.find({
        $or: [
            { activo: false },
            { vigenciaFin: { $lt: ahora } }
        ],
        esPlantilla: false
    }).sort({ vigenciaFin: -1 }).limit(limite);
};

/**
 * Obtener metas aplicables a un mozo específico
 */
metaMozoSchema.statics.getMetasPorMozo = async function(mozoId) {
    const ahora = new Date();
    return this.find({
        activo: true,
        esPlantilla: false,
        vigenciaInicio: { $lte: ahora },
        vigenciaFin: { $gte: ahora },
        $or: [
            { aplicarATodos: true },
            { mozosAplican: mozoId }
        ]
    });
};

/**
 * Crear meta desde plantilla
 */
metaMozoSchema.statics.crearDesdePlantilla = async function(plantillaId, datosPersonalizados = {}) {
    const plantilla = await this.findById(plantillaId);
    if (!plantilla || !plantilla.esPlantilla) {
        throw new Error('Plantilla no encontrada');
    }
    
    const nuevaMeta = new this({
        tipo: plantilla.tipo,
        valorObjetivo: datosPersonalizados.valorObjetivo || plantilla.valorObjetivo,
        periodo: plantilla.periodo,
        vigenciaInicio: datosPersonalizados.vigenciaInicio || new Date(),
        vigenciaFin: datosPersonalizados.vigenciaFin,
        aplicarATodos: datosPersonalizados.aplicarATodos ?? plantilla.aplicarATodos,
        aplicarTurno: datosPersonalizados.aplicarTurno || plantilla.aplicarTurno,
        mozosAplican: datosPersonalizados.mozosAplican || [],
        plantillaId: plantilla._id,
        esPlantilla: false,
        activo: true,
        creadoPor: datosPersonalizados.creadoPor,
        creadoPorNombre: datosPersonalizados.creadoPorNombre
    });
    
    // Incrementar contador de uso de la plantilla
    await this.findByIdAndUpdate(plantillaId, { $inc: { vecesUsada: 1 } });
    
    return nuevaMeta.save();
};

// ========== CONSTANTES EXPORTADAS ==========

metaMozoSchema.statics.TIPOS_META = TIPOS_META;
metaMozoSchema.statics.PERIODOS = PERIODOS;
metaMozoSchema.statics.ESTADOS_CUMPLIMIENTO = ESTADOS_CUMPLIMIENTO;

// Auto-increment para metaId
metaMozoSchema.plugin(AutoIncrement, { inc_field: 'metaId' });

const MetasMozos = mongoose.model('MetasMozos', metaMozoSchema);

module.exports = MetasMozos;
module.exports.TIPOS_META = TIPOS_META;
module.exports.PERIODOS = PERIODOS;
module.exports.ESTADOS_CUMPLIMIENTO = ESTADOS_CUMPLIMIENTO;
