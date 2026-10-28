'use strict';

const TIPOS = new Set(['despiece', 'directo', 'manual']);

const SEMILLA = [
    {
        id: 'pollo-fresco',
        nombre: 'Pollo fresco',
        tipo: 'despiece',
        origen: { clave: 'pollo-origen', nombre: 'Pollo fresco' },
        cortes: [
            { clave: 'pechuga-pollo', nombre: 'Pechuga de Pollo', factor: 2, factorDesde: '' },
            { clave: 'pierna-pollo', nombre: 'Pierna de Pollo', factor: 2, factorDesde: '' },
            { clave: 'filete', nombre: 'Filete desde pechuga', factor: 2, factorDesde: 'pechuga-pollo' },
            { clave: 'filete', nombre: 'Filete desde pierna', factor: 0, factorDesde: 'pierna-pollo' }
        ],
        platos: [
            { id: 'filete_pollo', nombre: 'Filete de Pollo', complemento: '', cuelgaDe: 'filete', cantidad: 1, venta: true, aliases: ['filete de pollo'] },
            { id: 'milanesa', nombre: 'Milanesa de pollo', complemento: '', cuelgaDe: 'filete', cantidad: 1, venta: true, aliases: ['milanesa'] },
            { id: 'filete_junior', nombre: 'Filete junior', complemento: '', cuelgaDe: 'filete', cantidad: 0.5, venta: true, aliases: ['filete junior'] },
            { id: 'fuente_chi', nombre: 'Fuente de Chicharrón de pollo', complemento: '', cuelgaDe: 'filete', cantidad: 2, venta: true, aliases: ['fuente chicharron pollo', 'fuente de chicharron pollo'] },
            { id: 'chaufa_pollo', nombre: 'Arroz chaufa de pollo', complemento: '', cuelgaDe: 'filete', cantidad: 1, venta: true, aliases: ['chaufa de pollo', 'chaufa pollo'] },
            { id: 'chi_pollo_acevichada', nombre: 'Chicharrón de pollo acevichada', complemento: '', cuelgaDe: 'filete', cantidad: 1, venta: true, aliases: ['chicharron acevichado', 'chicharron acevichada'] },
            { id: 'chi_pollo_bbq', nombre: 'Chicharrón de pollo a la BBQ', complemento: '', cuelgaDe: 'filete', cantidad: 1, venta: true, aliases: ['chicharron bbq', 'chicharron de pollo bbq'] },
            { id: 'chi_chico', nombre: 'Chicharrón de pollo chico', complemento: '', cuelgaDe: 'filete', cantidad: 1, venta: true, aliases: ['chicharron de pollo chico', 'chicharron pollo chico'] },
            { id: 'salt_pollo', nombre: 'Lomo saltado de pollo', complemento: '', cuelgaDe: 'filete', cantidad: 1, venta: true, aliases: ['lomo saltado pollo', 'saltado de pollo'] },
            { id: 'pollada', nombre: 'Pollada', complemento: '', cuelgaDe: 'pechuga-pollo', cantidad: 1, venta: false, aliases: [] },
            { id: 'pollada', nombre: 'Pollada', complemento: '', cuelgaDe: 'pierna-pollo', cantidad: 1, venta: false, aliases: [] },
            { id: 'pollo_pachamanca', nombre: 'Pollo pachamanca', complemento: '', cuelgaDe: 'pechuga-pollo', cantidad: 1, venta: false, aliases: [] },
            { id: 'pollo_pachamanca', nombre: 'Pollo pachamanca', complemento: '', cuelgaDe: 'pierna-pollo', cantidad: 1, venta: false, aliases: [] },
            { id: 'pollo_lena', nombre: 'Pollo leña', complemento: '', cuelgaDe: 'pechuga-pollo', cantidad: 1, venta: false, aliases: [] },
            { id: 'pollo_lena', nombre: 'Pollo leña', complemento: '', cuelgaDe: 'pierna-pollo', cantidad: 1, venta: false, aliases: [] },
            { id: 'menu', nombre: 'Menú', complemento: '', cuelgaDe: 'pechuga-pollo', cantidad: 1, venta: false, aliases: [] },
            { id: 'menu', nombre: 'Menú', complemento: '', cuelgaDe: 'pierna-pollo', cantidad: 1, venta: false, aliases: [] }
        ]
    },
    {
        id: 'panceta',
        nombre: 'Panceta',
        tipo: 'manual',
        origen: { clave: 'panceta', nombre: 'Panceta entera' },
        cortes: [{ clave: 'trozo-panceta', nombre: 'Trozo de panceta', factor: 0, factorDesde: '' }],
        platos: []
    },
    {
        id: 'carnero',
        nombre: 'Carnero',
        tipo: 'despiece',
        origen: { clave: 'carnero', nombre: 'Carnero crudo' },
        cortes: [{ clave: 'pachamanca-cordero', nombre: 'Carnero pachamanca', factor: 1, factorDesde: '' }],
        platos: []
    },
    {
        id: 'arroz',
        nombre: 'Arroz',
        tipo: 'despiece',
        origen: { clave: 'arroz', nombre: 'Arroz crudo' },
        cortes: [
            { clave: 'arroz-tipo-pollo', nombre: 'Arroz pollo', factor: 1, factorDesde: '' },
            { clave: 'arroz-blanco', nombre: 'Arroz blanco', factor: 1, factorDesde: '' },
            { clave: 'arroz-pato', nombre: 'Arroz pato', factor: 1, factorDesde: '' }
        ],
        platos: []
    },
    {
        id: 'carnes-directo',
        nombre: 'Carnes, trucha y pescado entero',
        tipo: 'directo',
        origen: { clave: 'bisteck', nombre: 'Carnes' },
        cortes: [],
        platos: []
    },
    {
        id: 'pescado-trans',
        nombre: 'Pescado',
        tipo: 'despiece',
        origen: { clave: 'pescado-entero', nombre: 'Pescado' },
        cortes: [],
        platos: []
    },
    {
        id: 'pato-fresco',
        nombre: 'Pato fresco',
        tipo: 'despiece',
        origen: { clave: 'pato', nombre: 'Pato fresco' },
        cortes: [
            { clave: 'pechuga-pato', nombre: 'Pechuga de pato', factor: 2, factorDesde: '' },
            { clave: 'pierna-pato', nombre: 'Pierna de pato', factor: 2, factorDesde: '' }
        ],
        platos: [
            { id: 'arroz_pato_pecho', nombre: 'Arroz con pato', complemento: 'pecho', cuelgaDe: 'pechuga-pato', cantidad: 1, venta: true, aliases: ['arroz con pato', 'arroz de pato'] },
            { id: 'arroz_pato_pierna', nombre: 'Arroz con pato', complemento: 'pierna', cuelgaDe: 'pierna-pato', cantidad: 1, venta: true, aliases: ['arroz con pato', 'arroz de pato'] }
        ]
    },
    {
        id: 'pota',
        nombre: 'Pota',
        tipo: 'directo',
        origen: { clave: 'pota', nombre: 'Pota' },
        cortes: [],
        platos: [
            { id: 'ceviche_pota', nombre: 'Ceviche de chicharrón de pota', complemento: '', cuelgaDe: 'pota', cantidad: 1, venta: true, aliases: ['ceviche de chicharron de pota', 'ceviche chicharron pota'] },
            { id: 'chicharron_pota', nombre: 'Chicharrón de pota', complemento: '', cuelgaDe: 'pota', cantidad: 1, venta: true, aliases: ['chicharron de pota'] }
        ]
    }
];

function norm(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function slug(s) {
    return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function palabras(s) {
    return norm(s).split(/[^a-z0-9]+/).filter((w) => w && !['de', 'la', 'el', 'los', 'las', 'con', 'y', 'a'].includes(w));
}

function palabraCubre(texto, patron) {
    if (texto === patron) return true;
    if (texto.length >= 7 && patron.length >= 7 && texto.slice(0, 7) === patron.slice(0, 7)) return true;
    return false;
}

function patronCubre(texto, patron) {
    const tw = palabras(texto);
    const pw = palabras(patron);
    if (!pw.length) return 0;
    if (!pw.every((w) => tw.some((t) => palabraCubre(t, w)))) return 0;
    return pw.length;
}

function semilla() {
    return JSON.parse(JSON.stringify(SEMILLA));
}

function sanearMapa(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const nombre = String(raw.nombre || '').trim().slice(0, 80);
    if (!nombre) return null;
    const tipo = TIPOS.has(raw.tipo) ? raw.tipo : 'directo';
    const id = slug(raw.id || nombre);
    if (!id) return null;
    const origenClave = String(raw.origen && raw.origen.clave || '').trim().slice(0, 60);
    const origenNombre = String(raw.origen && raw.origen.nombre || nombre).trim().slice(0, 80);
    if (!origenClave || !origenNombre) return null;
    const cortes = (Array.isArray(raw.cortes) ? raw.cortes : []).map((c) => ({
        clave: String(c && c.clave || '').trim().slice(0, 60),
        nombre: String(c && c.nombre || '').trim().slice(0, 80),
        factor: Number(c && c.factor) > 0 ? Number(c.factor) : 0,
        factorDesde: String(c && c.factorDesde || '').trim().slice(0, 60)
    })).filter((c) => c.clave && c.nombre);
    const platos = (Array.isArray(raw.platos) ? raw.platos : []).map((p, i) => {
        const nombrePlato = String(p && p.nombre || '').trim().slice(0, 120);
        const cantidad = Number(p && p.cantidad);
        return {
            id: slug(p && p.id) || (slug(nombrePlato) + '-' + i),
            nombre: nombrePlato,
            complemento: String(p && p.complemento || '').trim().slice(0, 80),
            cuelgaDe: String(p && p.cuelgaDe || origenClave).trim().slice(0, 60),
            cantidad: cantidad > 0 ? cantidad : 0,
            venta: p && p.venta === true,
            aliases: (Array.isArray(p && p.aliases) ? p.aliases : []).map((a) => String(a).trim().slice(0, 80)).filter(Boolean).slice(0, 6)
        };
    }).filter((p) => p.nombre && p.cantidad > 0 && p.cuelgaDe);
    return {
        id,
        nombre,
        tipo,
        origen: { clave: origenClave, nombre: origenNombre },
        cortes,
        platos
    };
}

function sanearLista(lista) {
    const vistos = new Set();
    const out = [];
    (Array.isArray(lista) ? lista : []).forEach((raw) => {
        const mapa = sanearMapa(raw);
        if (!mapa || vistos.has(mapa.id)) return;
        vistos.add(mapa.id);
        out.push(mapa);
    });
    return out;
}

function clavesExtra(mapas) {
    const out = [];
    const vistos = new Set();
    const push = (clave, nombre) => {
        if (!clave || !nombre || vistos.has(clave)) return;
        vistos.add(clave);
        out.push({ clave, nombre });
    };
    (mapas || []).forEach((m) => {
        if (!m || !m.origen) return;
        push(m.origen.clave, m.origen.nombre);
        (m.cortes || []).forEach((c) => push(c.clave, c.nombre));
    });
    return out;
}

function platosVenta(mapas) {
    const lista = [];
    (mapas || []).forEach((m) => {
        (m.platos || []).forEach((p) => {
            if (p && p.venta === true) lista.push(p);
        });
    });
    return lista;
}

function complementoPresente(fila, complemento) {
    const c = norm(complemento);
    if (!c) return true;
    const texto = norm([fila && fila.nombre, fila && fila.detalle].filter(Boolean).join(' '));
    if (texto.includes(c)) return true;
    return Object.keys((fila && fila.cortes) || {}).some((k) => {
        const nk = norm(k);
        return nk === c || nk.includes(c) || (c.length >= 4 && c.includes(nk));
    });
}

function puntaje(fila, plato) {
    const texto = [fila && fila.nombre, fila && fila.detalle].filter(Boolean).join(' ');
    const patrones = [plato.nombre].concat(plato.aliases || []);
    let best = 0;
    patrones.forEach((patron) => {
        const n = patronCubre(texto, patron);
        if (n > best) best = n;
    });
    if (!best) return 0;
    if (!complementoPresente(fila, plato.complemento)) return 0;
    return best;
}

function consumoDeFila(fila, mapas) {
    const hits = [];
    platosVenta(mapas).forEach((plato) => {
        const score = puntaje(fila, plato);
        if (score) hits.push({ plato, score });
    });
    if (!hits.length) return [];
    const max = hits.reduce((a, h) => Math.max(a, h.score), 0);
    const top = hits.filter((h) => h.score === max);
    const cortes = (fila && fila.cortes) || {};
    const clavesCorte = Object.keys(cortes);
    if (top.length > 1 && top.every((h) => h.plato.complemento) && clavesCorte.length) {
        const out = [];
        clavesCorte.forEach((k) => {
            const hit = top.find((h) => complementoPresente({ nombre: k, cortes: { [k]: cortes[k] } }, h.plato.complemento));
            const qty = Number(cortes[k]) || 0;
            if (!hit || qty <= 0) return;
            out.push({ rubro: hit.plato.cuelgaDe, unidades: qty * Number(hit.plato.cantidad) });
        });
        return out;
    }
    const uno = top.slice().sort((a, b) => (b.plato.complemento ? 1 : 0) - (a.plato.complemento ? 1 : 0))[0];
    if (top.length > 1 && uno.plato.complemento) {
        const fino = top.filter((h) => complementoPresente(fila, h.plato.complemento));
        if (fino.length === 1) {
            return [{ rubro: fino[0].plato.cuelgaDe, factor: Number(fino[0].plato.cantidad) || 1 }];
        }
        return [];
    }
    return [{ rubro: uno.plato.cuelgaDe, factor: Number(uno.plato.cantidad) || 1 }];
}

async function leerGuardados() {
    const Modelo = require('../database/models/inventarioMapa.model');
    const doc = await Modelo.findOne({ clave: 'hoja' }).lean();
    if (!doc) return semilla();
    return sanearLista(doc.mapas);
}

module.exports = {
    SEMILLA,
    semilla,
    sanearLista,
    sanearMapa,
    clavesExtra,
    consumoDeFila,
    leerGuardados,
    norm
};
