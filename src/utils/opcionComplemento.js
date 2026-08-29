/**
 * Normaliza una opción de complemento/guarnición para persistir.
 * Incluye preselección para Órdenes (mozos).
 */
function normalizarOpcionDocumento(op) {
  if (op == null) return null;
  let nombre = '';
  let precio = 0;
  let pronombre = '';
  let preseleccionada = false;
  let cantidadPreseleccion = 1;
  if (typeof op === 'string') {
    nombre = op.trim();
  } else if (typeof op === 'object') {
    nombre = String(op.nombre || '').trim();
    const p = Number(op.precio);
    precio = Number.isFinite(p) && p > 0 ? p : 0;
    pronombre = String(op.pronombre || '').trim().slice(0, 40);
    preseleccionada = op.preseleccionada === true;
    const n = Number(op.cantidadPreseleccion);
    cantidadPreseleccion = Number.isFinite(n) && n >= 1 ? Math.min(99, Math.floor(n)) : 1;
  } else {
    nombre = String(op).trim();
  }
  if (!nombre) return null;
  return { nombre, precio, pronombre, preseleccionada, cantidadPreseleccion };
}

module.exports = { normalizarOpcionDocumento };
