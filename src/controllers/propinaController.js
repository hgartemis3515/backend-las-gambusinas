/**
 * PROPINA CONTROLLER
 * Rutas específicas ANTES de /propinas/:id para no capturar "resumen", "mesa", etc.
 */

const express = require('express');
const router = express.Router();
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const { resolverTotalBoucher, idsCoinciden, calcularMontoPropina } = require('../utils/propinaCalculo');

const propinaRepository = require('../repository/propina.repository');
const boucherRepository = require('../repository/boucher.repository');
const mesasRepository = require('../repository/mesas.repository');
const mozosRepository = require('../repository/mozos.repository');

function toOidStr(v) {
    if (v == null) return null;
    return typeof v === 'object' && v.toString ? v.toString() : String(v);
}

// ============================================================
// POST /api/propinas - CREAR PROPINA
// ============================================================
router.post('/propinas', async (req, res) => {
    try {
        const {
            mesaId,
            boucherId,
            mozoId,
            tipo,
            montoFijo,
            porcentaje,
            nota,
            registradoPor
        } = req.body;

        if (!mesaId || !boucherId || !mozoId) {
            return res.status(400).json({
                success: false,
                error: 'mesaId, boucherId y mozoId son requeridos'
            });
        }

        if (!tipo || !['monto', 'porcentaje', 'ninguna'].includes(tipo)) {
            return res.status(400).json({
                success: false,
                error: 'tipo debe ser "monto", "porcentaje" o "ninguna"'
            });
        }

        if (tipo === 'monto' && (montoFijo === undefined || montoFijo === null)) {
            return res.status(400).json({
                success: false,
                error: 'montoFijo es requerido cuando tipo es "monto"'
            });
        }

        if (tipo === 'porcentaje' && (porcentaje === undefined || porcentaje === null)) {
            return res.status(400).json({
                success: false,
                error: 'porcentaje es requerido cuando tipo es "porcentaje"'
            });
        }

        if (tipo === 'ninguna' && nota && String(nota).length > 200) {
            return res.status(400).json({ success: false, error: 'nota máximo 200 caracteres' });
        }

        const mesa = await mesasRepository.obtenerMesaPorId(mesaId);
        if (!mesa) {
            return res.status(404).json({ success: false, error: 'Mesa no encontrada' });
        }

        if (mesa.estado !== 'pagado') {
            return res.status(400).json({
                success: false,
                error: `La mesa debe estar en estado "pagado" para registrar propina. Estado actual: ${mesa.estado}`
            });
        }

        const boucher = await boucherRepository.obtenerBoucherPorId(boucherId);
        if (!boucher) {
            return res.status(404).json({ success: false, error: 'Boucher no encontrado' });
        }

        if (boucher.isActive === false) {
            return res.status(400).json({
                success: false,
                error: 'El boucher no está activo; no se puede registrar propina'
            });
        }

        if (!idsCoinciden(boucher.mesa, mesaId)) {
            return res.status(400).json({
                success: false,
                error: 'El boucher no corresponde a la mesa indicada'
            });
        }

        if (!idsCoinciden(boucher.mozo, mozoId)) {
            return res.status(400).json({
                success: false,
                error: 'El mozo no coincide con el boucher'
            });
        }

        const mozo = await mozosRepository.obtenerMozosPorId(mozoId);
        if (!mozo) {
            return res.status(404).json({ success: false, error: 'Mozo no encontrado' });
        }

        const totalBoucher = resolverTotalBoucher(boucher);
        const preview = calcularMontoPropina(tipo, totalBoucher, montoFijo, porcentaje);
        if (preview.error) {
            return res.status(400).json({ success: false, error: preview.error });
        }

        let registradoPorNombre = null;
        if (registradoPor) {
            const usuarioRegistra = await mozosRepository.obtenerMozosPorId(registradoPor);
            registradoPorNombre = usuarioRegistra?.name || 'Sistema';
        }

        const propinaData = {
            mesaId,
            numMesa: mesa.nummesa,
            boucherId,
            boucherNumber: boucher.boucherNumber,
            mozoId,
            nombreMozo: mozo.name,
            tipo,
            montoFijo: tipo === 'monto' ? montoFijo : null,
            porcentaje: tipo === 'porcentaje' ? porcentaje : null,
            totalBoucher,
            nota,
            registradoPor,
            registradoPorNombre
        };

        const propina = await propinaRepository.crearPropina(propinaData);

        if (global.emitPropinaRegistrada) {
            await global.emitPropinaRegistrada(propina);
        }

        logger.info('[PropinaController] Propina creada', {
            propinaId: propina.propinaId,
            mozoId: toOidStr(mozoId),
            monto: propina.montoPropina
        });

        return res.status(201).json({
            success: true,
            message: 'Propina registrada exitosamente',
            data: propina
        });
    } catch (error) {
        if (error.code === 'PROPINA_DUPLICADA' || error.statusCode === 409) {
            return res.status(409).json({
                success: false,
                error: error.message || 'Ya existe propina para este boucher',
                existingId: error.existingId
            });
        }
        logger.error('[PropinaController] Error al crear propina', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al registrar propina'
        });
    }
});

// ============================================================
// GET /api/propinas - LISTAR
// ============================================================
router.get('/propinas', async (req, res) => {
    try {
        const { fechaInicio, fechaFin, mozoId, mesaId, tipo } = req.query;
        const filtros = {};
        if (fechaInicio) filtros.fechaInicio = fechaInicio;
        if (fechaFin) filtros.fechaFin = fechaFin;
        if (mozoId) filtros.mozoId = mozoId;
        if (mesaId) filtros.mesaId = mesaId;
        if (tipo) filtros.tipo = tipo;

        const propinas = await propinaRepository.listarPropinas(filtros);
        return res.json({
            success: true,
            cantidad: propinas.length,
            data: propinas
        });
    } catch (error) {
        logger.error('[PropinaController] Error al listar propinas', { error: error.message });
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener propinas'
        });
    }
});

// ============================================================
// Rutas estáticas ANTES de /propinas/:id
// ============================================================

router.get('/propinas/mesa/:mesaId', async (req, res) => {
    try {
        const { mesaId } = req.params;
        const { fechaInicio, fechaFin } = req.query;
        const propinas = await propinaRepository.obtenerPropinasPorMesa(mesaId, {
            fechaInicio,
            fechaFin
        });
        const totalPropinas = propinas.reduce((sum, p) => sum + p.montoPropina, 0);
        return res.json({
            success: true,
            mesaId,
            cantidad: propinas.length,
            totalPropinas: Math.round(totalPropinas * 100) / 100,
            data: propinas
        });
    } catch (error) {
        logger.error('[PropinaController] Error propinas por mesa', { error: error.message });
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener propinas de la mesa'
        });
    }
});

router.get('/propinas/mozo/:mozoId', async (req, res) => {
    try {
        const { mozoId } = req.params;
        const { fechaInicio, fechaFin, limite } = req.query;
        const resultado = await propinaRepository.obtenerPropinasPorMozo(mozoId, {
            fechaInicio,
            fechaFin,
            limite: limite ? parseInt(limite, 10) : 50
        });
        return res.json({ success: true, ...resultado });
    } catch (error) {
        logger.error('[PropinaController] Error propinas por mozo', { error: error.message });
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener propinas del mozo'
        });
    }
});

router.get('/propinas/resumen/dia', async (req, res) => {
    try {
        const { fecha } = req.query;
        const resumen = await propinaRepository.obtenerResumenDia(fecha || null);
        return res.json({ success: true, data: resumen });
    } catch (error) {
        logger.error('[PropinaController] Error resumen día', { error: error.message });
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener resumen'
        });
    }
});

router.get('/propinas/mozos-dashboard', async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        const inicio = fechaInicio || moment().tz('America/Lima').format('YYYY-MM-DD');
        const fin = fechaFin || moment().tz('America/Lima').format('YYYY-MM-DD');
        const datos = await propinaRepository.obtenerDatosDashboardMozos(inicio, fin);
        return res.json({
            success: true,
            data: datos,
            meta: {
                fechaInicio: inicio,
                fechaFin: fin,
                generadoEn: moment().tz('America/Lima').toISOString()
            }
        });
    } catch (error) {
        logger.error('[PropinaController] Error dashboard mozos', { error: error.message });
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener datos del dashboard'
        });
    }
});

// ============================================================
// GET /api/propinas/:id
// ============================================================
router.get('/propinas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const propina = await propinaRepository.obtenerPropinaPorId(id);
        return res.json({ success: true, data: propina });
    } catch (error) {
        if (error.message === 'Propina no encontrada') {
            return res.status(404).json({ success: false, error: 'Propina no encontrada' });
        }
        logger.error('[PropinaController] Error obtener propina', { error: error.message });
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener propina'
        });
    }
});

// ============================================================
// PUT /api/propinas/:id
// ============================================================
router.put('/propinas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { tipo, montoFijo, porcentaje, nota } = req.body;

        const patch = {};
        if (tipo !== undefined) patch.tipo = tipo;
        if (montoFijo !== undefined) patch.montoFijo = montoFijo;
        if (porcentaje !== undefined) patch.porcentaje = porcentaje;
        if (nota !== undefined) patch.nota = nota;

        if (Object.keys(patch).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No hay campos para actualizar (tipo, montoFijo, porcentaje, nota)'
            });
        }

        const propina = await propinaRepository.actualizarPropina(id, patch);

        if (global.emitPropinaActualizada) {
            await global.emitPropinaActualizada(propina);
        }

        return res.json({
            success: true,
            message: 'Propina actualizada exitosamente',
            data: propina
        });
    } catch (error) {
        if (error.message === 'Propina no encontrada') {
            return res.status(404).json({ success: false, error: 'Propina no encontrada' });
        }
        logger.error('[PropinaController] Error actualizar propina', { error: error.message });
        return res.status(400).json({
            success: false,
            error: error.message || 'Error al actualizar propina'
        });
    }
});

// ============================================================
// DELETE /api/propinas/:id
// ============================================================
router.delete('/propinas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const propina = await propinaRepository.eliminarPropina(id);

        if (global.emitPropinaEliminada) {
            await global.emitPropinaEliminada(propina);
        }

        return res.json({
            success: true,
            message: 'Propina eliminada exitosamente',
            data: propina
        });
    } catch (error) {
        if (error.message === 'Propina no encontrada') {
            return res.status(404).json({ success: false, error: 'Propina no encontrada' });
        }
        logger.error('[PropinaController] Error eliminar propina', { error: error.message });
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al eliminar propina'
        });
    }
});

module.exports = router;
