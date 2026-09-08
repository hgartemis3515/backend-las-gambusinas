/**
 * Tras entregar un plato ya cobrado por PPA, el estado de caja es `pagado`.
 * La transición de cocina se valida como `entregado` (salio → entregado).
 */
function platoCobradoViaPagoAdelantado(plato) {
  const pa = plato?.pagoAdelantado;
  if (!pa) return false;
  if (pa.cobrado === true) return true;
  const et = String(pa.estadoTicket || '').toLowerCase();
  return et === 'pendiente_aprobacion' || et === 'aprobado';
}

function estadoTrasCambioPlato(plato, nuevoEstado) {
  if (String(nuevoEstado || '').toLowerCase() === 'entregado' && platoCobradoViaPagoAdelantado(plato)) {
    return 'pagado';
  }
  return nuevoEstado;
}

module.exports = {
  platoCobradoViaPagoAdelantado,
  estadoTrasCambioPlato,
};
