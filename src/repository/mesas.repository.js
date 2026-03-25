const mesas = require('../database/models/mesas.model');
const { syncJsonFile } = require('../utils/jsonSync');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DATA_DIR = path.join(__dirname, '../../data');

const listarMesas = async () => {
    const data = await mesas.find({}).populate('area');
    return data;
}

const obtenerMesaPorId = async (id) => {
    const data = await mesas.findOne({ mesasId: id });
    return data;
}

const crearMesa = async (data) => {
    // Validar que se proporcione un área
    if (!data.area) {
        throw new Error('Debe proporcionarse un área para la mesa');
    }

    // Validar que el número de mesa sea único dentro del área
    if (data.nummesa !== undefined) {
        const mesaExistente = await mesas.findOne({ 
            nummesa: data.nummesa,
            area: data.area
        });
        if (mesaExistente) {
            throw new Error(`Ya existe una mesa con el número ${data.nummesa} en esta área`);
        }
    }
    
    // Asegurar que el estado tenga un valor por defecto
    if (!data.estado) {
        data.estado = 'libre';
    }
    
    await mesas.create(data);
    const todaslasmesas = await listarMesas();
    await syncJsonFile('mesas.json', todaslasmesas);
    return todaslasmesas;
}

const actualizarMesa = async (id, newData) => {
    // Buscar la mesa por _id (ObjectId) primero
    let mesaActual = await mesas.findById(id);
    
    // Si no se encuentra, buscar por mesasId
    if (!mesaActual) {
        mesaActual = await mesas.findOne({ mesasId: parseInt(id) });
    }
    
    if (!mesaActual) {
        throw new Error('Mesa no encontrada');
    }

    // Validar que el número de mesa sea único dentro del área si se está actualizando
    if (newData.nummesa !== undefined || newData.area !== undefined) {
        const numMesa = newData.nummesa !== undefined ? newData.nummesa : mesaActual.nummesa;
        const area = newData.area !== undefined ? newData.area : mesaActual.area;
        
        if (mesaActual.nummesa !== numMesa || mesaActual.area?.toString() !== area?.toString()) {
            const mesaExistente = await mesas.findOne({ 
                nummesa: numMesa,
                area: area,
                _id: { $ne: mesaActual._id }
            });
            if (mesaExistente) {
                throw new Error(`Ya existe una mesa con el número ${numMesa} en esta área`);
            }
        }
    }
    
    // Actualizar la mesa
    Object.assign(mesaActual, newData);
    await mesaActual.save();
    
    const todaslasmesas = await listarMesas();
    await syncJsonFile('mesas.json', todaslasmesas);
    return todaslasmesas;
}

// Función para actualizar el estado de una mesa con validación de transiciones
const actualizarEstadoMesa = async (mesaId, nuevoEstado, esAdmin = false) => {
    // Buscar la mesa por _id (ObjectId) o por mesasId
    let mesa = await mesas.findById(mesaId);
    if (!mesa) {
        // Intentar buscar por mesasId numérico
        mesa = await mesas.findOne({ mesasId: parseInt(mesaId) });
    }
    
    if (!mesa) {
        throw new Error('Mesa no encontrada');
    }

    const estadoActual = (mesa.estado || 'libre').toLowerCase();
    const estadoSolicitado = nuevoEstado.toLowerCase();

    // Definir transiciones permitidas
    // ACTUALIZADO: Permitir pagado desde pedido o preparado (cuando todos los platos están entregados)
    const transicionesPermitidas = {
        'libre': ['esperando', 'reservado'],
        'esperando': ['pedido'],
        'pedido': ['preparado', 'pagado', 'libre'], // Permitir pagado directamente cuando platos están entregados
        'preparado': ['pagado', 'libre'], // Permitir volver a libre si se elimina la comanda
        'pagado': ['libre'],
        'reservado': ['libre'] // Solo admin puede liberar reservas
    };

    // Permitir actualizaciones idempotentes (mismo estado → mismo estado)
    if (estadoActual === estadoSolicitado) {
        console.log(`ℹ️ Mesa ${mesa.nummesa} ya está en estado '${estadoActual}', omitiendo actualización`);
        return mesa; // Retornar la mesa sin cambios
    }

    // Validar transición
    const transicionesValidas = transicionesPermitidas[estadoActual] || [];
    
    if (!transicionesValidas.includes(estadoSolicitado)) {
        const errorMsg = `Transición no permitida: ${estadoActual} → ${estadoSolicitado}`;
        console.error(`❌ ${errorMsg}`);
        
        // Log para auditoría
        console.log(`📝 AUDITORÍA - Intento inválido de cambio de estado:`, {
            timestamp: new Date().toISOString(),
            mesaId: mesa._id,
            numMesa: mesa.nummesa,
            estadoActual: estadoActual,
            estadoSolicitado: estadoSolicitado,
            razon: errorMsg,
            esAdmin: esAdmin
        });
        
        const error = new Error(errorMsg);
        error.statusCode = 400; // Bad Request
        throw error;
    }

    // Validar que solo admin puede liberar mesas reservadas
    if (estadoActual === 'reservado' && estadoSolicitado === 'libre' && !esAdmin) {
        const errorMsg = 'Solo un administrador puede liberar una mesa reservada';
        console.error(`❌ ${errorMsg}`);
        
        // Log para auditoría
        console.log(`📝 AUDITORÍA - Intento inválido de cambio de estado:`, {
            timestamp: new Date().toISOString(),
            mesaId: mesa._id,
            numMesa: mesa.nummesa,
            estadoActual: estadoActual,
            estadoSolicitado: estadoSolicitado,
            razon: errorMsg,
            esAdmin: esAdmin
        });
        
        const error = new Error(errorMsg);
        error.statusCode = 403; // Forbidden
        throw error;
    }

    // Actualizar el estado
    mesa.estado = estadoSolicitado;
    await mesa.save();
    
    console.log(`✅ Mesa ${mesa.nummesa} actualizada: ${estadoActual} → ${estadoSolicitado}`);
    
    // Log para auditoría (cambio exitoso)
    console.log(`📝 AUDITORÍA - Cambio de estado exitoso:`, {
        timestamp: new Date().toISOString(),
        mesaId: mesa._id,
        numMesa: mesa.nummesa,
        estadoAnterior: estadoActual,
        estadoNuevo: estadoSolicitado,
        esAdmin: esAdmin
    });

    const todaslasmesas = await listarMesas();
    await syncJsonFile('mesas.json', todaslasmesas);
    
    return { mesa, todaslasmesas };
}


/**
 * Importa mesas desde data/mesas.json. Ejecutar después de importar áreas.
 */
const importarMesasDesdeJSON = async () => {
    try {
        const filePath = path.join(DATA_DIR, 'mesas.json');
        if (!fs.existsSync(filePath)) {
            console.log('⚠️ Archivo mesas.json no encontrado');
            return { imported: 0, updated: 0, errors: 0 };
        }
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!Array.isArray(jsonData)) {
            console.log('⚠️ mesas.json no contiene un array válido');
            return { imported: 0, updated: 0, errors: 0 };
        }
        let imported = 0, errors = 0;
        for (const item of jsonData) {
            try {
                const existente = await mesas.findOne({ mesasId: item.mesasId });
                if (existente) continue;
                const areaId = item.area && (item.area._id || item.area) ? new mongoose.Types.ObjectId(item.area._id || item.area) : null;
                if (!areaId) {
                    errors++;
                    continue;
                }
                await mesas.create({
                    _id: item._id ? new mongoose.Types.ObjectId(item._id) : undefined,
                    mesasId: item.mesasId,
                    nummesa: item.nummesa,
                    isActive: item.isActive !== false,
                    estado: item.estado || 'libre',
                    area: areaId
                });
                imported++;
            } catch (err) {
                errors++;
                console.error(`❌ Error al importar mesa ${item.nummesa}:`, err.message);
            }
        }
        if (imported > 0 || errors > 0) {
            console.log(`✅ Mesas: ${imported} importadas${errors ? `, ${errors} errores` : ''}`);
        }
        return { imported, updated: 0, errors };
    } catch (error) {
        console.error('❌ Error al importar mesas:', error.message);
        return { imported: 0, updated: 0, errors: 1 };
    }
};

const borrarMesa = async (id) => {
    // Usar _id (ObjectId de MongoDB) para eliminar
    await mesas.findByIdAndDelete(id);
    const todaslasmesas = await listarMesas();
    // Sincronizar con el archivo JSON
    await syncJsonFile('mesas.json', todaslasmesas);
    return todaslasmesas;
}

// Función para liberar todas las mesas a estado "libre" (modo libre total)
const liberarTodasLasMesas = async () => {
    try {
        // Actualizar todas las mesas a estado "libre" sin validaciones de transición
        // ya que es una operación administrativa especial
        const resultado = await mesas.updateMany(
            {},
            { $set: { estado: 'libre' } }
        );
        
        console.log(`✅ Modo Libre Total activado: ${resultado.modifiedCount} mesas actualizadas a estado "libre"`);
        
        // Log para auditoría
        console.log(`📝 AUDITORÍA - Modo Libre Total activado:`, {
            timestamp: new Date().toISOString(),
            mesasActualizadas: resultado.modifiedCount,
            mesasAfectadas: resultado.matchedCount
        });
        
        const todaslasmesas = await listarMesas();
        await syncJsonFile('mesas.json', todaslasmesas);
        
        return {
            mesasActualizadas: resultado.modifiedCount,
            mesasAfectadas: resultado.matchedCount,
            todaslasmesas
        };
    } catch (error) {
        console.error('❌ Error en Modo Libre Total:', error);
        throw error;
    }
}

// ==================== FUNCIONES PARA JUNTAR Y SEPARAR MESAS ====================

/**
 * Juntar varias mesas en un grupo
 * La mesa de menor número se convierte en la principal
 * 
 * @param {Array} mesasIds - Array de ObjectId de las mesas a juntar
 * @param {ObjectId} mozoId - ID del mozo que ejecuta la acción
 * @param {String} motivo - Motivo opcional de la unión
 * @returns {Object} - { mesaPrincipal, mesasSecundarias, todaslasmesas }
 */
const juntarMesas = async (mesasIds, mozoId, motivo = null) => {
    const Pedido = require('../database/models/pedido.model');
    
    try {
        // ========== VALIDACIONES ==========
        
        // Validar cantidad de mesas
        if (!mesasIds || !Array.isArray(mesasIds) || mesasIds.length < 2) {
            throw new Error('Se necesitan al menos 2 mesas para juntar');
        }
        
        if (mesasIds.length > 6) {
            throw new Error('No se pueden juntar más de 6 mesas a la vez');
        }
        
        // Obtener todas las mesas
        const mesasEncontradas = await mesas.find({
            _id: { $in: mesasIds.map(id => new mongoose.Types.ObjectId(id)) }
        }).populate('area');
        
        if (mesasEncontradas.length !== mesasIds.length) {
            throw new Error('Una o más mesas no fueron encontradas');
        }
        
        // Verificar que todas están activas
        const mesasInactivas = mesasEncontradas.filter(m => !m.isActive);
        if (mesasInactivas.length > 0) {
            throw new Error(`Las mesas ${mesasInactivas.map(m => m.nummesa).join(', ')} están inactivas`);
        }
        
        // Verificar que todas son de la misma área
        const areas = [...new Set(mesasEncontradas.map(m => m.area?._id?.toString() || m.area?.toString()))];
        if (areas.length > 1) {
            throw new Error('Solo se pueden juntar mesas de la misma área');
        }
        
        // Verificar estados permitidos (solo libre o esperando)
        const estadosInvalidos = mesasEncontradas.filter(m => 
            !['libre', 'esperando'].includes(m.estado)
        );
        if (estadosInvalidos.length > 0) {
            throw new Error(`Las mesas ${estadosInvalidos.map(m => m.nummesa).join(', ')} no están en estado libre o esperando`);
        }
        
        // Verificar que ninguna está ya unida a otro grupo
        const mesasYaUnidas = mesasEncontradas.filter(m => !m.esMesaPrincipal);
        if (mesasYaUnidas.length > 0) {
            throw new Error(`Las mesas ${mesasYaUnidas.map(m => m.nummesa).join(', ')} ya están unidas a otro grupo`);
        }
        
        // Verificar que ninguna es principal de otro grupo
        const mesasConGrupo = mesasEncontradas.filter(m => m.mesasUnidas && m.mesasUnidas.length > 0);
        if (mesasConGrupo.length > 0) {
            throw new Error(`Las mesas ${mesasConGrupo.map(m => m.nummesa).join(', ')} ya tienen mesas unidas`);
        }
        
        // Verificar que no hay Pedidos abiertos
        for (const mesa of mesasEncontradas) {
            const pedidoAbierto = await Pedido.findOne({
                mesa: mesa._id,
                estado: 'abierto',
                isActive: true
            });
            if (pedidoAbierto) {
                throw new Error(`La mesa ${mesa.nummesa} tiene un pedido abierto. Ciérralo antes de juntar las mesas`);
            }
        }
        
        // ========== DETERMINAR MESA PRINCIPAL ==========
        
        // Ordenar por número de mesa y tomar la menor como principal
        const mesasOrdenadas = mesasEncontradas.sort((a, b) => a.nummesa - b.nummesa);
        const mesaPrincipal = mesasOrdenadas[0];
        const mesasSecundarias = mesasOrdenadas.slice(1);
        
        console.log(`🔗 Juntando mesas: Principal=${mesaPrincipal.nummesa}, Secundarias=${mesasSecundarias.map(m => m.nummesa).join(', ')}`);
        
        // ========== ACTUALIZAR MESAS SECUNDARIAS ==========
        
        const fechaUnion = new Date();
        const mesasSecundariasIds = mesasSecundarias.map(m => m._id);
        
        for (const mesaSecundaria of mesasSecundarias) {
            await mesas.findByIdAndUpdate(mesaSecundaria._id, {
                esMesaPrincipal: false,
                mesaPrincipalId: mesaPrincipal._id,
                mesasUnidas: [],
                estado: 'ocupada', // Estado especial para mesas unidas
                fechaUnion: fechaUnion,
                unidoPor: mozoId,
                motivoUnion: motivo
            });
        }
        
        // ========== GENERAR NOMBRE COMBINADO ==========
        
        // Crear el nombre combinado: "Mesa 1 y Mesa 2" o "Mesa 1, 2 y 3"
        const numerosMesas = mesasOrdenadas.map(m => m.nummesa);
        let nombreCombinado = '';
        if (numerosMesas.length === 2) {
            nombreCombinado = `Mesa ${numerosMesas[0]} y ${numerosMesas[1]}`;
        } else {
            const ultimo = numerosMesas.pop();
            nombreCombinado = `Mesa ${numerosMesas.join(', ')} y ${ultimo}`;
        }
        
        // ========== ACTUALIZAR MESA PRINCIPAL ==========
        
        await mesas.findByIdAndUpdate(mesaPrincipal._id, {
            esMesaPrincipal: true,
            mesasUnidas: mesasSecundariasIds,
            nombreCombinado: nombreCombinado, // Nuevo campo para mostrar nombre combinado
            estado: 'libre', // Estado libre para que pueda recibir comandas
            fechaUnion: fechaUnion,
            unidoPor: mozoId,
            motivoUnion: motivo
        });
        
        // ========== LOG Y RESPUESTA ==========
        
        console.log(`✅ Mesas juntadas exitosamente: Mesa ${mesaPrincipal.nummesa} como principal`);
        
        // Auditoría
        console.log(`📝 AUDITORÍA - Mesas juntadas:`, {
            timestamp: new Date().toISOString(),
            mesaPrincipal: mesaPrincipal.nummesa,
            mesasSecundarias: mesasSecundarias.map(m => m.nummesa),
            mozoId: mozoId,
            motivo: motivo
        });
        
        const todaslasmesas = await listarMesas();
        await syncJsonFile('mesas.json', todaslasmesas);
        
        // Obtener las mesas actualizadas
        const mesaPrincipalActualizada = await mesas.findById(mesaPrincipal._id).populate('area').populate('mesasUnidas');
        const mesasSecundariasActualizadas = await mesas.find({
            _id: { $in: mesasSecundariasIds }
        }).populate('area');
        
        return {
            success: true,
            message: `Mesas juntadas: Mesa ${mesaPrincipal.nummesa} como principal`,
            mesaPrincipal: mesaPrincipalActualizada,
            mesasSecundarias: mesasSecundariasActualizadas,
            todaslasmesas
        };
        
    } catch (error) {
        console.error('❌ Error al juntar mesas:', error.message);
        throw error;
    }
};

/**
 * Separar mesas previamente juntadas
 * Solo se puede separar desde la mesa principal
 * 
 * @param {ObjectId} mesaPrincipalId - ID de la mesa principal del grupo
 * @param {ObjectId} mozoId - ID del mozo que ejecuta la acción
 * @param {String} motivo - Motivo opcional de la separación
 * @returns {Object} - { mesaPrincipal, mesasSecundarias, todaslasmesas }
 */
const separarMesas = async (mesaPrincipalId, mozoId, motivo = null) => {
    try {
        // ========== VALIDACIONES ==========
        
        // Buscar la mesa principal
        let mesaPrincipal = await mesas.findById(mesaPrincipalId);
        if (!mesaPrincipal) {
            mesaPrincipal = await mesas.findOne({ mesasId: parseInt(mesaPrincipalId) });
        }
        
        if (!mesaPrincipal) {
            throw new Error('Mesa no encontrada');
        }
        
        // Verificar que es mesa principal con mesas unidas
        if (!mesaPrincipal.esMesaPrincipal) {
            throw new Error('Esta mesa no es la principal de un grupo. Use la mesa principal para separar');
        }
        
        if (!mesaPrincipal.mesasUnidas || mesaPrincipal.mesasUnidas.length === 0) {
            throw new Error('Esta mesa no tiene mesas unidas para separar');
        }
        
        // ========== OBTENER MESAS SECUNDARIAS ==========
        
        const mesasSecundariasIds = mesaPrincipal.mesasUnidas;
        const mesasSecundarias = await mesas.find({
            _id: { $in: mesasSecundariasIds }
        }).populate('area');
        
        console.log(`🔗 Separando mesas: Principal=${mesaPrincipal.nummesa}, Secundarias=${mesasSecundarias.map(m => m.nummesa).join(', ')}`);
        
        // ========== DETERMINAR ESTADOS POST-SEPARACIÓN ==========
        
        // Si la mesa principal está en 'esperando' o 'libre', todas quedan libres
        // Si está en 'pedido', 'preparado', etc., la principal mantiene su estado y las secundarias quedan libres
        const estadoPrincipal = mesaPrincipal.estado;
        const principalQuedaLibre = ['esperando', 'libre'].includes(estadoPrincipal);
        
        // ========== ACTUALIZAR MESAS SECUNDARIAS ==========
        
        for (const mesaSecundaria of mesasSecundarias) {
            await mesas.findByIdAndUpdate(mesaSecundaria._id, {
                esMesaPrincipal: true,
                mesaPrincipalId: null,
                mesasUnidas: [],
                estado: 'libre',
                fechaUnion: null,
                unidoPor: null,
                motivoUnion: null
            });
        }
        
        // ========== ACTUALIZAR MESA PRINCIPAL ==========
        
        const nuevoEstadoPrincipal = principalQuedaLibre ? 'libre' : estadoPrincipal;
        
        await mesas.findByIdAndUpdate(mesaPrincipal._id, {
            mesasUnidas: [],
            nombreCombinado: null, // Limpiar nombre combinado
            estado: nuevoEstadoPrincipal,
            fechaUnion: null,
            unidoPor: null,
            motivoUnion: motivo ? `Separación: ${motivo}` : null
        });
        
        // ========== LOG Y RESPUESTA ==========
        
        console.log(`✅ Mesas separadas exitosamente`);
        
        // Auditoría
        console.log(`📝 AUDITORÍA - Mesas separadas:`, {
            timestamp: new Date().toISOString(),
            mesaPrincipal: mesaPrincipal.nummesa,
            mesasSecundarias: mesasSecundarias.map(m => m.nummesa),
            mozoId: mozoId,
            motivo: motivo
        });
        
        const todaslasmesas = await listarMesas();
        await syncJsonFile('mesas.json', todaslasmesas);
        
        // Obtener las mesas actualizadas
        const mesaPrincipalActualizada = await mesas.findById(mesaPrincipal._id).populate('area');
        const mesasSecundariasActualizadas = await mesas.find({
            _id: { $in: mesasSecundariasIds }
        }).populate('area');
        
        return {
            success: true,
            message: `Mesas separadas. Mesa ${mesaPrincipal.nummesa} ${principalQuedaLibre ? 'quedó libre' : 'mantiene su estado'}`,
            mesaPrincipal: mesaPrincipalActualizada,
            mesasSecundarias: mesasSecundariasActualizadas,
            todaslasmesas
        };
        
    } catch (error) {
        console.error('❌ Error al separar mesas:', error.message);
        throw error;
    }
};

/**
 * Obtener mesas agrupadas (para UI)
 * Retorna información de qué mesas están juntas
 * 
 * @returns {Array} - Array de grupos de mesas
 */
const obtenerMesasAgrupadas = async () => {
    try {
        // Buscar todas las mesas que son principales con mesas unidas
        const mesasPrincipales = await mesas.find({
            esMesaPrincipal: true,
            mesasUnidas: { $exists: true, $ne: [] }
        })
        .populate('area')
        .populate('mesasUnidas');
        
        const grupos = [];
        
        for (const principal of mesasPrincipales) {
            const mesasSecundarias = await mesas.find({
                mesaPrincipalId: principal._id
            }).populate('area');
            
            grupos.push({
                mesaPrincipal: principal,
                mesasSecundarias: mesasSecundarias,
                totalMesas: 1 + mesasSecundarias.length,
                fechaUnion: principal.fechaUnion,
                unidoPor: principal.unidoPor
            });
        }
        
        return grupos;
        
    } catch (error) {
        console.error('❌ Error al obtener mesas agrupadas:', error.message);
        throw error;
    }
};

/**
 * Obtener una mesa con su grupo (si pertenece a uno)
 * 
 * @param {ObjectId} mesaId - ID de la mesa
 * @returns {Object} - Mesa con información de grupo
 */
const obtenerMesaConGrupo = async (mesaId) => {
    try {
        let mesa = await mesas.findById(mesaId).populate('area');
        if (!mesa) {
            mesa = await mesas.findOne({ mesasId: parseInt(mesaId) }).populate('area');
        }
        
        if (!mesa) {
            throw new Error('Mesa no encontrada');
        }
        
        const resultado = {
            mesa,
            esGrupo: false,
            mesaPrincipal: null,
            mesasSecundarias: [],
            todasLasMesasDelGrupo: []
        };
        
        // Si es mesa principal con mesas unidas
        if (mesa.esMesaPrincipal && mesa.mesasUnidas && mesa.mesasUnidas.length > 0) {
            resultado.esGrupo = true;
            resultado.mesaPrincipal = mesa;
            resultado.mesasSecundarias = await mesas.find({
                mesaPrincipalId: mesa._id
            }).populate('area').lean();
            resultado.todasLasMesasDelGrupo = [mesa.toObject(), ...resultado.mesasSecundarias];
        }
        // Si es mesa secundaria
        else if (!mesa.esMesaPrincipal && mesa.mesaPrincipalId) {
            resultado.esGrupo = true;
            resultado.mesaPrincipal = await mesas.findById(mesa.mesaPrincipalId).populate('area').lean();
            resultado.mesasSecundarias = await mesas.find({
                mesaPrincipalId: mesa.mesaPrincipalId,
                _id: { $ne: mesa._id }
            }).populate('area').lean();
            resultado.todasLasMesasDelGrupo = [resultado.mesaPrincipal, mesa.toObject(), ...resultado.mesasSecundarias];
        }
        
        return resultado;
        
    } catch (error) {
        console.error('❌ Error al obtener mesa con grupo:', error.message);
        throw error;
    }
};

// ==================== FIN FUNCIONES JUNTAR/SEPARAR ====================

module.exports = {
    listarMesas,
    crearMesa,
    obtenerMesaPorId,
    actualizarMesa,
    borrarMesa,
    actualizarEstadoMesa,
    liberarTodasLasMesas,
    importarMesasDesdeJSON,
    juntarMesas,
    separarMesas,
    obtenerMesasAgrupadas,
    obtenerMesaConGrupo
};
