const mongoose = require('mongoose');
const moment = require('moment-timezone');
const logger = require('../utils/logger');

// Importar modelo de metas
let MetasMozos;
try {
    MetasMozos = mongoose.model('MetasMozos');
} catch (e) {
    MetasMozos = require('../database/models/metaMozo.model');
}

// Modelos adicionales - usar try/catch para evitar errores si no están cargados
let Mozos, Boucher, Propina;
try {
    Mozos = mongoose.model('mozos');
} catch (e) {
    Mozos = require('../database/models/mozos.model');
}
try {
    Boucher = mongoose.model('Boucher');
} catch (e) {
    Boucher = require('../database/models/boucher.model');
}
try {
    Propina = mongoose.model('Propina');
} catch (e) {
    Propina = require('../database/models/propina.model');
}

// ============================================================
// CREATE - CREAR META
// ============================================================

/**
 * Crear una nueva meta
 */
async function crearMeta(data) {
    const {
        tipo,
        valorObjetivo,
        periodo,
        vigenciaInicio,
        vigenciaFin,
        mozosAplican = [],
        aplicarATodos = false,
        aplicarTurno = 'todos',
        esPlantilla = false,
        nombre = '',
        descripcion = '',
        notificar = false,
        creadoPor,
        creadoPorNombre
    } = data;

    // Calcular fechas de vigencia según período si no se proporcionan
    let inicio = vigenciaInicio ? new Date(vigenciaInicio) : new Date();
    let fin = vigenciaFin ? new Date(vigenciaFin) : new Date();
    
    if (!vigenciaInicio || !vigenciaFin) {
        switch (periodo) {
            case 'diario':
                inicio = moment.tz('America/Lima').startOf('day').toDate();
                fin = moment.tz('America/Lima').endOf('day').toDate();
                break;
            case 'semanal':
                inicio = moment.tz('America/Lima').startOf('week').toDate();
                fin = moment.tz('America/Lima').endOf('week').toDate();
                break;
            case 'mensual':
                inicio = moment.tz('America/Lima').startOf('month').toDate();
                fin = moment.tz('America/Lima').endOf('month').toDate();
                break;
        }
    }

    const meta = new MetasMozos({
        tipo,
        valorObjetivo,
        periodo,
        vigenciaInicio: inicio,
        vigenciaFin: fin,
        mozosAplican: mozosAplican.map(id => mongoose.Types.ObjectId(id)),
        aplicarATodos,
        aplicarTurno,
        esPlantilla,
        nombre,
        descripcion,
        notificar,
        creadoPor: creadoPor ? mongoose.Types.ObjectId(creadoPor) : null,
        creadoPorNombre,
        activo: true
    });

    await meta.save();
    
    logger.info('Meta creada', {
        metaId: meta.metaId,
        tipo,
        periodo,
        valorObjetivo,
        creadoPor: creadoPorNombre
    });

    return meta.toObject();
}

/**
 * Crear meta desde plantilla
 */
async function crearMetaDesdePlantilla(plantillaId, datosPersonalizados = {}) {
    const plantilla = await MetasMozos.findById(plantillaId);
    if (!plantilla) {
        const err = new Error('Plantilla no encontrada');
        err.statusCode = 404;
        throw err;
    }
    if (!plantilla.esPlantilla) {
        const err = new Error('El ID proporcionado no corresponde a una plantilla');
        err.statusCode = 400;
        throw err;
    }

    const nuevaMeta = await crearMeta({
        tipo: plantilla.tipo,
        valorObjetivo: datosPersonalizados.valorObjetivo || plantilla.valorObjetivo,
        periodo: plantilla.periodo,
        vigenciaInicio: datosPersonalizados.vigenciaInicio,
        vigenciaFin: datosPersonalizados.vigenciaFin,
        mozosAplican: datosPersonalizados.mozosAplican || [],
        aplicarATodos: datosPersonalizados.aplicarATodos ?? plantilla.aplicarATodos,
        aplicarTurno: datosPersonalizados.aplicarTurno || plantilla.aplicarTurno,
        esPlantilla: false,
        creadoPor: datosPersonalizados.creadoPor,
        creadoPorNombre: datosPersonalizados.creadoPorNombre
    });

    // Incrementar contador de uso
    await MetasMozos.findByIdAndUpdate(plantillaId, { $inc: { vecesUsada: 1 } });

    return nuevaMeta;
}

// ============================================================
// READ - OBTENER METAS
// ============================================================

/**
 * Obtener todas las metas con filtros opcionales
 */
async function obtenerMetas(filtros = {}) {
    const { activo, tipo, periodo, esPlantilla } = filtros;
    
    const query = {};
    if (activo !== undefined) query.activo = activo;
    if (tipo) query.tipo = tipo;
    if (periodo) query.periodo = periodo;
    if (esPlantilla !== undefined) query.esPlantilla = esPlantilla;

    return MetasMozos.find(query)
        .sort({ createdAt: -1 })
        .lean();
}

/**
 * Obtener meta por ID
 */
async function obtenerMetaPorId(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
    }
    return MetasMozos.findById(id).lean();
}

/**
 * Obtener metas activas (vigentes)
 */
async function obtenerMetasActivas() {
    const ahora = moment.tz('America/Lima').toDate();
    return MetasMozos.find({
        activo: true,
        esPlantilla: false,
        vigenciaInicio: { $lte: ahora },
        vigenciaFin: { $gte: ahora }
    })
    .populate('mozosAplican', 'name activo enTurno')
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Obtener metas futuras (programadas)
 */
async function obtenerMetasFuturas() {
    const ahora = moment.tz('America/Lima').toDate();
    return MetasMozos.find({
        activo: true,
        esPlantilla: false,
        vigenciaInicio: { $gt: ahora }
    })
    .populate('mozosAplican', 'name activo enTurno')
    .sort({ vigenciaInicio: 1 })
    .lean();
}

/**
 * Obtener historial de metas
 */
async function obtenerHistorialMetas(limite = 50) {
    const ahora = moment.tz('America/Lima').toDate();
    return MetasMozos.find({
        $or: [
            { activo: false },
            { vigenciaFin: { $lt: ahora } }
        ],
        esPlantilla: false
    })
    .sort({ vigenciaFin: -1 })
    .limit(limite)
    .lean();
}

/**
 * Obtener plantillas
 */
async function obtenerPlantillas() {
    return MetasMozos.find({ esPlantilla: true })
        .sort({ createdAt: -1 })
        .lean();
}

/**
 * Obtener metas aplicables a un mozo
 */
async function obtenerMetasPorMozo(mozoId) {
    const ahora = moment.tz('America/Lima').toDate();
    return MetasMozos.find({
        activo: true,
        esPlantilla: false,
        vigenciaInicio: { $lte: ahora },
        vigenciaFin: { $gte: ahora },
        $or: [
            { aplicarATodos: true },
            { mozosAplican: mongoose.Types.ObjectId(mozoId) }
        ]
    }).lean();
}

// ============================================================
// UPDATE - ACTUALIZAR META
// ============================================================

/**
 * Actualizar meta
 */
async function actualizarMeta(id, datos) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        const err = new Error('ID de meta inválido');
        err.statusCode = 400;
        throw err;
    }

    const datosActualizacion = { ...datos };
    
    // Si se actualizan mozos, convertir a ObjectId
    if (datos.mozosAplican) {
        datosActualizacion.mozosAplican = datos.mozosAplican.map(id => 
            mongoose.Types.ObjectId(id)
        );
    }

    // Si se actualizan fechas, convertirlas
    if (datos.vigenciaInicio) {
        datosActualizacion.vigenciaInicio = new Date(datos.vigenciaInicio);
    }
    if (datos.vigenciaFin) {
        datosActualizacion.vigenciaFin = new Date(datos.vigenciaFin);
    }

    const meta = await MetasMozos.findByIdAndUpdate(
        id,
        { $set: datosActualizacion },
        { new: true, runValidators: true }
    ).lean();

    if (!meta) {
        const err = new Error('Meta no encontrada');
        err.statusCode = 404;
        throw err;
    }

    logger.info('Meta actualizada', { metaId: meta.metaId, cambios: Object.keys(datos) });

    return meta;
}

/**
 * Desactivar meta (soft delete)
 */
async function desactivarMeta(id, desactivadoPor, desactivadoPorNombre) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        const err = new Error('ID de meta inválido');
        err.statusCode = 400;
        throw err;
    }

    const meta = await MetasMozos.findByIdAndUpdate(
        id,
        { 
            $set: { 
                activo: false,
                actualizadoPor: desactivadoPor ? mongoose.Types.ObjectId(desactivadoPor) : null,
                actualizadoPorNombre: desactivadoPorNombre
            } 
        },
        { new: true }
    ).lean();

    if (!meta) {
        const err = new Error('Meta no encontrada');
        err.statusCode = 404;
        throw err;
    }

    logger.info('Meta desactivada', { 
        metaId: meta.metaId, 
        desactivadoPor: desactivadoPorNombre 
    });

    return meta;
}

/**
 * Duplicar meta
 */
async function duplicarMeta(id, nuevasFechas = {}) {
    const metaOriginal = await MetasMozos.findById(id);
    if (!metaOriginal) {
        const err = new Error('Meta no encontrada');
        err.statusCode = 404;
        throw err;
    }

    const nuevaMeta = await crearMeta({
        tipo: metaOriginal.tipo,
        valorObjetivo: metaOriginal.valorObjetivo,
        periodo: metaOriginal.periodo,
        vigenciaInicio: nuevasFechas.vigenciaInicio,
        vigenciaFin: nuevasFechas.vigenciaFin,
        mozosAplican: metaOriginal.mozosAplican.map(id => id.toString()),
        aplicarATodos: metaOriginal.aplicarATodos,
        aplicarTurno: metaOriginal.aplicarTurno,
        esPlantilla: false,
        creadoPor: metaOriginal.creadoPor,
        creadoPorNombre: metaOriginal.creadoPorNombre
    });

    return nuevaMeta;
}

/**
 * Activar meta futura inmediatamente
 */
async function activarMetaAhora(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        const err = new Error('ID de meta inválido');
        err.statusCode = 400;
        throw err;
    }

    const ahora = moment.tz('America/Lima').toDate();
    const meta = await MetasMozos.findById(id);
    
    if (!meta) {
        const err = new Error('Meta no encontrada');
        err.statusCode = 404;
        throw err;
    }

    // Calcular nueva fecha de fin según período
    let nuevaFechaFin = new Date();
    switch (meta.periodo) {
        case 'diario':
            nuevaFechaFin = moment.tz('America/Lima').endOf('day').toDate();
            break;
        case 'semanal':
            nuevaFechaFin = moment.tz('America/Lima').add(6, 'days').endOf('day').toDate();
            break;
        case 'mensual':
            nuevaFechaFin = moment.tz('America/Lima').add(30, 'days').endOf('day').toDate();
            break;
    }

    meta.vigenciaInicio = ahora;
    meta.vigenciaFin = nuevaFechaFin;
    await meta.save();

    logger.info('Meta activada inmediatamente', { metaId: meta.metaId });

    return meta.toObject();
}

// ============================================================
// DELETE - ELIMINAR META
// ============================================================

/**
 * Eliminar meta permanentemente (solo si no tiene progreso)
 */
async function eliminarMeta(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        const err = new Error('ID de meta inválido');
        err.statusCode = 400;
        throw err;
    }

    const meta = await MetasMozos.findByIdAndDelete(id);
    
    if (!meta) {
        const err = new Error('Meta no encontrada');
        err.statusCode = 404;
        throw err;
    }

    logger.info('Meta eliminada', { metaId: meta.metaId });

    return { eliminado: true, metaId: meta.metaId };
}

// ============================================================
// MÉTRICAS Y CÁLCULOS
// ============================================================

/**
 * Calcular valor actual de un mozo según tipo de meta
 */
async function calcularValorActualMozo(mozoId, tipoMeta, fechaInicio, fechaFin) {
    const mozoObjectId = mongoose.Types.ObjectId(mozoId);
    
    switch (tipoMeta) {
        case 'ventas': {
            const bouchers = await Boucher.aggregate([
                { 
                    $match: { 
                        mozo: mozoObjectId,
                        createdAt: { $gte: new Date(fechaInicio), $lte: new Date(fechaFin) }
                    } 
                },
                { $group: { _id: null, total: { $sum: '$total' } } }
            ]);
            return bouchers.length > 0 ? bouchers[0].total : 0;
        }
        
        case 'mesas_atendidas': {
            const mesas = await Boucher.distinct('mesa', {
                mozo: mozoObjectId,
                createdAt: { $gte: new Date(fechaInicio), $lte: new Date(fechaFin) }
            });
            return mesas.length;
        }
        
        case 'tickets_generados': {
            const count = await Boucher.countDocuments({
                mozo: mozoObjectId,
                createdAt: { $gte: new Date(fechaInicio), $lte: new Date(fechaFin) }
            });
            return count;
        }
        
        case 'ticket_promedio': {
            const result = await Boucher.aggregate([
                { 
                    $match: { 
                        mozo: mozoObjectId,
                        createdAt: { $gte: new Date(fechaInicio), $lte: new Date(fechaFin) }
                    } 
                },
                { 
                    $group: { 
                        _id: null, 
                        totalVentas: { $sum: '$total' },
                        cantidad: { $sum: 1 }
                    } 
                }
            ]);
            if (result.length === 0 || result[0].cantidad === 0) return 0;
            return result[0].totalVentas / result[0].cantidad;
        }
        
        case 'propinas_promedio': {
            const propinas = await Propina.aggregate([
                { 
                    $match: { 
                        mozoId: mozoObjectId,
                        fechaRegistro: { $gte: new Date(fechaInicio), $lte: new Date(fechaFin) },
                        activo: true
                    } 
                },
                { 
                    $group: { 
                        _id: null, 
                        totalPropinas: { $sum: '$montoPropina' },
                        cantidad: { $sum: 1 }
                    } 
                }
            ]);
            if (propinas.length === 0 || propinas[0].cantidad === 0) return 0;
            return propinas[0].totalPropinas / propinas[0].cantidad;
        }
        
        default:
            return 0;
    }
}

/**
 * Obtener cumplimiento de una meta con datos de cada mozo
 */
async function obtenerCumplimientoMeta(metaId) {
    const meta = await MetasMozos.findById(metaId);
    if (!meta) {
        const err = new Error('Meta no encontrada');
        err.statusCode = 404;
        throw err;
    }

    // Obtener mozos asignados
    let mozosAsignados = [];
    if (meta.aplicarATodos) {
        mozosAsignados = await Mozos.find({ activo: true }).lean();
    } else if (meta.mozosAplican && meta.mozosAplican.length > 0) {
        mozosAsignados = await Mozos.find({ _id: { $in: meta.mozosAplican } }).lean();
    }

    // Calcular valor actual para cada mozo
    const cumplimiento = await Promise.all(
        mozosAsignados.map(async (mozo) => {
            const valorActual = await calcularValorActualMozo(
                mozo._id,
                meta.tipo,
                meta.vigenciaInicio,
                meta.vigenciaFin
            );
            
            const porcentajeAvance = meta.valorObjetivo > 0 
                ? (valorActual / meta.valorObjetivo) * 100 
                : 0;
            
            const estado = meta.calcularEstadoCumplimiento(porcentajeAvance, mozo.enTurno);
            const proyeccion = meta.calcularProyeccion(valorActual);

            return {
                mozoId: mozo._id,
                mozoNombre: mozo.name,
                enTurno: mozo.enTurno,
                valorActual,
                porcentajeAvance,
                estado,
                proyeccion
            };
        })
    );

    // Calcular métricas agregadas
    const totalMozos = cumplimiento.length;
    const mozosCumpliendo = cumplimiento.filter(c => c.porcentajeAvance >= 80).length;
    const mozosEnRiesgo = cumplimiento.filter(c => c.porcentajeAvance < 50).length;
    const cumplimientoPromedio = totalMozos > 0
        ? cumplimiento.reduce((sum, c) => sum + c.porcentajeAvance, 0) / totalMozos
        : 0;

    // Actualizar métricas en la meta
    await MetasMozos.findByIdAndUpdate(metaId, {
        $set: {
            cumplimientoPromedio,
            mozosCumpliendo,
            mozosEnRiesgo,
            ultimaActualizacionMetricas: new Date()
        }
    });

    return {
        meta: meta.toObject(),
        cumplimiento,
        resumen: {
            totalMozos,
            mozosCumpliendo,
            mozosEnRiesgo,
            cumplimientoPromedio: Math.round(cumplimientoPromedio * 100) / 100
        }
    };
}

// ============================================================
// EXPORTACIONES
// ============================================================

module.exports = {
    // CREATE
    crearMeta,
    crearMetaDesdePlantilla,
    
    // READ
    obtenerMetas,
    obtenerMetaPorId,
    obtenerMetasActivas,
    obtenerMetasFuturas,
    obtenerHistorialMetas,
    obtenerPlantillas,
    obtenerMetasPorMozo,
    
    // UPDATE
    actualizarMeta,
    desactivarMeta,
    duplicarMeta,
    activarMetaAhora,
    
    // DELETE
    eliminarMeta,
    
    // MÉTRICAS
    calcularValorActualMozo,
    obtenerCumplimientoMeta
};
