'use strict';

/**
 * Quién puede reasignar un plato/guarnición ya tomado.
 * - Supervisor/admin con forzar: cualquiera.
 * - El cocinero que lo tiene (holder) con forzar: transferir a otro.
 */
function evaluarReasignacionProcesamiento({
  adminId,
  esSupervisor,
  holderId,
  nuevoCocineroId,
  forzar
}) {
  const admin = adminId != null ? String(adminId) : '';
  const holder = holderId != null && holderId !== '' ? String(holderId) : '';
  const nuevo = nuevoCocineroId != null ? String(nuevoCocineroId) : '';
  const soyHolder = !!(admin && holder && admin === holder);

  if (admin && nuevo && admin !== nuevo && !esSupervisor && !soyHolder) {
    return { ok: false, status: 403, error: 'No tiene permisos para realizar esta acción' };
  }
  if (holder && nuevo && holder !== nuevo) {
    if (!forzar || (!esSupervisor && !soyHolder)) {
      return {
        ok: false,
        status: 409,
        error: 'Este plato ya está siendo procesado por otro cocinero'
      };
    }
  }
  return { ok: true };
}

module.exports = { evaluarReasignacionProcesamiento };
