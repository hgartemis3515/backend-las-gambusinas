const express = require('express');
const router = express.Router();
const { adminAuth, requireAnyPermission } = require('../middleware/adminAuth');
const { getSosCocineras, setSosCocineras, emitSosCocineras } = require('../services/sosCocineras.service');
const logger = require('../utils/logger');

const PERM_SOS = ['ver-vista-supervisor-cocina'];

function puedeEscribirSos(admin) {
  const rol = admin?.rol;
  if (rol === 'admin' || rol === 'supervisor') return true;
  return false;
}

function requireSosWrite(req, res, next) {
  if (puedeEscribirSos(req.admin)) return next();
  return requireAnyPermission(PERM_SOS)(req, res, next);
}

router.get('/cocina/sos', adminAuth, async (req, res) => {
  try {
    const cocineras = await getSosCocineras();
    res.json({ success: true, cocineras, tabla: null });
  } catch (error) {
    logger.error('GET /cocina/sos', { error: error.message });
    res.status(500).json({ success: false, error: 'No se pudo leer SOS' });
  }
});

router.put('/cocina/sos', adminAuth, requireSosWrite, async (req, res) => {
  try {
    const raw = req.body?.cocineras;
    const next = raw === true || raw === 'true' || raw === 1 || raw === '1';
    const cocineras = await setSosCocineras(next);
    const payload = {
      activo: cocineras,
      by: { id: req.admin?.id || null, name: req.admin?.name || req.admin?.nombre || null },
      at: new Date().toISOString(),
    };
    emitSosCocineras(payload);
    logger.info('SOS cocineras actualizado', { cocineras, userId: req.admin?.id });
    res.json({ success: true, cocineras, tabla: null });
  } catch (error) {
    logger.error('PUT /cocina/sos', { error: error.message });
    res.status(500).json({ success: false, error: 'No se pudo guardar SOS Cocineras' });
  }
});

module.exports = router;
