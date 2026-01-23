const CierreCajaRepository = require('../repository/cierreCaja.repository');
const moment = require('moment-timezone');

/**
 * Middleware para validar cierre pendiente
 * Bloquea nuevas comandas/bouchers si el mozo tiene cierre pendiente
 */
async function validarCierrePendiente(req, res, next) {
  try {
    // Obtener mozoId del request (ajustar según tu sistema de autenticación)
    const mozoId = req.mozoId || req.body.mozoId || req.query.mozoId;
    
    if (!mozoId) {
      // Si no hay mozoId, permitir (puede ser una ruta pública)
      return next();
    }
    
    const hoy = moment.tz("America/Lima").toDate();
    const fechaHoy = moment.tz("America/Lima").format("YYYY-MM-DD");
    
    const pendiente = await CierreCajaRepository.tieneCierrePendiente(
      parseInt(mozoId), 
      fechaHoy
    );
    
    if (pendiente) {
      console.log(`🚫 Mozo ${mozoId} bloqueado por cierre pendiente ${pendiente._id}`);
      
      return res.status(403).json({
        error: 'CIERRE PENDIENTE',
        mensaje: 'Complete el cierre de caja antes de realizar nuevas transacciones',
        cierreId: pendiente._id,
        diferenciaPendiente: pendiente.diferencia,
        fechaCierre: pendiente.fechaCierre
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ Error en middleware validarCierrePendiente:', error);
    // En caso de error, permitir continuar (no bloquear por error técnico)
    next();
  }
}

module.exports = {
  validarCierrePendiente
};

