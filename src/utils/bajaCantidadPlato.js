/**
 * Baja de cantidad al eliminar un plato.
 * Sin cantidad (o >= la línea) = se elimina la línea entera.
 * Menor = queda el resto en cantidades[index].
 * Cada baja (parcial o total, si la comanda sigue) sube revisionTicket:
 * 1 → b, 2 → c, … El ticket de cocina se reimprime con lo que queda.
 */

function planBajaLinea({ cantidadLinea, cantidadQuitar } = {}) {
  const total = Math.max(1, Math.floor(Number(cantidadLinea) || 1));
  let quitar = cantidadQuitar == null || cantidadQuitar === ''
    ? total
    : Math.floor(Number(cantidadQuitar));
  if (!Number.isFinite(quitar) || quitar <= 0) quitar = total;
  quitar = Math.min(total, quitar);
  const restante = total - quitar;
  return {
    total,
    quitar,
    restante,
    bajaTotal: restante <= 0,
  };
}

/** Body.cantidadesAEliminar: [{ index, cantidad }]. Sin entrada = línea completa. */
function mapaCantidadesAEliminar(body) {
  const map = new Map();
  const lista = body?.cantidadesAEliminar;
  if (!Array.isArray(lista)) return map;
  for (const item of lista) {
    const index = parseInt(item?.index, 10);
    const cantidad = Math.floor(Number(item?.cantidad));
    if (Number.isNaN(index) || index < 0) continue;
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
    map.set(index, cantidad);
  }
  return map;
}

/** Una baja parcial (5 → 3) también es eliminación de platos, no una edición. */
function historialCuentaComoEliminacion(h) {
  if (!h) return false;
  const estado = String(h.estado || '');
  if (estado === 'eliminado' || estado === 'eliminado-completo') return true;
  const original = Number(h.cantidadOriginal);
  const final = Number(h.cantidadFinal);
  return estado === 'modificado' && Number.isFinite(original) && Number.isFinite(final) && original > final;
}

/** Unidades dadas de baja. 5 → 3 devuelve 2. Línea entera devuelve la cantidad original. */
function unidadesEliminadasHistorial(h) {
  const explicita = Number(h?.cantidadEliminada);
  if (Number.isFinite(explicita) && explicita > 0) return explicita;
  const original = Number(h?.cantidadOriginal);
  const final = h?.cantidadFinal;
  if (Number.isFinite(original) && final != null && final !== '' && original > Number(final)) {
    return original - Number(final);
  }
  if (Number.isFinite(original) && original > 0) return original;
  const cantidad = Number(h?.cantidad);
  return Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1;
}

module.exports = {
  planBajaLinea,
  mapaCantidadesAEliminar,
  historialCuentaComoEliminacion,
  unidadesEliminadasHistorial,
};
