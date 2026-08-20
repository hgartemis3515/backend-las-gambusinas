/**
 * Unifica nombres de complemento: "Papa frita" y "Papas fritas" son la misma clave.
 * Debe coincidir con appcocina/src/utils/nombreComplementoCanonico.js
 */

const CLAVES_CONTADOR_DEFAULT = ['arroz', 'papa frita', 'ensalada'];
const ETIQUETAS_CONTADOR_DEFAULT = {
    arroz: 'Arroz',
    'papa frita': 'Papa frita',
    ensalada: 'Ensalada',
};
const MAX_CLAVES_CONTADOR = 3;

function extraerNombreOpcion(op) {
    if (op == null) return '';
    if (typeof op === 'string') return op.trim();
    return String(op.nombre || op.opcion || '').trim();
}

function extraerPronombreOpcion(op) {
    if (op == null || typeof op === 'string') return '';
    return String(op.pronombre || '').trim().slice(0, 40);
}

function claveNombreComplemento(nombre) {
    const raw = String(nombre || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    if (!raw) return '';
    return raw
        .replace(/[^a-z0-9ñ\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
        .join(' ');
}

function masFrecuente(map) {
    let best = '';
    let bestN = -1;
    for (const [nombre, n] of map.entries()) {
        if (!nombre) continue;
        if (n > bestN) {
            best = nombre;
            bestN = n;
        } else if (n === bestN && nombre.length < best.length) {
            best = nombre;
        }
    }
    return best;
}

function sugerirNombreCanonico(variantes) {
    const map = new Map();
    for (const v of variantes || []) {
        const nombre = typeof v === 'string' ? v : (v && v.nombre);
        const n = Number((v && v.total) != null ? v.total : 1) || 1;
        const key = String(nombre || '').trim();
        if (!key) continue;
        map.set(key, (map.get(key) || 0) + n);
    }
    return masFrecuente(map);
}

function tituloDesdeClave(k) {
    return String(k || '')
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function normalizarClavesContador(claves) {
    let list = claves;
    if (list == null) list = CLAVES_CONTADOR_DEFAULT;
    if (typeof list === 'string') list = list.split(/[,|]/);
    if (!Array.isArray(list)) list = CLAVES_CONTADOR_DEFAULT;
    const seen = new Set();
    const out = [];
    for (const c of list) {
        const raw = typeof c === 'string' ? c : (c && (c.clave || c.nombre));
        const k = claveNombreComplemento(raw);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(k);
        if (out.length >= MAX_CLAVES_CONTADOR) break;
    }
    return out;
}

function contarGuarnicionesPorNombre(filas, opts = {}) {
    const conPronombre = opts.conPronombre === true;
    const map = new Map();
    for (const fila of Array.isArray(filas) ? filas : []) {
        const nombre = extraerNombreOpcion(fila && fila.nombre != null ? fila.nombre : fila) || '';
        const clave = claveNombreComplemento(nombre);
        if (!clave) continue;
        const qty = Number(fila && fila.cantidad) || 1;
        let g = map.get(clave);
        if (!g) {
            g = { clave, qty: 0, nombres: new Map(), pronombres: new Map() };
            map.set(clave, g);
        }
        g.qty += qty;
        const nomKey = nombre.trim() || clave;
        g.nombres.set(nomKey, (g.nombres.get(nomKey) || 0) + qty);
        const pron = String((fila && fila.pronombre) || '').trim();
        if (pron) g.pronombres.set(pron, (g.pronombres.get(pron) || 0) + qty);
    }
    const todas = [...map.values()]
        .map((g) => {
            const etiqueta = conPronombre
                ? (masFrecuente(g.pronombres) || masFrecuente(g.nombres))
                : masFrecuente(g.nombres);
            return { clave: g.clave, nombre: etiqueta, cantidad: g.qty };
        })
        .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es'));

    if (opts.claves === undefined) return todas;
    const etiquetas = opts.etiquetas && typeof opts.etiquetas === 'object' ? opts.etiquetas : {};
    const claves = normalizarClavesContador(opts.claves);
    const byClave = new Map(todas.map((r) => [r.clave, r]));
    return claves.map((k) => {
        const hit = byClave.get(k);
        const nombre = etiquetas[k]
            || ETIQUETAS_CONTADOR_DEFAULT[k]
            || (hit && hit.nombre)
            || tituloDesdeClave(k);
        return { clave: k, nombre, cantidad: hit ? hit.cantidad : 0 };
    });
}

function textoContadorGuarniciones(filas) {
    return (Array.isArray(filas) ? filas : [])
        .map((f) => `${f.nombre} x${f.cantidad}`)
        .join(', ');
}

module.exports = {
    CLAVES_CONTADOR_DEFAULT,
    ETIQUETAS_CONTADOR_DEFAULT,
    MAX_CLAVES_CONTADOR,
    extraerNombreOpcion,
    extraerPronombreOpcion,
    claveNombreComplemento,
    sugerirNombreCanonico,
    normalizarClavesContador,
    contarGuarnicionesPorNombre,
    textoContadorGuarniciones,
};
