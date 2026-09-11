/**
 * Orden de carta que ve el mozo: campo `orden` del plato (menor = más arriba).
 * Al reordenar un subconjunto (p. ej. una categoría filtrada), se fusiona
 * en las mismas posiciones del listado global para no mezclar otras categorías.
 */

function idStr(v) {
    return String(v == null ? '' : v);
}

function cmpOrdenPlato(a, b) {
    const oa = Number(a && a.orden);
    const ob = Number(b && b.orden);
    const fa = Number.isFinite(oa) ? oa : Number.MAX_SAFE_INTEGER;
    const fb = Number.isFinite(ob) ? ob : Number.MAX_SAFE_INTEGER;
    if (fa !== fb) return fa - fb;
    const ia = Number(a && a.id) || 0;
    const ib = Number(b && b.id) || 0;
    if (ia !== ib) return ia - ib;
    return String((a && a.nombre) || '').localeCompare(String((b && b.nombre) || ''), 'es');
}

function fusionarOrdenIds(ordenActualIds, idsNuevoSubconjunto) {
    const actual = (Array.isArray(ordenActualIds) ? ordenActualIds : []).map(idStr).filter(Boolean);
    const ids = (Array.isArray(idsNuevoSubconjunto) ? idsNuevoSubconjunto : []).map(idStr).filter(Boolean);
    if (!ids.length) return actual;
    const set = new Set(ids);
    const queue = [...ids];
    return actual.map((id) => (set.has(id) ? (queue.shift() || id) : id));
}

module.exports = { cmpOrdenPlato, fusionarOrdenIds, idStr };
