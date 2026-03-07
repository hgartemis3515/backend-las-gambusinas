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

module.exports = {
    listarMesas,
    crearMesa,
    obtenerMesaPorId,
    actualizarMesa,
    borrarMesa,
    actualizarEstadoMesa,
    liberarTodasLasMesas,
    importarMesasDesdeJSON
};
