/**
 * ALERTAS CONTROLLER
 * Sistema de Alertas operativas (overlay forzado con duración/color/sonido).
 *
 * Diferencia con anuncios (/mensajes/anuncios): las alertas son overlays puntuales
 * que pueden dirigirse también a pantallas de cocina (TVs/kiosk) y no solo a usuarios
 * con chat abierto. Reutilizan prioridades del sistema de mensajería.
 *
 * Endpoints:
 *  - POST   /api/alertas              -> crea y emite alerta (requiere enviar-alertas o enviar-anuncios)
 *  - GET    /api/alertas/activas      -> alertas activas para el caller (usuario/pantalla)
 *  - GET    /api/alertas              -> historial reciente (enviar-alertas / ver-alertas)
 *  - PATCH  /api/alertas/:id/cancelar -> cancela y cierra overlays
 *  - POST   /api/alertas/:id/ack      -> registra "Entendido"
 *  - GET    /api/alertas/presets      -> catálogo de sonidos/colores/defaults (autenticado)
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { adminAuth } = require('../middleware/adminAuth');
const rolesRepository = require('../repository/roles.repository');
const alertaService = require('../services/alertaService');
const Alerta = require('../database/models/alerta.model');

router.use(adminAuth);

function userInfo(req) {
  const admin = req.admin || {};
  return {
    id: admin.id || admin._id || admin.userId,
    rol: admin.rol || '',
    permisos: admin.permisos || [],
    name: admin.name || admin.nombre || 'Usuario',
    numeroPantalla: admin.numeroPantalla || null
  };
}

async function tienePermiso(user, permiso) {
  if (user.rol === 'admin') return true;
  if (user.permisos.includes(permiso)) return true;
  try {
    return await rolesRepository.tienePermiso(user.id, permiso);
  } catch {
    return false;
  }
}

/**
 * POST /api/alertas
 * Body:
 *  - texto
 *  - prioridadCodigo?  (default 'urgente')
 *  - targeting: { todos?, roles?, usuarios?, cocineras?, numerosPantalla? }
 *  - estilo:    { duracionMs?, colorHex?, sonidoClave?, requiereAck? }
 *
 * Permisos:
 *  - Si prioridad >= urgente (9), requiere forzar-prioridad-mensajes (igual que chat).
 *  - Si targeting.todos o roles, requiere enviar-anuncios (broadcast).
 *  - En todos los casos requiere el permiso nuevo enviar-alertas (o enviar-anuncios como fallback legacy).
 */
router.post('/alertas', async (req, res) => {
  try {
    const user = userInfo(req);

    const puedeAlertas = (await tienePermiso(user, 'enviar-alertas')) ||
                         (await tienePermiso(user, 'enviar-anuncios'));
    if (!puedeAlertas) {
      return res.status(403).json({ error: 'Sin permiso: enviar-alertas' });
    }

    const { texto, prioridadCodigo = 'urgente', targeting = {}, estilo = {} } = req.body;

    // Broadcast (todos / roles) requiere enviar-anuncios
    const esBroadcast = targeting.todos || (targeting.roles?.length && !targeting.usuarios?.length && !targeting.cocineras?.length);
    if (esBroadcast && !(await tienePermiso(user, 'enviar-anuncios'))) {
      return res.status(403).json({ error: 'Sin permiso: enviar-anuncios (broadcast)' });
    }

    // Urgente/critica requiere forzar-prioridad-mensajes (salvo admin)
    if (['urgente', 'critica'].includes(prioridadCodigo) && !(await tienePermiso(user, 'forzar-prioridad-mensajes'))) {
      return res.status(403).json({ error: 'Sin permiso: forzar-prioridad-mensajes' });
    }

    const result = await alertaService.crearAlerta({
      remitenteId: user.id,
      remitenteNombre: user.name,
      texto,
      prioridadCodigo,
      targeting,
      estilo
    });

    res.json({ success: true, data: result.alerta });
  } catch (error) {
    const code = error.statusCode || 500;
    logger.error('[alertas] POST /alertas', { error: error.message });
    res.status(code).json({ error: error.message });
  }
});

/**
 * GET /api/alertas/activas
 * Devuelve alertas activas para el caller (usuario o pantalla).
 */
router.get('/alertas/activas', async (req, res) => {
  try {
    const user = userInfo(req);
    const alertas = await alertaService.alertasActivasPara({
      usuarioId: user.id,
      rol: user.rol,
      numeroPantalla: user.numeroPantalla
    });
    res.json({ success: true, data: alertas });
  } catch (error) {
    logger.error('[alertas] GET /activas', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /api/alertas
 * Historial reciente (admin / supervisor / quien tenga ver-alertas).
 */
router.get('/alertas', async (req, res) => {
  try {
    const user = userInfo(req);
    const puede = (await tienePermiso(user, 'enviar-alertas')) ||
                  (await tienePermiso(user, 'ver-alertas')) ||
                  (await tienePermiso(user, 'enviar-anuncios'));
    if (!puede) return res.status(403).json({ error: 'Sin permiso' });

    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const alertas = await Alerta.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, data: alertas });
  } catch (error) {
    logger.error('[alertas] GET /alertas', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * PATCH /api/alertas/:id/cancelar
 */
router.patch('/alertas/:id/cancelar', async (req, res) => {
  try {
    const user = userInfo(req);
    const puede = (await tienePermiso(user, 'enviar-alertas')) ||
                  (await tienePermiso(user, 'enviar-anuncios'));
    if (!puede) return res.status(403).json({ error: 'Sin permiso' });

    const r = await alertaService.cancelarAlerta(req.params.id, user.id);
    res.json({ success: true, data: r.alerta, yaCancelada: !!r.yaCancelada });
  } catch (error) {
    logger.error('[alertas] PATCH cancelar', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /api/alertas/:id/ack
 * Cualquier destinatario puede ack (no requiere permiso especial).
 * Body: { numeroPantalla? }
 */
router.post('/alertas/:id/ack', async (req, res) => {
  try {
    const user = userInfo(req);
    const r = await alertaService.ackAlerta(req.params.id, {
      usuarioId: user.id,
      numeroPantalla: req.body?.numeroPantalla || user.numeroPantalla || null
    });
    res.json({ success: true, data: r });
  } catch (error) {
    logger.error('[alertas] POST ack', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /api/alertas/presets
 * Catálogo de sonidos/colores/defaults. Cualquier autenticado.
 */
router.get('/alertas/presets', (req, res) => {
  res.json({
    success: true,
    data: {
      sonidos: alertaService.ALERTA_SONIDOS,
      colores: alertaService.ALERTA_COLORES_PRESET,
      defaults: alertaService.DEFAULTS,
      prioridades: alertaService.PRIORIDADES
    }
  });
});

module.exports = router;
