const ComplementoPlantilla = require('../database/models/complementoPlantilla.model');
const platoModel = require('../database/models/plato.model');
const logger = require('../utils/logger');

/**
 * Listar todos los complementos plantilla (activos e inactivos)
 * @param {Object} opts - Opciones de filtrado { soloActivos: boolean, categoria: string }
 */
const listarComplementosPlantilla = async (opts = {}) => {
    const filter = {};
    
    if (opts.soloActivos === true) {
        filter.activo = true;
    }
    
    if (opts.categoria && opts.categoria.trim()) {
        filter.categoria = opts.categoria.trim();
    }
    
    const data = await ComplementoPlantilla.find(filter)
        .sort({ nombre: 1 })
        .lean();
    
    return data;
};

/**
 * Buscar complementos plantilla por término de búsqueda
 * @param {string} termino - Término de búsqueda
 * @param {Object} opts - Opciones { soloActivos: boolean, categoria: string, limit: number }
 */
const buscarComplementosPlantilla = async (termino, opts = {}) => {
    const filter = {};
    
    if (opts.soloActivos !== false) {
        filter.activo = true;
    }
    
    if (termino && termino.trim()) {
        const regex = new RegExp(termino.trim(), 'i');
        filter.$or = [
            { nombre: regex },
            { nombreLower: regex },
            { descripcion: regex }
        ];
    }
    
    if (opts.categoria && opts.categoria.trim()) {
        filter.categoria = opts.categoria.trim();
    }
    
    const limit = opts.limit || 100;
    
    const data = await ComplementoPlantilla.find(filter)
        .sort({ nombre: 1 })
        .limit(limit)
        .lean();
    
    return data;
};

/**
 * Obtener un complemento plantilla por ID
 * @param {string} id - ID del complemento (ObjectId o numérico)
 */
const obtenerComplementoPlantillaPorId = async (id) => {
    const mongoose = require('mongoose');
    
    // Intentar por ObjectId primero
    if (mongoose.Types.ObjectId.isValid(id) && String(id).length === 24) {
        const byId = await ComplementoPlantilla.findById(id);
        if (byId) return byId;
    }
    
    // Intentar por id numérico
    const num = Number(id);
    if (!Number.isNaN(num)) {
        const data = await ComplementoPlantilla.findOne({ id: num });
        if (data) return data;
    }
    
    return null;
};

/**
 * Obtener categorías disponibles
 */
const getCategoriasComplementos = async () => {
    const categorias = await ComplementoPlantilla.distinct('categoria');
    return categorias.filter(c => c && c.trim()).sort();
};

/**
 * Crear un nuevo complemento plantilla
 * @param {Object} data - Datos del complemento
 */
const crearComplementoPlantilla = async (data) => {
    // Validaciones
    if (!data.nombre || !data.nombre.trim()) {
        const err = new Error('El nombre del complemento es requerido');
        err.statusCode = 400;
        throw err;
    }
    
    // Verificar duplicados por nombre
    const nombreLower = data.nombre.trim().toLowerCase();
    const existente = await ComplementoPlantilla.findOne({ nombreLower });
    
    if (existente) {
        const err = new Error(`Ya existe un complemento con el nombre "${data.nombre}"`);
        err.statusCode = 409;
        throw err;
    }
    
    // Crear el complemento
    const nuevo = await ComplementoPlantilla.create({
        nombre: data.nombre.trim(),
        descripcion: data.descripcion?.trim() || '',
        opciones: data.opciones || [],
        obligatorio: data.obligatorio || false,
        seleccionMultiple: data.seleccionMultiple || false,
        // ===== NUEVOS CAMPOS v2.0 =====
        modoSeleccion: data.modoSeleccion || (data.seleccionMultiple ? 'cantidades' : 'opciones'),
        maxUnidadesGrupo: data.maxUnidadesGrupo ?? (data.seleccionMultiple ? null : 1),
        minUnidadesGrupo: data.minUnidadesGrupo ?? (data.obligatorio ? 1 : 0),
        maxUnidadesPorOpcion: data.maxUnidadesPorOpcion ?? null,
        permiteRepetirOpcion: data.permiteRepetirOpcion ?? data.seleccionMultiple,
        // ===== FIN NUEVOS CAMPOS =====
        categoria: data.categoria?.trim() || 'General',
        activo: data.activo !== false,
        creadoPor: data.creadoPor || 'admin'
    });
    
    logger.info('Complemento plantilla creado', { 
        id: nuevo.id, 
        nombre: nuevo.nombre,
        categoria: nuevo.categoria 
    });
    
    return nuevo;
};

/**
 * Actualizar un complemento plantilla
 * @param {string} id - ID del complemento
 * @param {Object} newData - Nuevos datos
 */
const actualizarComplementoPlantilla = async (id, newData) => {
    const complemento = await obtenerComplementoPlantillaPorId(id);
    
    if (!complemento) {
        const err = new Error('Complemento plantilla no encontrado');
        err.statusCode = 404;
        throw err;
    }
    
    // Si se cambia el nombre, verificar duplicados
    if (newData.nombre && newData.nombre.trim() !== complemento.nombre) {
        const nombreLower = newData.nombre.trim().toLowerCase();
        const existente = await ComplementoPlantilla.findOne({ 
            nombreLower, 
            _id: { $ne: complemento._id } 
        });
        
        if (existente) {
            const err = new Error(`Ya existe un complemento con el nombre "${newData.nombre}"`);
            err.statusCode = 409;
            throw err;
        }
    }
    
    // Actualizar campos permitidos
    const camposActualizables = [
        'nombre', 'descripcion', 'opciones', 
        'obligatorio', 'seleccionMultiple', 
        'categoria', 'activo',
        // ===== NUEVOS CAMPOS v2.0 =====
        'modoSeleccion', 'maxUnidadesGrupo', 'minUnidadesGrupo',
        'maxUnidadesPorOpcion', 'permiteRepetirOpcion'
        // ===== FIN NUEVOS CAMPOS =====
    ];
    
    for (const campo of camposActualizables) {
        if (newData[campo] !== undefined) {
            if (campo === 'nombre' || campo === 'descripcion' || campo === 'categoria') {
                complemento[campo] = newData[campo]?.trim() || '';
            } else {
                complemento[campo] = newData[campo];
            }
        }
    }
    
    complemento.actualizadoPor = newData.actualizadoPor || 'admin';
    
    await complemento.save();
    
    logger.info('Complemento plantilla actualizado', { 
        id: complemento.id, 
        nombre: complemento.nombre 
    });
    
    return complemento;
};

/**
 * Desactivar un complemento plantilla (borrado lógico)
 * @param {string} id - ID del complemento
 * @param {boolean} validarUso - Si true, verifica si está en uso antes de desactivar
 */
const desactivarComplementoPlantilla = async (id, validarUso = true) => {
    const complemento = await obtenerComplementoPlantillaPorId(id);
    
    if (!complemento) {
        const err = new Error('Complemento plantilla no encontrado');
        err.statusCode = 404;
        throw err;
    }
    
    // Verificar si está en uso por platos
    if (validarUso) {
        const usoEnPlatos = await contarUsoEnPlatos(complemento._id);
        if (usoEnPlatos > 0) {
            // No bloquear, pero informar que se desactivará
            logger.warn('Desactivando complemento que está en uso', { 
                id: complemento.id, 
                nombre: complemento.nombre,
                platosUsandolo: usoEnPlatos 
            });
        }
    }
    
    complemento.activo = false;
    await complemento.save();
    
    logger.info('Complemento plantilla desactivado', { 
        id: complemento.id, 
        nombre: complemento.nombre 
    });
    
    return complemento;
};

/**
 * Reactivar un complemento plantilla
 * @param {string} id - ID del complemento
 */
const reactivarComplementoPlantilla = async (id) => {
    const complemento = await obtenerComplementoPlantillaPorId(id);
    
    if (!complemento) {
        const err = new Error('Complemento plantilla no encontrado');
        err.statusCode = 404;
        throw err;
    }
    
    complemento.activo = true;
    await complemento.save();
    
    logger.info('Complemento plantilla reactivado', { 
        id: complemento.id, 
        nombre: complemento.nombre 
    });
    
    return complemento;
};

/**
 * Eliminar físicamente un complemento plantilla (solo si no está en uso)
 * @param {string} id - ID del complemento
 */
const eliminarComplementoPlantilla = async (id) => {
    const complemento = await obtenerComplementoPlantillaPorId(id);
    
    if (!complemento) {
        const err = new Error('Complemento plantilla no encontrado');
        err.statusCode = 404;
        throw err;
    }
    
    // Verificar si está en uso
    const usoEnPlatos = await contarUsoEnPlatos(complemento._id);
    
    if (usoEnPlatos > 0) {
        const err = new Error(
            `No se puede eliminar: el complemento "${complemento.nombre}" está siendo usado por ${usoEnPlatos} plato(s). ` +
            'Use desactivación en su lugar.'
        );
        err.statusCode = 409;
        err.platosUsandolo = usoEnPlatos;
        throw err;
    }
    
    await ComplementoPlantilla.findByIdAndDelete(complemento._id);
    
    logger.info('Complemento plantilla eliminado físicamente', { 
        id: complemento.id, 
        nombre: complemento.nombre 
    });
    
    return { mensaje: 'Complemento eliminado correctamente', id: complemento.id };
};

/**
 * Contar cuántos platos usan un complemento plantilla (por coincidencia de nombre)
 * @param {string} complementoId - ID del complemento
 */
const contarUsoEnPlatos = async (complementoId) => {
    const complemento = await obtenerComplementoPlantillaPorId(complementoId);
    
    if (!complemento) return 0;
    
    // Buscar platos que tienen un grupo de complemento con el mismo nombre
    const count = await platoModel.countDocuments({
        'complementos.grupo': complemento.nombre
    });
    
    return count;
};

/**
 * Obtener platos que usan un complemento específico
 * @param {string} complementoId - ID del complemento
 * @param {Object} opts - Opciones de paginación { limit, skip }
 */
const obtenerPlatosQueUsanComplemento = async (complementoId, opts = {}) => {
    const complemento = await obtenerComplementoPlantillaPorId(complementoId);
    
    if (!complemento) return { platos: [], total: 0 };
    
    const limit = opts.limit || 50;
    const skip = opts.skip || 0;
    
    const platos = await platoModel.find({
        'complementos.grupo': complemento.nombre
    })
    .select('id nombre categoria tipo precio stock')
    .sort({ nombre: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
    
    const total = await platoModel.countDocuments({
        'complementos.grupo': complemento.nombre
    });
    
    return { platos, total };
};

/**
 * Obtener estadísticas de uso de complementos
 */
const obtenerEstadisticasUso = async () => {
    const complementos = await ComplementoPlantilla.find({ activo: true }).lean();
    
    const estadisticas = [];
    
    for (const comp of complementos) {
        const count = await platoModel.countDocuments({
            'complementos.grupo': comp.nombre
        });
        
        estadisticas.push({
            id: comp.id,
            _id: comp._id,
            nombre: comp.nombre,
            categoria: comp.categoria,
            platosUsandolo: count
        });
    }
    
    // Ordenar por uso descendente
    estadisticas.sort((a, b) => b.platosUsandolo - a.platosUsandolo);
    
    return estadisticas;
};

module.exports = {
    listarComplementosPlantilla,
    buscarComplementosPlantilla,
    obtenerComplementoPlantillaPorId,
    getCategoriasComplementos,
    crearComplementoPlantilla,
    actualizarComplementoPlantilla,
    desactivarComplementoPlantilla,
    reactivarComplementoPlantilla,
    eliminarComplementoPlantilla,
    contarUsoEnPlatos,
    obtenerPlatosQueUsanComplemento,
    obtenerEstadisticasUso
};
