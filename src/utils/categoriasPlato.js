'use strict';

function sanitizarCategoriasPlato(categorias, categoriaLegacy) {
    const fromArr = Array.isArray(categorias) ? categorias : [];
    const legacy = String(categoriaLegacy || '').trim();
    const raw = fromArr.length ? fromArr : (legacy ? [legacy] : []);
    const seen = new Set();
    const out = [];
    for (const x of raw) {
        const n = String(x || '').trim();
        if (!n) continue;
        const k = n.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(n);
    }
    if (!out.length) out.push('General');
    return { categorias: out, categoria: out[0] };
}

function categoriasDePlato(p) {
    if (!p) return ['General'];
    const nested = p.plato && typeof p.plato === 'object' ? p.plato : null;
    return sanitizarCategoriasPlato(
        p.categorias || nested?.categorias,
        p.categoria || p.cat || nested?.categoria || nested?.cat
    ).categorias;
}

function platoEsDeCategoria(p, cat) {
    const target = String(cat || '').trim().toLowerCase();
    if (!target) return true;
    return categoriasDePlato(p).some((c) => c.toLowerCase() === target);
}

function filtroMongoCategoria(cat) {
    const c = String(cat || '').trim();
    if (!c) return {};
    return { $or: [{ categoria: c }, { categorias: c }] };
}

function reglaCategoriaParaPlato(reglasCat, plato) {
    const reglas = Array.isArray(reglasCat) ? reglasCat : [];
    for (const cat of categoriasDePlato(plato)) {
        const r = reglas.find((x) => String(x && x.categoria || '').trim() === cat && x.activo !== false);
        if (r) return r;
    }
    return null;
}

module.exports = {
    sanitizarCategoriasPlato,
    categoriasDePlato,
    platoEsDeCategoria,
    filtroMongoCategoria,
    reglaCategoriaParaPlato,
};
