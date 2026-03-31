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
const configuracionRepository = require('../repository/configuracion.repository');
const calculosPrecios = require('../utils/calculosPrecios');

const { validarComandasParaPagar } = require('../repository/comanda.repository');
const pedidoModel = require('../database/models/pedido.model');
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
        let totalDescuentos = 0;
        const descuentos = [];
        
        comandasValidas.forEach((comanda) => {
            // 🔥 NUEVO: Recopilar información de descuentos
            if (comanda.descuento > 0) {
                totalDescuentos += comanda.montoDescuento || 0;
                descuentos.push({
                    comandaNumber: comanda.comandaNumber || null,
                    porcentaje: comanda.descuento,
                    motivo: comanda.motivoDescuento || 'Sin motivo',
                    monto: comanda.montoDescuento || 0,
                    aplicadoPor: comanda.descuentoAplicadoPor || null
                });
            }
            
 if (comanda.platos && Array.isArray(comanda.platos)) {
 comanda.platos.forEach((platoItem, index) => {
 // Solo incluir platos no eliminados
 if (!platoItem.eliminado) {
 const plato = platoItem.plato || platoItem;
 const cantidad = comanda.cantidades?.[index] || 1;
 const precio = plato.precio || 0;
 const subtotal = precio * cantidad;
 
 // 🔥 TRAZABILIDAD: Extraer información del cocinero
 const cocineroInfo = platoItem.procesadoPor || platoItem.procesandoPor || null;
 const cocineroNombre = cocineroInfo?.alias || cocineroInfo?.nombre || null;
 const cocineroId = cocineroInfo?.cocineroId || null;
 
 // 🔥 TRAZABILIDAD: Calcular tiempo de preparación desde tiempos oficiales
 let tiempoPreparacion = null;
 const tiempoInicio = platoItem.tiempos?.en_espera;
 const tiempoFin = platoItem.tiempos?.recoger;
 if (tiempoInicio && tiempoFin) {
 const inicio = new Date(tiempoInicio).getTime();
 const fin = new Date(tiempoFin).getTime();
 const diffMs = fin - inicio;
 if (diffMs > 0) {
 const segundos = Math.floor(diffMs / 1000);
 const minutos = Math.floor(segundos / 60);
 const seg = segundos % 60;
 tiempoPreparacion = `${minutos.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
 }
 }
 
 platosParaBoucher.push({
 plato: plato._id || plato,
 platoId: platoItem.platoId || plato.id || null,
 nombre: plato.nombre || "Plato",
 precio: precio,
 cantidad: cantidad,
 subtotal: subtotal,
 comandaNumber: comanda.comandaNumber || null,
 complementosSeleccionados: platoItem.complementosSeleccionados || [],
 // 🔥 TRAZABILIDAD: Información del cocinero
 cocinero: cocineroNombre,
 cocineroId: cocineroId,
 tiempoPreparacion: tiempoPreparacion
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
        
        // Obtener configuración de moneda y precios
        const configMoneda = await configuracionRepository.obtenerConfiguracionMoneda();
        
        // Calcular subtotal
        const subtotal = platosParaBoucher.reduce((sum, p) => sum + (p.subtotal || 0), 0);
        
        // Calcular IGV y total usando la utilidad centralizada
        const totales = calculosPrecios.calcularTotales(subtotal, configMoneda);
        
        // 🔥 FIX: Calcular totales con descuento usando totalCalculado de las comandas
        const totalSinDescuento = totales.total;
        let totalConDescuento;
        let montoDescuento;

        // Si hay descuentos, sumar totalCalculado de cada comanda (fuente de verdad del backend)
        const comandasConDescuento = comandasValidas.filter(c => c.descuento > 0);
        if (comandasConDescuento.length > 0) {
            // Sumar totalCalculado de comandas con descuento + subtotal normal de las sin descuento
            const totalDesdeComandas = comandasValidas.reduce((sum, c) => {
                if (c.descuento > 0 && c.totalCalculado != null) {
                    return sum + c.totalCalculado;
                }
                // Sin descuento: calcular normalmente
                return sum + (c.platos || []).reduce((s, p, i) => {
                    if (!p.eliminado) {
                        const precio = (p.plato?.precio || p.precio || 0);
                        const cant = c.cantidades?.[i] || 1;
                        return s + (precio * cant);
                    }
                    return s;
                }, 0) * (1 + (configMoneda.igvPorcentaje || 18) / 100);
            }, 0);
            totalConDescuento = Math.max(0, Number(totalDesdeComandas.toFixed(2)));
            montoDescuento = Number((totalSinDescuento - totalConDescuento).toFixed(2));
        } else {
            montoDescuento = 0;
            totalConDescuento = totalSinDescuento;
        }
        
        // Obtener información de la mesa y mozo desde la primera comanda
        const primeraComanda = comandasValidas[0];
        const mesa = primeraComanda.mesas;
        const mozo = primeraComanda.mozos;
        
        // Obtener fecha del pedido (primera comanda)
        const fechaPedido = primeraComanda?.createdAt || primeraComanda?.fecha || new Date();
        
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
            subtotal: totales.subtotalSinIGV,
            igv: totales.igv,
            total: totalConDescuento, // 🔥 Total con descuento aplicado
            totalSinDescuento: totalSinDescuento,
            montoDescuento: montoDescuento,
            totalConDescuento: totalConDescuento,
            descuentos: descuentos,
            observaciones: observaciones || '',
            fechaPedido: fechaPedido,
            fechaPago: new Date(),
            fechaPagoString: require('moment-timezone')().tz(configMoneda.zonaHoraria || "America/Lima").format("DD/MM/YYYY HH:mm:ss"),
            // Snapshot de configuración para auditoría
            configuracionIGV: {
                igvPorcentaje: configMoneda.igvPorcentaje,
                preciosIncluyenIGV: configMoneda.preciosIncluyenIGV,
                nombreImpuesto: configMoneda.nombreImpuestoPrincipal || 'IGV',
                moneda: configMoneda.moneda,
                simboloMoneda: configMoneda.simboloMoneda
            }
        };
        
        // Crear boucher
        const boucherCreado = await crearBoucher(boucherData);
        
        // Marcar comandas como pagadas - CORREGIDO: También establecer IsActive: false
        // Esto garantiza que las comandas pagadas no interfieran en el cálculo de estado de mesa
        await Promise.all(comandasIds.map(async (comandaId) => {
            try {
                await comandaModel.findByIdAndUpdate(comandaId, {
                    status: 'pagado',
                    IsActive: false, // 🔥 CRÍTICO: Marcar como inactiva para evitar que cuente en recalcularEstadoMesa
                    cliente: clienteId || null
                });
                console.log(`✅ Comanda ${comandaId} marcada como pagada e inactiva`);
            } catch (error) {
                console.error(`⚠️ Error marcando comanda ${comandaId} como pagada:`, error);
            }
        }));
        
        // Marcar Pedido asociado como pagado (si existe)
        try {
            const pedidoAbierto = await pedidoModel.findOne({
                mesa: mesaId,
                estado: 'abierto',
                isActive: true
            });
            if (pedidoAbierto) {
                pedidoAbierto.estado = 'pagado';
                pedidoAbierto.fechaPago = new Date();
                pedidoAbierto.boucher = boucherCreado._id;
                if (clienteId) {
                    pedidoAbierto.cliente = clienteId;
                }
                await pedidoAbierto.save();
                console.log(`✅ Pedido #${pedidoAbierto.pedidoId} marcado como pagado`);
            }
        } catch (pedidoError) {
            console.error('⚠️ Error al cerrar pedido (no crítico):', pedidoError.message);
        }

        res.json(boucherCreado);
        console.log('✅ Boucher creado exitosamente con', comandasIds.length, 'comanda(s)');
        console.log(`💰 IGV aplicado: ${configMoneda.igvPorcentaje}%, Total: ${totales.total}`);
        if (descuentos.length > 0) {
            console.log(`💰 Descuentos aplicados: ${descuentos.length}, Total descuento: S/. ${montoDescuento.toFixed(2)}`);
        }
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

