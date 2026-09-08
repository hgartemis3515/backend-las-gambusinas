/**
 * Espera (minutos) entre salió de cocina y entrega automática al comensal.
 * 0 = al instante (comportamiento anterior). Default 15.
 */
function minutosEntregaAutomaticaMozos(config) {
  const n = Number(config?.mozos?.entregaAutomaticaMinutos);
  if (!Number.isFinite(n) || n < 0) return 15;
  return Math.min(180, Math.floor(n));
}

async function obtenerMinutosEntregaAutomaticaMozos() {
  const ConfiguracionSistema = require('../database/models/configuracionSistema.model');
  const cfg = await ConfiguracionSistema.findById('configuracion_unica').lean();
  return minutosEntregaAutomaticaMozos(cfg);
}

module.exports = {
  minutosEntregaAutomaticaMozos,
  obtenerMinutosEntregaAutomaticaMozos
};
