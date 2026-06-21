const clienteModel = require("../database/models/cliente.model");
const { nombreClienteAnonimo } = require('../constants/clienteDefaults');
const { syncJsonFile } = require('../utils/jsonSync');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const DATA_DIR = path.join(__dirname, '../../data');

/**
 * Importa clientes desde data/clientes.json.
 */
const importarClientesDesdeJSON = async () => {
    try {
        const filePath = path.join(DATA_DIR, 'clientes.json');
        if (!fs.existsSync(filePath)) {
            console.log('⚠️ Archivo clientes.json no encontrado');
            return { imported: 0, updated: 0, errors: 0 };
        }
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!Array.isArray(jsonData)) {
            console.log('⚠️ clientes.json no contiene un array válido');
            return { imported: 0, updated: 0, errors: 0 };
        }
        let imported = 0, errors = 0;
        for (const item of jsonData) {
            try {
                const existente = await clienteModel.findOne({ clienteId: item.clienteId });
                if (existente) continue;
                const doc = {
                    _id: item._id ? new mongoose.Types.ObjectId(item._id) : undefined,
                    clienteId: item.clienteId,
                    nombre: item.nombre ?? null,
                    telefono: item.telefono ?? null,
                    email: item.email ?? null,
                    tipo: item.tipo || 'invitado',
                    numeroInvitado: item.numeroInvitado ?? null,
                    totalConsumido: item.totalConsumido ?? 0,
                    visitas: item.visitas ?? 0,
                    comandas: Array.isArray(item.comandas) ? item.comandas.map(id => new mongoose.Types.ObjectId(id)) : [],
                    bouchers: Array.isArray(item.bouchers) ? item.bouchers.map(id => new mongoose.Types.ObjectId(id)) : []
                };
                if (item.dni) doc.dni = item.dni;
                if (item.createdAt) doc.createdAt = new Date(item.createdAt);
                if (item.updatedAt) doc.updatedAt = new Date(item.updatedAt);
                await clienteModel.create(doc);
                imported++;
            } catch (err) {
                errors++;
                console.error(`❌ Error al importar cliente ${item.nombre || item.clienteId}:`, err.message);
            }
        }
        if (imported > 0 || errors > 0) {
            console.log(`✅ Clientes: ${imported} importados${errors ? `, ${errors} errores` : ''}`);
        }
        return { imported, updated: 0, errors };
    } catch (error) {
        console.error('❌ Error al importar clientes:', error.message);
        return { imported: 0, updated: 0, errors: 1 };
    }
};

/**
 * Genera un nuevo cliente tipo "Cliente-#" con número secuencial único
 * @returns {Promise<Object>} Cliente invitado creado
 */
const generarClienteInvitado = async () => {
    try {
        // Buscar el último cliente invitado ordenado por numeroInvitado descendente
        const ultimoInvitado = await clienteModel
            .findOne({ tipo: 'invitado' })
            .sort({ numeroInvitado: -1 })
            .select('numeroInvitado');

        // Calcular el siguiente número
        let siguienteNumero = 1;
        if (ultimoInvitado && ultimoInvitado.numeroInvitado) {
            siguienteNumero = ultimoInvitado.numeroInvitado + 1;
        }

        console.log(`🆕 Generando cliente ${nombreClienteAnonimo(siguienteNumero)}`);

        // Crear nuevo cliente invitado (sin campo dni — varios invitados permitidos)
        const nuevoInvitado = await clienteModel.create({
            tipo: 'invitado',
            numeroInvitado: siguienteNumero,
            nombre: nombreClienteAnonimo(siguienteNumero),
            totalConsumido: 0,
            visitas: 0
        });

        console.log(`✅ Cliente ${nombreClienteAnonimo(siguienteNumero)} creado con ID: ${nuevoInvitado._id}`);

        // Sincronizar con archivo JSON
        try {
            const todosLosClientes = await clienteModel.find({});
            await syncJsonFile('clientes.json', todosLosClientes);
        } catch (error) {
            console.error('⚠️ Error al sincronizar clientes.json:', error);
        }

        return nuevoInvitado;
    } catch (error) {
        if (error.code === 11000 && String(error.message || '').includes('dni')) {
            try {
                const collection = clienteModel.collection;
                await collection.updateMany(
                    { $or: [{ dni: null }, { dni: '' }] },
                    { $unset: { dni: '' } }
                );
                const indexes = await collection.indexes();
                const dniIndex = indexes.find((idx) => idx?.key?.dni === 1);
                if (dniIndex && !dniIndex.sparse) {
                    await collection.dropIndex(dniIndex.name);
                }
                await clienteModel.syncIndexes();
                return generarClienteInvitado();
            } catch (retryErr) {
                console.error('❌ Reintento tras fix índice dni falló:', retryErr.message);
            }
        }
        console.error("❌ Error al generar cliente invitado:", error);
        throw error;
    }
};

/**
 * Crea un cliente registrado
 */
const crearCliente = async (data) => {
    try {
        // Si no hay datos o el body está vacío, generar invitado
        if (!data || (!data.nombre && !data.dni && !data.telefono)) {
            return await generarClienteInvitado();
        }

        // Validar que si es registrado, tenga al menos nombre
        if (data.tipo !== 'invitado' && !data.nombre) {
            throw new Error('El nombre es requerido para clientes registrados');
        }

        // Si hay DNI, verificar que no exista
        if (data.dni) {
            const clienteExistente = await clienteModel.findOne({ dni: data.dni });
            if (clienteExistente) {
                // Si existe, retornar el existente
                console.log(`✅ Cliente con DNI ${data.dni} ya existe, retornando existente`);
                return clienteExistente;
            }
        }

        // Crear nuevo cliente registrado
        const payload = {
            tipo: data.tipo || 'registrado',
            nombre: data.nombre,
            telefono: data.telefono || null,
            email: data.email || null,
            totalConsumido: 0,
            visitas: 0
        };
        if (data.dni) payload.dni = String(data.dni).trim();

        const nuevoCliente = await clienteModel.create(payload);

        console.log(`✅ Cliente registrado creado: ${nuevoCliente.nombre} (ID: ${nuevoCliente._id})`);

        // Sincronizar con archivo JSON
        try {
            const todosLosClientes = await clienteModel.find({});
            await syncJsonFile('clientes.json', todosLosClientes);
        } catch (error) {
            console.error('⚠️ Error al sincronizar clientes.json:', error);
        }

        return nuevoCliente;
    } catch (error) {
        console.error("❌ Error al crear cliente:", error);
        throw error;
    }
};

/**
 * Lista todos los clientes
 */
const listarClientes = async (filtros = {}) => {
    try {
        const query = {};

        // Filtro por tipo
        if (filtros.tipo) {
            query.tipo = filtros.tipo;
        }

        // Filtro por nombre (búsqueda parcial)
        if (filtros.nombre) {
            query.nombre = { $regex: filtros.nombre, $options: 'i' };
        }

        // Filtro por DNI
        if (filtros.dni) {
            query.dni = filtros.dni;
        }

        // Filtro por rango de fechas
        if (filtros.fechaDesde || filtros.fechaHasta) {
            query.createdAt = {};
            if (filtros.fechaDesde) {
                query.createdAt.$gte = new Date(filtros.fechaDesde);
            }
            if (filtros.fechaHasta) {
                query.createdAt.$lte = new Date(filtros.fechaHasta);
            }
        }

        const clientes = await clienteModel
            .find(query)
            .populate({
                path: 'comandas',
                select: 'comandaNumber createdAt total'
            })
            .populate({
                path: 'bouchers',
                select: 'boucherNumber fechaPago total'
            })
            .sort({ createdAt: -1 });

        // Calcular totalConsumido desde bouchers si está en 0 o no existe
        const clientesConTotal = clientes.map(cliente => {
            const clienteObj = cliente.toObject ? cliente.toObject() : cliente;
            
            // Si totalConsumido es 0 o no existe, calcular desde bouchers
            if ((!clienteObj.totalConsumido || clienteObj.totalConsumido === 0) && clienteObj.bouchers && clienteObj.bouchers.length > 0) {
                clienteObj.totalConsumido = clienteObj.bouchers.reduce((sum, boucher) => {
                    return sum + (boucher.total || 0);
                }, 0);
            }
            
            return clienteObj;
        });

        return clientesConTotal;
    } catch (error) {
        console.error("❌ Error al listar clientes:", error);
        throw error;
    }
};

/**
 * Obtiene un cliente por ID
 */
const obtenerClientePorId = async (id) => {
    try {
        const cliente = await clienteModel
            .findById(id)
            .populate({
                path: 'comandas',
                populate: {
                    path: 'platos.plato',
                    model: 'platos'
                }
            })
            .populate({
                path: 'bouchers',
                populate: [
                    {
                        path: 'mesa',
                        select: 'nummesa'
                    },
                    {
                        path: 'mozo',
                        select: 'name'
                    },
                    {
                        path: 'comandas',
                        select: 'comandaNumber'
                    },
                    {
                        path: 'platos.plato',
                        model: 'platos',
                        select: 'nombre precio'
                    }
                ]
            });

        if (!cliente) {
            throw new Error('Cliente no encontrado');
        }

        return cliente;
    } catch (error) {
        console.error("❌ Error al obtener cliente:", error);
        throw error;
    }
};

/**
 * Busca un cliente por DNI
 */
const buscarClientePorDni = async (dni) => {
    try {
        const cliente = await clienteModel.findOne({ dni: dni });
        return cliente; // Retorna null si no existe
    } catch (error) {
        console.error("❌ Error al buscar cliente por DNI:", error);
        throw error;
    }
};

/**
 * Actualiza un cliente
 */
const actualizarCliente = async (id, data) => {
    try {
        const cliente = await clienteModel.findById(id);
        if (!cliente) {
            throw new Error('Cliente no encontrado');
        }

        // No permitir cambiar tipo de invitado a registrado directamente
        // Se debe hacer mediante conversión explícita
        if (cliente.tipo === 'invitado' && data.tipo === 'registrado') {
            // Conversión de invitado a registrado
            if (!data.nombre) {
                throw new Error('El nombre es requerido para convertir a cliente registrado');
            }
            cliente.tipo = 'registrado';
            cliente.nombre = data.nombre;
            cliente.dni = data.dni || cliente.dni;
            cliente.telefono = data.telefono || cliente.telefono;
            cliente.email = data.email || cliente.email;
            cliente.numeroInvitado = null; // Limpiar número de invitado
        } else {
            // Actualización normal
            if (data.nombre !== undefined) cliente.nombre = data.nombre;
            if (data.telefono !== undefined) cliente.telefono = data.telefono;
            if (data.email !== undefined) cliente.email = data.email;
            if (data.dni !== undefined && cliente.tipo === 'registrado') {
                // Verificar que el DNI no esté en uso por otro cliente
                if (data.dni) {
                    const clienteConDni = await clienteModel.findOne({ 
                        dni: data.dni, 
                        _id: { $ne: id } 
                    });
                    if (clienteConDni) {
                        throw new Error('El DNI ya está registrado por otro cliente');
                    }
                }
                cliente.dni = data.dni;
            }
        }

        await cliente.save();

        // Sincronizar con archivo JSON
        try {
            const todosLosClientes = await clienteModel.find({});
            await syncJsonFile('clientes.json', todosLosClientes);
        } catch (error) {
            console.error('⚠️ Error al sincronizar clientes.json:', error);
        }

        return cliente;
    } catch (error) {
        console.error("❌ Error al actualizar cliente:", error);
        throw error;
    }
};

/**
 * Asocia un cliente a una comanda y actualiza totales
 */
const asociarClienteAComanda = async (clienteId, comandaId, totalComanda) => {
    try {
        const cliente = await clienteModel.findById(clienteId);
        if (!cliente) {
            throw new Error('Cliente no encontrado');
        }

        // Agregar comanda si no está ya asociada
        if (!cliente.comandas.includes(comandaId)) {
            cliente.comandas.push(comandaId);
        }

        // Actualizar totales
        cliente.totalConsumido = (cliente.totalConsumido || 0) + totalComanda;
        cliente.visitas = (cliente.visitas || 0) + 1;

        await cliente.save();

        // Sincronizar con archivo JSON
        try {
            const todosLosClientes = await clienteModel.find({});
            await syncJsonFile('clientes.json', todosLosClientes);
        } catch (error) {
            console.error('⚠️ Error al sincronizar clientes.json:', error);
        }

        return cliente;
    } catch (error) {
        console.error("❌ Error al asociar cliente a comanda:", error);
        throw error;
    }
};

/**
 * Asocia un boucher a un cliente
 */
const asociarBoucherACliente = async (clienteId, boucherId) => {
    try {
        const cliente = await clienteModel.findById(clienteId);
        if (!cliente) {
            throw new Error('Cliente no encontrado');
        }

        // Agregar boucher si no está ya asociado
        if (!cliente.bouchers.includes(boucherId)) {
            cliente.bouchers.push(boucherId);
        }

        await cliente.save();

        // Sincronizar con archivo JSON
        try {
            const todosLosClientes = await clienteModel.find({});
            await syncJsonFile('clientes.json', todosLosClientes);
        } catch (error) {
            console.error('⚠️ Error al sincronizar clientes.json:', error);
        }

        return cliente;
    } catch (error) {
        console.error("❌ Error al asociar boucher a cliente:", error);
        throw error;
    }
};

module.exports = {
    generarClienteInvitado,
    crearCliente,
    listarClientes,
    obtenerClientePorId,
    buscarClientePorDni,
    actualizarCliente,
    asociarClienteAComanda,
    asociarBoucherACliente,
    importarClientesDesdeJSON
};

