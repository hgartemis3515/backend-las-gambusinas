const express = require('express');
const router = express.Router();

const { 
    listarBouchers, 
    listarBouchersPorFecha, 
    obtenerBoucherPorId, 
    crearBoucher, 
    eliminarBoucher,
    obtenerBoucherPorMesa
} = require('../repository/boucher.repository');

const { validarComandasParaPagar } = require('../repository/comanda.repository');
const comandaModel = require('../database/models/comanda.model');

// Obtener todos los bouchers
router.get('/boucher', async (req, res) => {
    try {
        const data = await listarBouchers();
        res.json(data);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Error al obtener los bouchers' });
    }
});

// Obtener bouchers por fecha
router.get('/boucher/fecha/:fecha', async (req, res) => {
    const { fecha } = req.params;
    try {
        const data = await listarBouchersPorFecha(fecha);
        res.json(data);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Error al obtener los bouchers por fecha' });
    }
});

// Obtener un boucher por ID
router.get('/boucher/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const boucher = await obtenerBoucherPorId(id);
        res.json(boucher);
    } catch (error) {
        console.error(error.message);
        if (error.message === 'Boucher no encontrado') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Error al obtener el boucher' });
        }
    }
});

// Crear un nuevo boucher
router.post('/boucher', async (req, res) => {
    try {
        const { mesaId, mozoId, clienteId, comandasIds, observaciones } = req.body;
        
        // Validar que se proporcionen los datos requeridos
        if (!mesaId || !mozoId || !comandasIds || !Array.isArray(comandasIds) || comandasIds.length === 0) {
            return res.status(400).json({ 
                message: 'Datos incompletos: se requiere mesaId, mozoId y comandasIds (array no vacío)' 
            });
        }
        
        // VALIDAR que comandasIds pertenecen a mesaId y NO están pagadas
        const comandasValidas = await validarComandasParaPagar(mesaId, comandasIds);
        
        // Extraer platos SOLO de las comandas validadas
        const platosParaBoucher = [];
        comandasValidas.forEach((comanda) => {
            if (comanda.platos && Array.isArray(comanda.platos)) {
                comanda.platos.forEach((platoItem, index) => {
                    // Solo incluir platos no eliminados
                    if (!platoItem.eliminado) {
                        const plato = platoItem.plato || platoItem;
                        const cantidad = comanda.cantidades?.[index] || 1;
                        const precio = plato.precio || 0;
                        const subtotal = precio * cantidad;
                        
                        platosParaBoucher.push({
                            plato: plato._id || plato,
                            platoId: platoItem.platoId || plato.id || null,
                            nombre: plato.nombre || "Plato",
                            precio: precio,
                            cantidad: cantidad,
                            subtotal: subtotal,
                            comandaNumber: comanda.comandaNumber || null,
                            complementosSeleccionados: platoItem.complementosSeleccionados || []
                        });
                    }
                });
            }
        });
        
        if (platosParaBoucher.length === 0) {
            return res.status(400).json({ 
                message: 'No hay platos válidos para crear el boucher' 
            });
        }
        
        // Calcular totales
        const subtotal = platosParaBoucher.reduce((sum, p) => sum + (p.subtotal || 0), 0);
        const igv = subtotal * 0.18;
        const total = subtotal + igv;
        
        // Obtener información de la mesa y mozo desde la primera comanda
        const primeraComanda = comandasValidas[0];
        const mesa = primeraComanda.mesas;
        const mozo = primeraComanda.mozos;
        
        // Preparar datos del boucher
        const boucherData = {
            mesa: mesaId,
            numMesa: mesa?.nummesa || null,
            mozo: mozoId,
            nombreMozo: mozo?.name || "N/A",
            cliente: clienteId || null,
            comandas: comandasIds,
            comandasNumbers: comandasValidas.map(c => c.comandaNumber).filter(n => n != null),
            platos: platosParaBoucher,
            subtotal: subtotal,
            igv: igv,
            total: total,
            observaciones: observaciones || '',
            fechaPago: new Date(),
            fechaPagoString: require('moment-timezone')().tz("America/Lima").format("DD/MM/YYYY HH:mm:ss")
        };
        
        // Crear boucher
        const boucherCreado = await crearBoucher(boucherData);
        
        // Marcar comandas como pagadas
        await Promise.all(comandasIds.map(async (comandaId) => {
            try {
                await comandaModel.findByIdAndUpdate(comandaId, {
                    status: 'pagado',
                    cliente: clienteId || null
                });
            } catch (error) {
                console.error(`⚠️ Error marcando comanda ${comandaId} como pagada:`, error);
            }
        }));
        
        res.json(boucherCreado);
        console.log('✅ Boucher creado exitosamente con', comandasIds.length, 'comanda(s)');
    } catch (error) {
        console.error(error.message);
        const statusCode = error.statusCode || 400;
        res.status(statusCode).json({ message: error.message || 'Error al crear el boucher' });
    }
});

// Eliminar un boucher (soft delete)
router.delete('/boucher/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const boucher = await eliminarBoucher(id);
        res.json({ message: 'Boucher eliminado exitosamente', boucher });
    } catch (error) {
        console.error(error.message);
        if (error.message === 'Boucher no encontrado') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Error al eliminar el boucher' });
        }
    }
});

/**
 * Obtener el último boucher pagado de una mesa
 * GET /boucher/by-mesa/:mesaId
 */
router.get('/boucher/by-mesa/:mesaId', async (req, res) => {
    const { mesaId } = req.params;
    try {
        console.log(`📥 [GET /boucher/by-mesa/:mesaId] Solicitud para mesa: ${mesaId}`);
        const boucher = await obtenerBoucherPorMesa(mesaId);
        
        if (!boucher) {
            console.log(`❌ [GET /boucher/by-mesa/:mesaId] No se encontró boucher para mesa ${mesaId}`);
            return res.status(404).json({ 
                message: 'No hay boucher pagado para esta mesa' 
            });
        }
        
        console.log(`✅ [GET /boucher/by-mesa/:mesaId] Boucher encontrado y retornado: ${boucher._id}`);
        res.json(boucher);
    } catch (error) {
        console.error('❌ [GET /boucher/by-mesa/:mesaId] Error al obtener boucher por mesa:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            message: 'Error al obtener el boucher de la mesa',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * ✅ NUEVO ENDPOINT: Obtener el último boucher pagado de una mesa (alias)
 * GET /boucher-ultimo/:mesaId
 * Útil para imprimir boucher desde InicioScreen
 */
router.get('/boucher-ultimo/:mesaId', async (req, res) => {
    const { mesaId } = req.params;
    try {
        console.log(`📥 [GET /boucher-ultimo/:mesaId] Solicitud para mesa: ${mesaId}`);
        const boucher = await obtenerBoucherPorMesa(mesaId);
        
        if (!boucher) {
            console.log(`❌ [GET /boucher-ultimo/:mesaId] No se encontró boucher para mesa ${mesaId}`);
            return res.status(404).json({ 
                message: 'No hay boucher pagado para esta mesa' 
            });
        }
        
        console.log(`✅ [GET /boucher-ultimo/:mesaId] Boucher encontrado y retornado: ${boucher._id}`);
        res.json(boucher);
    } catch (error) {
        console.error('❌ [GET /boucher-ultimo/:mesaId] Error al obtener boucher por mesa:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            message: 'Error al obtener el boucher de la mesa',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;

