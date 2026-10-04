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

module.exports = { planBajaLinea, mapaCantidadesAEliminar };
