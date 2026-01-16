const express = require('express');
const router = express.Router();

const {
    generarClienteInvitado,
    crearCliente,
    listarClientes,
    obtenerClientePorId,
    buscarClientePorDni,
    actualizarCliente,
    asociarClienteAComanda
} = require('../repository/clientes.repository');

// POST /api/clientes - Crear cliente (registrado o invitado automático)
router.post('/clientes', async (req, res) => {
    try {
        const cliente = await crearCliente(req.body);
        res.json(cliente);
        console.log('✅ Cliente creado exitosamente');
    } catch (error) {
        console.error(error.message);
        const statusCode = error.statusCode || 400;
        res.status(statusCode).json({ message: error.message || 'Error al crear el cliente' });
    }
});

// GET /api/clientes - Listar todos los clientes (con filtros opcionales)
router.get('/clientes', async (req, res) => {
    try {
        const filtros = {
            tipo: req.query.tipo,
            nombre: req.query.nombre,
            dni: req.query.dni,
            fechaDesde: req.query.fechaDesde,
            fechaHasta: req.query.fechaHasta
        };

        const clientes = await listarClientes(filtros);
        res.json(clientes);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Error al obtener los clientes' });
    }
});

// GET /api/clientes/:id - Obtener cliente por ID
router.get('/clientes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const cliente = await obtenerClientePorId(id);
        res.json(cliente);
    } catch (error) {
        console.error(error.message);
        if (error.message === 'Cliente no encontrado') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Error al obtener el cliente' });
        }
    }
});

// GET /api/clientes/dni/:dni - Buscar cliente por DNI
router.get('/clientes/dni/:dni', async (req, res) => {
    const { dni } = req.params;
    try {
        const cliente = await buscarClientePorDni(dni);
        res.json(cliente); // Retorna null si no existe
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Error al buscar el cliente' });
    }
});

// GET /api/clientes/tipo/invitado - Listar solo clientes invitados
router.get('/clientes/tipo/invitado', async (req, res) => {
    try {
        const clientes = await listarClientes({ tipo: 'invitado' });
        res.json(clientes);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Error al obtener los clientes invitados' });
    }
});

// PUT /api/clientes/:id - Actualizar cliente
router.put('/clientes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const cliente = await actualizarCliente(id, req.body);
        res.json(cliente);
        console.log('✅ Cliente actualizado exitosamente');
    } catch (error) {
        console.error(error.message);
        const statusCode = error.statusCode || 400;
        res.status(statusCode).json({ message: error.message || 'Error al actualizar el cliente' });
    }
});

// POST /api/comandas/:id/cliente - Asociar cliente a comanda
router.post('/comandas/:id/cliente', async (req, res) => {
    const { id } = req.params;
    const { clienteId, totalComanda } = req.body;
    
    try {
        if (!clienteId) {
            return res.status(400).json({ message: 'clienteId es requerido' });
        }
        if (!totalComanda && totalComanda !== 0) {
            return res.status(400).json({ message: 'totalComanda es requerido' });
        }

        const cliente = await asociarClienteAComanda(clienteId, id, totalComanda);
        res.json({ message: 'Cliente asociado a comanda exitosamente', cliente });
    } catch (error) {
        console.error(error.message);
        const statusCode = error.statusCode || 400;
        res.status(statusCode).json({ message: error.message || 'Error al asociar cliente a comanda' });
    }
});

module.exports = router;

