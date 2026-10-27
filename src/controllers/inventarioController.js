const express = require('express');
const router = express.Router();
const { adminAuth, checkPermission } = require('../middleware/adminAuth');
const inventario = require('../repository/inventario.repository');
const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
const { objectIdUsuarioOrNull } = require('../utils/objectIdUsuario');
const logger = require('../utils/logger');

const ACCION_INVENTARIO = {
    regulacion: 'INVENTARIO_CORRECCION',
    inventario: 'INVENTARIO_CONTEO',
    ingreso: 'INVENTARIO_INGRESO',
    egreso: 'INVENTARIO_EGRESO'
};

function resumenMovimiento(doc) {
    const nombre = doc.nombre || 'Producto';
    const tipo = doc.tipoProducto || '';
    const n = Number(doc.cantidad);
    const cant = Number.isFinite(n) ? n : doc.cantidad;
    if (doc.clase === 'regulacion') {
        const signo = Number.isFinite(n) && n > 0 ? '+' : '';
        return nombre + ' · ' + tipo + ' · corrección ' + signo + cant;
    }
    if (doc.clase === 'inventario') return nombre + ' · ' + tipo + ' · inventario ' + cant;
    if (doc.clase === 'egreso') return nombre + ' · ' + tipo + ' · salida ' + cant;
    return nombre + ' · ' + tipo + ' · ingreso ' + cant;
}

async function auditarMovimiento(req, doc) {
    const accion = ACCION_INVENTARIO[doc && doc.clase];
    if (!accion || !doc) return;
    try {
        const admin = req.admin || {};
        const dato = {
            producto: doc.nombre,
            tipoProducto: doc.tipoProducto,
            clase: doc.clase,
            cantidad: doc.cantidad,
            rubro: doc.rubro || '',
            fecha: doc.fecha
        };
        await AuditoriaAcciones.create({
            accion,
            entidadId: doc._id,
            entidadTipo: 'inventario',
            usuario: objectIdUsuarioOrNull(admin.id),
            usuarioNombre: admin.name || null,
            motivo: doc.motivo || null,
            ip: req.ip || null,
            datosDespues: dato,
            metadata: { ...dato, resumen: resumenMovimiento(doc) }
        });
    } catch (error) {
        logger.warn('No se registró auditoría de inventario', { error: error.message });
    }
}

async function auditarPuestaEnCero(req, data) {
    try {
        const admin = req.admin || {};
        const n = data.puestos || 0;
        await AuditoriaAcciones.create({
            accion: 'INVENTARIO_PUESTA_EN_CERO',
            entidadTipo: 'inventario',
            usuario: objectIdUsuarioOrNull(admin.id),
            usuarioNombre: admin.name || null,
            motivo: 'Puesta en cero',
            ip: req.ip || null,
            datosDespues: { puestos: n },
            metadata: {
                resumen: 'Inventario en 0 · ' + n + (n === 1 ? ' conteo' : ' conteos'),
                puestos: n
            }
        });
    } catch (error) {
        logger.warn('No se registró auditoría al poner el inventario en cero', { error: error.message });
    }
}

async function auditarDiaBorrado(req, data) {
    try {
        const admin = req.admin || {};
        const lista = (data.movimientos || []).map((m) => ({
            producto: m.nombre,
            rubro: m.rubro || '',
            tipoProducto: m.tipoProducto,
            clase: m.clase,
            cantidad: m.cantidad,
            motivo: m.motivo
        }));
        const n = data.eliminados || 0;
        await AuditoriaAcciones.create({
            accion: 'INVENTARIO_DIA_BORRADO',
            entidadTipo: 'inventario',
            usuario: objectIdUsuarioOrNull(admin.id),
            usuarioNombre: admin.name || null,
            motivo: 'Eliminó los números del inventario',
            ip: req.ip || null,
            datosAntes: { eliminados: n, movimientos: lista },
            metadata: {
                resumen: 'Inventario · ' + n + (n === 1 ? ' movimiento borrado' : ' movimientos borrados'),
                eliminados: n,
                movimientos: lista
            }
        });
    } catch (error) {
        logger.warn('No se registró auditoría al borrar el inventario de hoy', { error: error.message });
    }
}

function puedeLeerAlertas(req) {
    const rol = req.admin && req.admin.rol;
    if (rol === 'admin' || rol === 'supervisor' || rol === 'cocinero') return true;
    const permisos = (req.admin && req.admin.permisos) || [];
    return permisos.includes('ver-inventario')
        || permisos.includes('ver-comandas-cocina')
        || permisos.includes('ver-cocina-completo')
        || permisos.includes('ver-cocina-personalizado');
}

function errorHttp(error, res) {
    const status = error.statusCode || 500;
    if (status >= 500) logger.error('Inventario', { error: error.message });
    return res.status(status).json({ success: false, error: error.message || 'Error de inventario' });
}

router.get('/inventario/kardex', adminAuth, checkPermission('ver-inventario'), async (req, res) => {
    try {
        const data = req.query.carta === '1'
            ? await inventario.kardexCarta(req.query.desde, req.query.hasta, req.query.ciclo)
            : await inventario.kardex(req.query.desde, req.query.hasta, req.query.ciclo);
        res.json({ success: true, ...data });
    } catch (error) {
        errorHttp(error, res);
    }
});

router.get('/inventario/movimientos', adminAuth, checkPermission('ver-inventario'), async (req, res) => {
    try {
        const movimientos = await inventario.listarMovimientos(req.query);
        res.json({ success: true, movimientos });
    } catch (error) {
        errorHttp(error, res);
    }
});

router.post('/inventario/movimientos', adminAuth, checkPermission('ver-inventario'), async (req, res) => {
    try {
        const doc = await inventario.crearMovimiento(req.body || {}, req.admin && req.admin.id);
        await auditarMovimiento(req, doc);
        res.status(201).json({ success: true, movimiento: doc });
    } catch (error) {
        errorHttp(error, res);
    }
});

router.post('/inventario/poner-en-cero', adminAuth, checkPermission('ver-inventario'), async (req, res) => {
    try {
        const data = await inventario.ponerEnCero(req.admin && req.admin.id);
        await auditarPuestaEnCero(req, data);
        res.json({ success: true, puestos: data.puestos });
    } catch (error) {
        errorHttp(error, res);
    }
});

router.delete('/inventario/hoy', adminAuth, checkPermission('ver-inventario'), async (req, res) => {
    try {
        const data = await inventario.eliminarHoy();
        await auditarDiaBorrado(req, data);
        res.json({ success: true, eliminados: data.eliminados });
    } catch (error) {
        errorHttp(error, res);
    }
});

router.get('/inventario/alertas', adminAuth, async (req, res) => {
    try {
        if (!puedeLeerAlertas(req)) {
            return res.status(403).json({ success: false, error: 'No tiene permiso: ver-inventario' });
        }
        const alertas = await inventario.alertasActuales();
        res.json({ success: true, alertas });
    } catch (error) {
        errorHttp(error, res);
    }
});

router.put('/inventario/rubros/:clave', adminAuth, checkPermission('ver-inventario'), async (req, res) => {
    try {
        const data = await inventario.guardarUmbralRubro(req.params.clave, req.body || {});
        res.json({ success: true, ...data });
    } catch (error) {
        errorHttp(error, res);
    }
});

module.exports = router;
