'use strict';

const { categoriasDePlato } = require('./categoriasPlato');

const RANK_SIN_CODIGO = 10000;
const RANK_NO_NUMERICO = 1000;

function sanitizarOrdenPorTipo(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    const obj = raw instanceof Map ? Object.fromEntries(raw) : raw;
    for (const [k, v] of Object.entries(obj)) {
        const slug = String(k || '').trim();
        const n = Number(v);
        if (!slug || !Number.isFinite(n)) continue;
        out[slug] = Math.max(1, Math.min(9999, Math.round(n)));
    }
    return out;
}

function sanitizarOcultoEnTipos(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (const x of raw) {
        const s = String(x || '').trim();
        if (!s) continue;
        const k = s.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(s);
    }
    return out;
}

function codigoCategoriaRank(codigoMozo) {
    const s = String(codigoMozo || '').trim().toUpperCase();
    if (!s) return RANK_SIN_CODIGO;
    if (/^\d+$/.test(s)) return Number(s);
    return RANK_NO_NUMERICO + s.charCodeAt(0);
}

function mapaOrdenPorTipo(cat) {
    const map = (cat && cat.ordenPorTipo) || {};
    if (map instanceof Map) return Object.fromEntries(map);
    return map && typeof map === 'object' ? map : {};
}

function prioridadCategoriaEnTipo(cat, slugTipo) {
    const slug = String(slugTipo || '').trim();
    const n = Number(mapaOrdenPorTipo(cat)[slug]);
    if (slug && Number.isFinite(n)) return n;
    return codigoCategoriaRank(cat && cat.codigoMozo);
}

function categoriaVisibleEnTipo(cat, slugTipo) {
    const slug = String(slugTipo || '').trim().toLowerCase();
    if (!slug) return true;
    const list = (cat && cat.ocultoEnTipos) || [];
    return !list.some((s) => String(s || '').trim().toLowerCase() === slug);
}

function cmpCategoriasMozo(a, b, slugTipo) {
    const pa = prioridadCategoriaEnTipo(a, slugTipo);
    const pb = prioridadCategoriaEnTipo(b, slugTipo);
    if (pa !== pb) return pa - pb;
    const ca = String((a && a.codigoMozo) || '').toUpperCase();
    const cb = String((b && b.codigoMozo) || '').toUpperCase();
    if (ca !== cb) return ca.localeCompare(cb, 'es', { numeric: true });
    return String((a && a.nombre) || '').localeCompare(String((b && b.nombre) || ''), 'es');
}

function infoCategoriaPorNombre(categoriasInfo, nombre) {
    const key = String(nombre || '').trim().toLowerCase();
    if (!key) return { nombre: nombre || '', codigoMozo: '', ordenPorTipo: {}, ocultoEnTipos: [] };
    const hit = (categoriasInfo || []).find((c) => String(c && c.nombre || '').trim().toLowerCase() === key);
    return hit || { nombre, codigoMozo: '', ordenPorTipo: {}, ocultoEnTipos: [] };
}

function ordenarNombresCategoria(nombres, categoriasInfo, slugTipo) {
    return [...(nombres || [])]
        .filter((n) => categoriaVisibleEnTipo(infoCategoriaPorNombre(categoriasInfo, n), slugTipo))
        .sort((a, b) => cmpCategoriasMozo(
            infoCategoriaPorNombre(categoriasInfo, a),
            infoCategoriaPorNombre(categoriasInfo, b),
            slugTipo
        ));
}

function codigoMozoVisible(plato) {
    const m = String((plato && plato.codigoMozo) || '').trim().toUpperCase();
    if (m) return m;
    return String((plato && plato.codigo) || '').trim().toUpperCase();
}

function rankPlatoCategoria(plato, categoriasInfo, slugTipo) {
    const cats = categoriasDePlato(plato);
    let best = RANK_SIN_CODIGO + 1;
    let any = false;
    for (const n of cats) {
        const info = infoCategoriaPorNombre(categoriasInfo, n);
        if (!categoriaVisibleEnTipo(info, slugTipo)) continue;
        any = true;
        const r = prioridadCategoriaEnTipo(info, slugTipo);
        if (r < best) best = r;
    }
    return any ? best : RANK_SIN_CODIGO + 1;
}

function platoVisibleEnCarta(plato, categoriasInfo, slugTipo) {
    if (!slugTipo) return true;
    const cats = categoriasDePlato(plato);
    if (!cats.length) return true;
    return cats.some((n) => categoriaVisibleEnTipo(infoCategoriaPorNombre(categoriasInfo, n), slugTipo));
}

function cmpPlatosCategoriaYCodigo(a, b, categoriasInfo, slugTipo) {
    const ra = rankPlatoCategoria(a, categoriasInfo, slugTipo);
    const rb = rankPlatoCategoria(b, categoriasInfo, slugTipo);
    if (ra !== rb) return ra - rb;
    const cmp = codigoMozoVisible(a).localeCompare(codigoMozoVisible(b), 'es', { numeric: true, sensitivity: 'base' });
    if (cmp) return cmp;
    return String((a && a.nombre) || '').localeCompare(String((b && b.nombre) || ''), 'es');
}

function ordenarPlatosPorCategoriaYCodigo(platos, categoriasInfo, slugTipo) {
    if (!Array.isArray(platos)) return [];
    return [...platos].sort((a, b) => cmpPlatosCategoriaYCodigo(a, b, categoriasInfo, slugTipo));
}

module.exports = {
    sanitizarOrdenPorTipo,
    sanitizarOcultoEnTipos,
    codigoCategoriaRank,
    prioridadCategoriaEnTipo,
    categoriaVisibleEnTipo,
    cmpCategoriasMozo,
    ordenarNombresCategoria,
    platoVisibleEnCarta,
    cmpPlatosCategoriaYCodigo,
    ordenarPlatosPorCategoriaYCodigo,
    RANK_SIN_CODIGO,
};
