const mesas = require('../database/models/mesas.model');
const { syncJsonFile } = require('../utils/jsonSync');

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
    const transicionesPermitidas = {
        'libre': ['esperando', 'reservado'],
        'esperando': ['pedido'],
        'pedido': ['preparado'],
        'preparado': ['pagado'],
        'pagado': ['libre'],
        'reservado': ['libre'] // Solo admin puede liberar reservas
    };

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


const borrarMesa = async (id) => {
    // Usar _id (ObjectId de MongoDB) para eliminar
    await mesas.findByIdAndDelete(id);
    const todaslasmesas = await listarMesas();
    // Sincronizar con el archivo JSON
    await syncJsonFile('mesas.json', todaslasmesas);
    return todaslasmesas;
}

module.exports = {
    listarMesas,
    crearMesa,
    obtenerMesaPorId,
    actualizarMesa,
    borrarMesa,
    actualizarEstadoMesa
};
