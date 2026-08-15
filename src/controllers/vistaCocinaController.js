/**
 * VISTA COCINA CONTROLLER
 * Endpoints para gestion de Vistas de Cocina (presets de platos + apariencia TV)
 * y Pantallas de Cocina (mapeo TV fisica -> vista).
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const repo = require('../repository/vistaCocina.repository');
const { adminAuth, checkPermission, requireAnyPermission, JWT_SECRET } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

// Expiracion del JWT de monitor (TVs kiosko). Defaults largos.
const MONITOR_JWT_EXPIRY = process.env.COCINA_MONITOR_JWT_EXPIRY || '90d';

/* ====================== VISTAS DE COCINA ====================== */

/**
 * GET /api/vistas-cocina
 * Listar vistas (opcionalmente solo activas)
 */
router.get('/vistas-cocina', adminAuth, async (req, res) => {
    try {
        const { activo } = req.query;
        const filtros = {};
        if (activo !== undefined) {
            filtros.activo = activo === 'true';
        }
        const vistas = await repo.obtenerVistasCocina(filtros);
        res.json({ success: true, data: vistas, total: vistas.length });
    } catch (error) {
        logger.error('Error al listar vistas de cocina', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener vistas de cocina' });
    }
});

/**
 * GET /api/vistas-cocina/activas
 * Listar vistas activas (selector en app cocina)
 */
router.get('/vistas-cocina/activas', adminAuth, async (req, res) => {
    try {
        const vistas = await repo.obtenerVistasCocinaActivas();
        res.json({ success: true, data: vistas });
    } catch (error) {
        logger.error('Error al listar vistas activas', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener vistas activas' });
    }
});

/**
 * GET /api/vistas-cocina/:id
 */
router.get('/vistas-cocina/:id', adminAuth, async (req, res) => {
    try {
        const vista = await repo.obtenerVistaCocinaPorId(req.params.id);
        if (!vista) {
            return res.status(404).json({ success: false, error: 'Vista de cocina no encontrada' });
        }
        res.json({ success: true, data: vista });
    } catch (error) {
        logger.error('Error al obtener vista de cocina', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener vista' });
    }
});

/**
 * POST /api/vistas-cocina
 */
router.post('/vistas-cocina', adminAuth, requireAnyPermission(['administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const datos = req.body;
        if (!datos.nombre || !datos.nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }

        const sanitizados = {
            nombre: datos.nombre.trim(),
            descripcion: datos.descripcion?.trim() || '',
            color: datos.color || '#d4af37',
            icono: datos.icono || 'tools-kitchen',
            activo: datos.activo !== false,
            filtrosPlatos: {
                modoInclusion: datos.filtrosPlatos?.modoInclusion ?? true,
                platosPermitidos: datos.filtrosPlatos?.platosPermitidos || [],
                categoriasPermitidas: datos.filtrosPlatos?.categoriasPermitidas || [],
                tiposPermitidos: datos.filtrosPlatos?.tiposPermitidos || []
            },
            configVisual: datos.configVisual || undefined,
            ordenamiento: datos.ordenamiento || undefined,
            configCronometro: datos.configCronometro || undefined
        };

        const vista = await repo.crearVistaCocina(sanitizados, req.admin.id);
        res.status(201).json({ success: true, message: 'Vista de cocina creada correctamente', data: vista });
    } catch (error) {
        logger.error('Error al crear vista de cocina', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al crear vista' });
    }
});

/**
 * PUT /api/vistas-cocina/:id
 */
router.put('/vistas-cocina/:id', adminAuth, requireAnyPermission(['administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const datos = {};
        const body = req.body;

        if (body.nombre !== undefined) datos.nombre = body.nombre.trim();
        if (body.descripcion !== undefined) datos.descripcion = body.descripcion?.trim() || '';
        if (body.color !== undefined) datos.color = body.color;
        if (body.icono !== undefined) datos.icono = body.icono;
        if (body.activo !== undefined) datos.activo = body.activo;
        if (body.filtrosPlatos !== undefined) {
            datos.filtrosPlatos = {
                modoInclusion: body.filtrosPlatos?.modoInclusion ?? true,
                platosPermitidos: body.filtrosPlatos?.platosPermitidos || [],
                categoriasPermitidas: body.filtrosPlatos?.categoriasPermitidas || [],
                tiposPermitidos: body.filtrosPlatos?.tiposPermitidos || []
            };
        }
        if (body.configVisual !== undefined) datos.configVisual = body.configVisual;
        if (body.ordenamiento !== undefined) datos.ordenamiento = body.ordenamiento;
        if (body.configCronometro !== undefined) datos.configCronometro = body.configCronometro;

        const vista = await repo.actualizarVistaCocina(req.params.id, datos, req.admin.id);
        res.json({ success: true, message: 'Vista de cocina actualizada correctamente', data: vista });
    } catch (error) {
        logger.error('Error al actualizar vista de cocina', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al actualizar vista' });
    }
});

/**
 * DELETE /api/vistas-cocina/:id  (soft delete)
 */
router.delete('/vistas-cocina/:id', adminAuth, requireAnyPermission(['administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const vista = await repo.eliminarVistaCocina(req.params.id, req.admin.id);
        res.json({ success: true, message: 'Vista de cocina eliminada correctamente', data: vista });
    } catch (error) {
        logger.error('Error al eliminar vista de cocina', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al eliminar vista' });
    }
});

/**
 * PATCH /api/vistas-cocina/:id/reactivar
 */
router.patch('/vistas-cocina/:id/reactivar', adminAuth, requireAnyPermission(['administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const vista = await repo.reactivarVistaCocina(req.params.id, req.admin.id);
        res.json({ success: true, message: 'Vista de cocina reactivada correctamente', data: vista });
    } catch (error) {
        logger.error('Error al reactivar vista de cocina', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al reactivar vista' });
    }
});

/* ====================== PANTALLAS DE COCINA ====================== */

/**
 * GET /api/pantallas-cocina
 */
router.get('/pantallas-cocina', adminAuth, async (req, res) => {
    try {
        const pantallas = await repo.obtenerPantallasCocina();
        res.json({ success: true, data: pantallas, total: pantallas.length });
    } catch (error) {
        logger.error('Error al listar pantallas de cocina', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener pantallas' });
    }
});

/**
 * GET /api/pantallas-cocina/activas
 */
router.get('/pantallas-cocina/activas', adminAuth, async (req, res) => {
    try {
        const pantallas = await repo.obtenerPantallasActivas();
        res.json({ success: true, data: pantallas });
    } catch (error) {
        // Log detallado para diagnosticar 500: incluye stack y nombre del error
        logger.error('Error al listar pantallas activas', {
            errorName: error.name,
            message: error.message,
            stack: error.stack,
        });
        console.error('=== ERROR /api/pantallas-cocina/activas ===');
        console.error(error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener pantallas activas',
            detalle: process.env.NODE_ENV !== 'production' ? { name: error.name, message: error.message } : undefined,
        });
    }
});

/**
 * POST /api/pantallas-cocina
 */
router.post('/pantallas-cocina', adminAuth, requireAnyPermission(['desplegar-monitores-cocina', 'administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const datos = req.body;
        if (!datos.numeroPantalla || !datos.nombre) {
            return res.status(400).json({ success: false, error: 'numeroPantalla y nombre son requeridos' });
        }
        // En modo "completo" el cocinero es obligatorio (la TV no puede ver General)
        const modoVista = datos.modoVista || 'completo';
        if (modoVista === 'completo' && !datos.cocineroId) {
            return res.status(400).json({ success: false, error: 'En modo Completo debe asignar un cocinero a la TV' });
        }
        const sanitizados = {
            numeroPantalla: Number(datos.numeroPantalla),
            nombre: datos.nombre,
            vistaCocinaId: datos.vistaCocinaId || null,
            cocineroId: datos.cocineroId || null,
            modoVista,
            activo: datos.activo !== false,
            orden: datos.orden || 0,
            configDespliegue: datos.configDespliegue || undefined
        };
        const pantalla = await repo.crearPantallaCocina(sanitizados, req.admin.id);
        res.status(201).json({ success: true, message: 'Pantalla creada correctamente', data: pantalla });
    } catch (error) {
        logger.error('Error al crear pantalla', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al crear pantalla' });
    }
});

/**
 * PUT /api/pantallas-cocina/:id
 * Acepta: nombre, vistaCocinaId, cocineroId, modoVista, activo, orden, configDespliegue
 */
router.put('/pantallas-cocina/:id', adminAuth, requireAnyPermission(['desplegar-monitores-cocina', 'administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const body = req.body;
        // Validar modo completo sin cocinero (mergeando con el estado actual)
        const modoVista = body.modoVista;
        const cocineroId = body.cocineroId;
        if (modoVista === 'completo' && (cocineroId === undefined || cocineroId === '' || cocineroId === null)) {
            // Podria ser que no cambio cocineroId y ya tenia uno; validar contra BD
            const existente = await repo.obtenerPantallaPorNumero?.(body.numeroPantalla);
            // fallback: si no podemos validar, rechazar cuando llega explicitamente vacio
            if (cocineroId !== undefined && (cocineroId === '' || cocineroId === null)) {
                return res.status(400).json({ success: false, error: 'En modo Completo debe asignar un cocinero a la TV' });
            }
        }
        const datos = {};
        if (body.nombre !== undefined) datos.nombre = body.nombre;
        if (body.vistaCocinaId !== undefined) datos.vistaCocinaId = body.vistaCocinaId || null;
        if (body.cocineroId !== undefined) datos.cocineroId = body.cocineroId || null;
        if (body.modoVista !== undefined) datos.modoVista = body.modoVista;
        if (body.activo !== undefined) datos.activo = body.activo;
        if (body.orden !== undefined) datos.orden = body.orden;
        if (body.configDespliegue !== undefined) datos.configDespliegue = body.configDespliegue;
        const pantalla = await repo.actualizarPantallaCocina(req.params.id, datos, req.admin.id);
        res.json({ success: true, message: 'Pantalla actualizada correctamente', data: pantalla });
    } catch (error) {
        logger.error('Error al actualizar pantalla', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al actualizar pantalla' });
    }
});

/**
 * PUT /api/pantallas-cocina/distribucion
 * Flujo "Distribuir Cocina en monitores" (PC multi-monitor).
 * Body: { items: [{ id, cocineroId, modoVista }] }
 * Actualiza en lote la asignacion de cocineros a las pantallas 2..8.
 * Permite cocineroId null ("Sin asignar").
 */
router.put('/pantallas-cocina/distribucion', adminAuth, requireAnyPermission(['desplegar-monitores-cocina', 'administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const items = req.body?.items;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'items es requerido y debe ser un arreglo no vacío' });
        }
        // Validacion minimal por item
        for (const item of items) {
            if (!item.id) {
                return res.status(400).json({ success: false, error: 'Cada item debe incluir id' });
            }
            if (item.modoVista && !['completo', 'personalizado'].includes(item.modoVista)) {
                return res.status(400).json({ success: false, error: `modoVista inválido: ${item.modoVista}` });
            }
            // perfilAplicar: 'none' | 'auto' | '<PerfilVerCocinaId>'. Cualquier otra
            // cosa se normaliza a 'none' para evitar CastError en bulkWrite.
            const perfil = item.perfilAplicar;
            if (perfil !== undefined && perfil !== null && perfil !== 'none' && perfil !== 'auto') {
                if (typeof perfil !== 'string' || !/^[a-fA-F0-9]{24}$/.test(perfil)) {
                    item.perfilAplicar = 'none';
                }
            }
        }
        const actualizadas = await repo.actualizarDistribucionPantallas(items, req.admin.id);
        res.json({ success: true, message: 'Distribución actualizada correctamente', data: actualizadas });
    } catch (error) {
        logger.error('Error al actualizar distribucion', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al actualizar distribución' });
    }
});

/**
 * DELETE /api/pantallas-cocina/:id
 */
router.delete('/pantallas-cocina/:id', adminAuth, requireAnyPermission(['desplegar-monitores-cocina', 'administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const pantalla = await repo.eliminarPantallaCocina(req.params.id);
        res.json({ success: true, message: 'Pantalla eliminada correctamente', data: pantalla });
    } catch (error) {
        logger.error('Error al eliminar pantalla', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al eliminar pantalla' });
    }
});

/* ====================== KIOSKO / BOOTSTRAP TV ====================== */

/**
 * GET /api/pantallas-cocina/:numeroPantalla/kiosk-info
 * Endpoint publico (sin adminAuth) que devuelve metadata minima para que el TV
 * sepa si debe emparejar o ya tiene token guardado.
 */
router.get('/pantallas-cocina/:numeroPantalla/kiosk-info', async (req, res) => {
    try {
        const numero = Number(req.params.numeroPantalla);
        const pantalla = await repo.obtenerPantallaPorNumero(numero);
        if (!pantalla) {
            return res.status(404).json({ success: false, error: 'Pantalla no configurada' });
        }
        res.json({
            success: true,
            data: {
                numeroPantalla: pantalla.numeroPantalla,
                nombre: pantalla.nombre,
                modoVista: pantalla.modoVista,
                cocinero: pantalla.cocineroId ? {
                    nombre: pantalla.cocineroId.nombre,
                    alias: pantalla.cocineroId.alias
                } : null,
                tieneDeviceToken: !pantalla.deviceTokenHash === false,
                activo: pantalla.activo
            }
        });
    } catch (error) {
        logger.error('Error kiosk-info', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener info de pantalla' });
    }
});

/**
 * POST /api/pantallas-cocina/:numeroPantalla/bootstrap
 * Autenticacion automatica del TV. Sin usuario/contraseña.
 * Body: { deviceToken: string }
 * Devuelve JWT monitor (solo lectura) + cocinero asignado.
 */
router.post('/pantallas-cocina/:numeroPantalla/bootstrap', async (req, res) => {
    try {
        const numero = Number(req.params.numeroPantalla);
        const { deviceToken } = req.body || {};

        if (!deviceToken || typeof deviceToken !== 'string') {
            return res.status(400).json({ success: false, error: 'deviceToken es requerido' });
        }

        const pantalla = await repo.verificarDeviceToken(numero, deviceToken);
        if (!pantalla) {
            logger.warn('Bootstrap fallido', { numeroPantalla: numero });
            return res.status(401).json({ success: false, error: 'Token de dispositivo inválido o pantalla inactiva' });
        }

        // Emisor del JWT monitor: solo lectura
        const cocinero = pantalla.cocineroId;
        const token = jwt.sign(
            {
                app: 'cocina',
                modo: 'monitor',
                pantallaId: pantalla._id,
                numeroPantalla: pantalla.numeroPantalla,
                cocineroId: cocinero ? String(cocinero) : null,
                permisos: ['ver-cocina-completo'],
                soloLectura: true
            },
            JWT_SECRET,
            { expiresIn: MONITOR_JWT_EXPIRY }
        );

        res.json({
            success: true,
            data: {
                token,
                numeroPantalla: pantalla.numeroPantalla,
                nombre: pantalla.nombre,
                modoVista: pantalla.modoVista,
                cocineroId: cocinero ? String(cocinero) : null,
                expiresAt: new Date(Date.now() + parseExpiry(MONITOR_JWT_EXPIRY)).toISOString()
            }
        });
    } catch (error) {
        logger.error('Error bootstrap TV', { error: error.message });
        res.status(500).json({ success: false, error: 'Error en bootstrap' });
    }
});

/**
 * POST /api/pantallas-cocina/:id/regenerar-token
 * Admin: genera nuevo device token para una pantalla (revoca el anterior).
 */
router.post('/pantallas-cocina/:id/regenerar-token', adminAuth, requireAnyPermission(['desplegar-monitores-cocina', 'administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const { deviceToken } = await repo.generarDeviceToken(req.params.id);
        res.json({
            success: true,
            message: 'Token de dispositivo generado. Guárdalo ahora, no se mostrará de nuevo.',
            data: { deviceToken }
        });
    } catch (error) {
        logger.error('Error regenerar-token', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al generar token' });
    }
});

/**
 * DELETE /api/pantallas-cocina/:id/revocar-token
 * Admin: revoca el device token (desvincula el TV).
 */
router.delete('/pantallas-cocina/:id/revocar-token', adminAuth, requireAnyPermission(['desplegar-monitores-cocina', 'administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        await repo.revocarDeviceToken(req.params.id);
        res.json({ success: true, message: 'Token revocado correctamente' });
    } catch (error) {
        logger.error('Error revocar-token', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al revocar token' });
    }
});

/**
 * Convierte "90d" / "12h" / "3600" a milisegundos.
 */
function parseExpiry(expiry) {
    if (typeof expiry !== 'string') return 90 * 24 * 60 * 60 * 1000;
    const match = expiry.match(/^(\d+)([smhdwMy]?)$/);
    if (!match) return 90 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2] || 's';
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000, M: 2592000000, y: 31536000000 };
    return value * (multipliers[unit] || 1000);
}

module.exports = router;