/**
 * Normaliza una opción de complemento/guarnición para persistir.
 * Incluye preselección para Órdenes (mozos) y variaciones (ej. Ensalada → Limón).
 */

function normalizarVariacionesOpcion(list) {
  if (!Array.isArray(list)) return [];
  const vistos = new Set();
  const out = [];
  for (const v of list) {
    const nombre = typeof v === 'string' ? String(v).trim() : String(v?.nombre || '').trim();
    if (!nombre) continue;
    const key = nombre.toLowerCase();
    if (vistos.has(key)) continue;
    vistos.add(key);
    const p = Number(typeof v === 'object' && v != null ? v.precio : 0);
    out.push({
      nombre,
      precio: Number.isFinite(p) && p > 0 ? p : 0,
    });
  }
  return out;
}

function normalizarOpcionDocumento(op) {
  if (op == null) return null;
  let nombre = '';
  let precio = 0;
  let pronombre = '';
  let preseleccionada = false;
  let cantidadPreseleccion = 1;
  let variaciones = [];
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
    variaciones = normalizarVariacionesOpcion(op.variaciones);
  } else {
    nombre = String(op).trim();
  }
  if (!nombre) return null;
  return { nombre, precio, pronombre, preseleccionada, cantidadPreseleccion, variaciones };
}

module.exports = { normalizarOpcionDocumento, normalizarVariacionesOpcion };
