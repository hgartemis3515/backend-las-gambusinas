'use strict';

const configuracionRepository = require('../repository/configuracion.repository');
const ticketAprobacionRepository = require('../repository/ticketAprobacion.repository');
const logger = require('../utils/logger');

const ROLES_COBRO_DIRECTO = new Set(['cajero', 'admin']);

function rolPuedeCobroDirecto(rol) {
  return ROLES_COBRO_DIRECTO.has(String(rol || '').toLowerCase());
}

/** Defaults true: un documento viejo sin sección caja sigue aprobando el cobro de caja. */
function configPermiteCobroDirecto(caja) {
  const c = caja && typeof caja === 'object' ? caja : {};
  return c.cobroDirectoMozos !== false && c.autoAprobarCobroCaja !== false;
}

/**
 * El flag del body solo indica intención. El rol sale del JWT.
 * Mozo con cobroDirectoCaja:true → false (el pago sigue, el ticket queda pendiente).
 */
async function debeAplicarCobroDirecto({ usuario, cobroDirectoCaja } = {}) {
  if (cobroDirectoCaja !== true) return false;
  if (!rolPuedeCobroDirecto(usuario?.rol)) return false;
  const cfg = await configuracionRepository.obtenerConfiguracion();
  const plain = cfg && typeof cfg.toObject === 'function' ? cfg.toObject() : cfg;
  return configPermiteCobroDirecto(plain?.caja);
}

/** Reutiliza aprobarTicket (claim atómico + platos/comanda/mesa). Una sola aprobación. */
async function aplicarCobroDirectoComanda(ticket, usuario) {
  if (!ticket?._id) return { aplicado: false, ticket };
  const result = await ticketAprobacionRepository.aprobarTicket(
    ticket._id,
    usuario?._id || usuario?.id || null,
    usuario?.name || usuario?.nombre || 'Caja'
  );
  return {
    aplicado: true,
    ticket: result?.ticket || ticket,
    aprobacion: result,
  };
}

async function intentarCobroDirectoComanda(ticket, opts) {
  const ok = await debeAplicarCobroDirecto(opts);
  if (!ok) return { aplicado: false, ticket };
  try {
    return await aplicarCobroDirectoComanda(ticket, opts?.usuario);
  } catch (error) {
    logger.error('Cobro directo de caja no pudo aprobar el ticket', { error: error.message });
    return { aplicado: false, ticket, error };
  }
}

module.exports = {
  rolPuedeCobroDirecto,
  configPermiteCobroDirecto,
  debeAplicarCobroDirecto,
  aplicarCobroDirectoComanda,
  intentarCobroDirectoComanda,
};
