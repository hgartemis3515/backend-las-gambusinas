/**
 * Espera (minutos) entre salió de cocina y entrega automática al comensal.
 * 0 = al instante (comportamiento anterior). Default 15.
 */

function minutosEntregaAutomaticaMozos(config) {
  const n = Number(config?.mozos?.entregaAutomaticaMinutos);
  if (!Number.isFinite(n) || n < 0) return 15;
  return Math.min(180, Math.floor(n));
}

function parseTiempoMs(value) {
  if (value == null || value === '') return NaN;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return NaN;
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'object') {
    if (value.$date != null) return parseTiempoMs(value.$date);
    if (typeof value.toDate === 'function') {
      try {
        return parseTiempoMs(value.toDate());
      } catch (_) {
        return NaN;
      }
    }
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function msRestantesEntregaAutomatica(plato, minutos, now = Date.now()) {
  const mins = Number(minutos);
  if (!Number.isFinite(mins) || mins <= 0) return 0;
  const duration = Math.min(180, Math.floor(mins)) * 60 * 1000;
  const raw = parseTiempoMs(plato?.tiempos?.salio);
  if (!Number.isFinite(raw) || raw > now + 2000) return duration;
  return Math.max(0, Math.min(duration, raw + duration - now));
}

/** Sin `tiempos.salio` o marca >2s en el futuro (TZ/reloj): hay que persistir `ahora`. */
function tiempoSalioRequiereReparacion(plato, now = Date.now()) {
  const raw = parseTiempoMs(plato?.tiempos?.salio);
  if (!Number.isFinite(raw)) return true;
  return raw > now + 2000;
}

async function obtenerMinutosEntregaAutomaticaMozos() {
  const ConfiguracionSistema = require('../database/models/configuracionSistema.model');
  const cfg = await ConfiguracionSistema.findById('configuracion_unica').lean();
  return minutosEntregaAutomaticaMozos(cfg);
}

module.exports = {
  minutosEntregaAutomaticaMozos,
  obtenerMinutosEntregaAutomaticaMozos,
  parseTiempoMs,
  msRestantesEntregaAutomatica,
  tiempoSalioRequiereReparacion
};
