/**
 * Elegibilidad de una línea para pago adelantado (PPA).
 * Mesa o para llevar: pedido / en_espera / recoger / salio.
 * No: entregado (caja normal), pagado, ni ya cobrado por TPA.
 */
function esPlatoElegibleParaPPA(plato) {
  if (!plato || plato.eliminado === true || plato.anulado === true) return false;
  const estado = String(plato.estado || '').toLowerCase();
  if (['entregado', 'pagado'].includes(estado)) return false;
  if (plato.pagoAdelantado?.cobrado === true) return false;
  const et = String(plato.pagoAdelantado?.estadoTicket || '').toLowerCase();
  if (et === 'pendiente_aprobacion' || et === 'aprobado') return false;
  return true;
}

module.exports = {
  esPlatoElegibleParaPPA,
};
