/**
 * Mesa en servicio: solo el mozo de la comanda más antigua puede seguir operándola.
 * pendiente_aprobar no estaba en el chequeo del mapa; otro mozo creaba comanda (1227/1230).
 */

const ESTADOS_MESA_SOLO_DUENO = [
  'pedido',
  'preparado',
  'entregado',
  'pagado',
  'pagando',
  'pendiente_aprobar',
  'pendiente_pago',
  'reportado',
  'esperando',
];

function idMozo(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'object') {
    if (v._id != null) return String(v._id);
    if (typeof v.toString === 'function') {
      const s = v.toString();
      if (/^[a-f0-9]{24}$/i.test(s)) return s;
    }
    return '';
  }
  return String(v);
}

function mesaExigeDueno(estado) {
  return ESTADOS_MESA_SOLO_DUENO.includes(String(estado || '').toLowerCase());
}

function comandasVigentes(comandas) {
  return (comandas || []).filter((c) => {
    if (!c || c.eliminada === true || c.IsActive === false) return false;
    const st = String(c.status || '').toLowerCase();
    return st !== 'cancelado' && st !== 'anulado';
  });
}

function comandaDuena(comandas) {
  const vigentes = comandasVigentes(comandas);
  if (!vigentes.length) return null;
  return vigentes.slice().sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime() || 0;
    const tb = new Date(b.createdAt || 0).getTime() || 0;
    if (ta !== tb) return ta - tb;
    return (Number(a.comandaNumber) || 0) - (Number(b.comandaNumber) || 0);
  })[0];
}

/**
 * @returns {null | { statusCode: number, message: string }}
 */
function rechazoOtroMozo({ estadoMesa, origenCreacion, mozoSolicitante, comandas }) {
  if (origenCreacion === 'dashboard') return null;
  if (!mesaExigeDueno(estadoMesa)) return null;
  const duena = comandaDuena(comandas);
  if (!duena) return null;
  const duenoId = idMozo(duena.mozos);
  const yo = idMozo(mozoSolicitante);
  if (!duenoId || !yo || duenoId === yo) return null;
  const nombre = duena.mozoNombre || 'asignado';
  const etiqueta = String(estadoMesa || '').replace(/_/g, ' ');
  return {
    statusCode: 403,
    message: `Solo el mozo ${nombre} puede atender esta mesa (${etiqueta}).`,
  };
}

function mozoEstaEnComandas(comandas, mozoId) {
  const yo = idMozo(mozoId);
  if (!yo) return false;
  return comandasVigentes(comandas).some((c) => idMozo(c.mozos) === yo);
}

module.exports = {
  ESTADOS_MESA_SOLO_DUENO,
  idMozo,
  mesaExigeDueno,
  comandaDuena,
  mozoEstaEnComandas,
  rechazoOtroMozo,
};
