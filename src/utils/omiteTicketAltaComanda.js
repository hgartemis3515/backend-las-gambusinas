/**
 * Al crear una comanda, caja no necesita ticket de aprobación
 * si no hay cobro (0 soles) o si la comanda es solo DCH.
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function claveDch(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function esTextoDch(s) {
  const k = claveDch(s);
  if (!k) return false;
  if (k === 'dch') return true;
  return k.startsWith('dch ') || k.startsWith('dch-');
}

function esPlatoDch(plato) {
  if (!plato || typeof plato !== 'object') return false;
  const cat = plato.plato && typeof plato.plato === 'object' && !Array.isArray(plato.plato)
    ? plato.plato
    : null;
  return [
    cat?.nombreCocina,
    cat?.nombre,
    cat?.codigo,
    plato.nombreCocina,
    plato.nombre,
    plato.nombreCocinaPedido,
    plato.codigo,
  ].some(esTextoDch);
}

function platosActivosComanda(comanda) {
  return (comanda?.platos || []).filter((p) => p && p.eliminado !== true && p.anulado !== true);
}

function precioLinea(plato, comanda, index) {
  const cat = plato?.plato && typeof plato.plato === 'object' ? plato.plato : null;
  const precio = Number(plato?.precioUnitario ?? plato?.precio ?? cat?.precio) || 0;
  const cant = Number(plato?.cantidad ?? comanda?.cantidades?.[index] ?? 1) || 1;
  return precio * cant;
}

function netoComandaAlta(comanda) {
  let brutoLineas = 0;
  platosActivosComanda(comanda).forEach((p, i) => {
    brutoLineas += precioLinea(p, comanda, i);
  });
  brutoLineas = round2(brutoLineas);
  const desc = Number(comanda?.montoDescuento) || 0;
  const calc = Number(comanda?.totalCalculado);
  if (brutoLineas <= 0.009 && (!Number.isFinite(calc) || calc <= 0.009)) return 0;
  if (Number.isFinite(calc) && calc > 0.009) return round2(calc);
  return round2(Math.max(0, brutoLineas - desc));
}

function comandaEsSoloDch(comanda) {
  const activos = platosActivosComanda(comanda);
  return activos.length > 0 && activos.every(esPlatoDch);
}

function comandaEsCostoCeroAlta(comanda) {
  return netoComandaAlta(comanda) <= 0.009;
}

/**
 * No generar ticket de alta: pago omitido, total 0, o todos los platos son DCH.
 */
function comandaOmiteTicketAlta(comanda) {
  if (!comanda) return true;
  if (comanda.omitirPago === true) return true;
  if (comandaEsSoloDch(comanda)) return true;
  if (comandaEsCostoCeroAlta(comanda)) return true;
  return false;
}

module.exports = {
  esPlatoDch,
  comandaEsSoloDch,
  comandaEsCostoCeroAlta,
  comandaOmiteTicketAlta,
};
