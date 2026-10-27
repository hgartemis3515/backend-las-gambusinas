'use strict';

const { armarKardex } = require('./inventarioKardex');

/** Productos de la tabla Kardex. `suma` arma la fila con esas piezas. */
const KARDEX = [
    { clave: 'pollo-origen', nombre: 'Pollo' },
    { clave: 'pescado-origen', nombre: 'Pescado' },
    { clave: 'filete', nombre: 'Filete' },
    { clave: 'chicharron-pollo', nombre: 'Chicharrón de pollo' },
    { clave: 'pachamanca', nombre: 'Pachamanca', suma: ['pachamanca-pollo', 'pachamanca-chancho', 'pachamanca-res', 'pachamanca-cordero'] },
    { clave: 'lomo-fino', nombre: 'Lomo fino' },
    { clave: 'trucha', nombre: 'Trucha' },
    { clave: 'bisteck', nombre: 'Bisteck' },
    { clave: 'filete-trucha', nombre: 'Filete de trucha' },
    { clave: 'ceviche', nombre: 'Ceviche' },
    { clave: 'chicharron-pescado', nombre: 'Chicharrón de pescado' },
    { clave: 'pescado-frito', nombre: 'Pescado frito' },
    { clave: 'pota', nombre: 'Pota' },
    { clave: 'yuca', nombre: 'Yuca' },
    { clave: 'pato', nombre: 'Pato' },
    { clave: 'seco-res', nombre: 'Seco de res' },
    { clave: 'cuy', nombre: 'Cuy' },
    { clave: 'chicharron-chancho', nombre: 'Chicharrón de chancho' },
    { clave: 'pollada', nombre: 'Pollada' },
    { clave: 'seco-cordero', nombre: 'Seco de carnero' },
    { clave: 'panceta', nombre: 'Panceta' },
    { clave: 'pollo-lena', nombre: 'Pollo leña' },
    { clave: 'chancho-lena', nombre: 'Chancho a la leña' },
    { clave: 'chancho-lena-bbq', nombre: 'Chancho a la leña BBQ' },
    { clave: 'humita', nombre: 'Humita' },
    { clave: 'tamal', nombre: 'Tamal' },
    { clave: 'arroz', nombre: 'Arroz' },
    { clave: 'patasca', nombre: 'Patasca' },
    { clave: 'salt-bistec', nombre: 'Salt de bistec' },
    { clave: 'salt-pollo', nombre: 'Salt de pollo' },
    { clave: 'chaufa-pollo', nombre: 'Chaufa de pollo' },
    { clave: 'chaufa-bistec', nombre: 'Chaufa de bistec' },
    { clave: 'chaufa-chancho', nombre: 'Chaufa de chancho' },
    { clave: 'milanesa', nombre: 'Milanesa' },
    { clave: 'milanesa-junior', nombre: 'Milanesa junior' },
    { clave: 'filete-junior', nombre: 'Filete junior' },
    { clave: 'chi-pollo-bbq', nombre: 'Chi. pollo a la BBQ' },
    { clave: 'chi-pollo-acevichada', nombre: 'Chi. pollo acevichada' },
    { clave: 'pachamanca-1s', nombre: 'Pachamanca 1S' },
    { clave: 'pachamanca-2s', nombre: 'Pachamanca 2S' },
    { clave: 'pachamanca-3s', nombre: 'Pachamanca 3S' },
    { clave: 'pachamanca-4s', nombre: 'Pachamanca 4S' },
    { clave: 'chicha-trucha', nombre: 'Chicha de trucha' },
    { clave: 'ceviche-trucha', nombre: 'Ceviche de trucha' },
    { clave: 'duo-marino', nombre: 'Duo marino' },
    { clave: 'duo-truchero', nombre: 'Duo truchero' },
    { clave: 'chicha-pescado', nombre: 'Chicha de pescado' },
    { clave: 'jalea-pescado', nombre: 'Jalea de pescado' },
    { clave: 'chicha-pota', nombre: 'Chicha de pota' },
    { clave: 'mix-lena', nombre: 'Mix leña' },
    { clave: 'arroz-pollo', nombre: 'Arroz con pollo' },
    { clave: 'pollo-olla', nombre: 'Pollo a la olla' }
];

const PIEZAS = [
    { clave: 'pachamanca-pollo', nombre: 'Pollo' },
    { clave: 'pachamanca-chancho', nombre: 'Chancho' },
    { clave: 'pachamanca-res', nombre: 'Res' },
    { clave: 'pachamanca-cordero', nombre: 'Cordero' },
    { clave: 'presas-arroz-pollo', nombre: 'Presas de arroz con pollo' },
    { clave: 'presas-pollo-olla', nombre: 'Presas de pollo a la olla' },
    { clave: 'pollo-origen', nombre: 'Pollo' },
    { clave: 'pescado-origen', nombre: 'Pescado' },
    { clave: 'bubu', nombre: 'Bubu' },
    { clave: 'sr-juan', nombre: 'Sr Juan' },
    { clave: 'pachamanca-dist', nombre: 'Pachamanca' },
    { clave: 'menu', nombre: 'Menu' },
    { clave: 'sandwiches', nombre: 'Sandwiches' },
    { clave: 'beata', nombre: 'Beata' },
    { clave: 'evento', nombre: 'Evento' },
    { clave: 'tollo-origen', nombre: 'Pescado Tollo' },
    { clave: 'perico-origen', nombre: 'Pescado Perico o ojo de uva' }
];

const GRUPOS = [
    {
        id: 'pachamanca',
        nombre: 'Pachamanca',
        hijos: ['pachamanca-pollo', 'pachamanca-chancho', 'pachamanca-res', 'pachamanca-cordero']
    },
    {
        id: 'pollo',
        nombre: 'Pollo',
        hijos: ['pollada', 'presas-arroz-pollo', 'presas-pollo-olla', 'pollo-lena']
    },
    {
        id: 'pescado',
        nombre: 'Pescado',
        hijos: ['ceviche', 'chicharron-pescado', 'pescado-frito']
    },
    {
        id: 'panceta',
        nombre: 'Panceta',
        panceta: true,
        hijos: ['panceta']
    }
];

const EN_GRUPO = new Set(GRUPOS.flatMap((g) => g.hijos).concat(['pachamanca']));

function nombreDe(clave) {
    const k = KARDEX.find((x) => x.clave === clave);
    if (k && !k.suma) return k.nombre;
    const p = PIEZAS.find((x) => x.clave === clave);
    if (p) return p.nombre;
    const directo = KARDEX.find((x) => x.clave === clave);
    return directo ? directo.nombre : '';
}

function clavesGuardables() {
    const map = new Map();
    KARDEX.forEach((k) => { if (!k.suma) map.set(k.clave, k.nombre); });
    PIEZAS.forEach((p) => map.set(p.clave, p.nombre));
    return Array.from(map, ([clave, nombre]) => ({ clave, nombre }));
}

function claveDe(clave) {
    return clavesGuardables().find((c) => c.clave === clave) || null;
}

function filasDeRubros(movimientos, desde, hasta, umbralPorClave) {
    const defs = clavesGuardables();
    const platos = defs.map((d) => ({
        _id: d.clave,
        id: 0,
        nombre: d.nombre,
        isActive: true,
        alertaCritica: (umbralPorClave && umbralPorClave[d.clave]) || { crudo: 0, cocido: 0 }
    }));
    const movs = (movimientos || []).map((m) => ({
        plato: m.rubro,
        tipoProducto: m.tipoProducto,
        clase: m.clase,
        cantidad: m.cantidad,
        fecha: m.fecha
    }));
    return armarKardex(platos, movs, desde, hasta).map((f) => ({ ...f, rubro: f.plato }));
}

function ceroFila(clave, tipo, nombre) {
    return {
        rubro: clave,
        nombre: nombre || nombreDe(clave),
        tipoProducto: tipo,
        saldoInicial: 0,
        ingresos: 0,
        total: 0,
        egreso: 0,
        saldoFinal: 0,
        regulacion: 0,
        baja: 0,
        conteo: null,
        tieneConteo: false,
        umbral: 0,
        critico: false
    };
}

function sumarFilas(filas) {
    const base = {
        saldoInicial: 0, ingresos: 0, total: 0, egreso: 0, saldoFinal: 0, regulacion: 0, baja: 0
    };
    (filas || []).forEach((f) => {
        Object.keys(base).forEach((k) => { base[k] += Number(f[k]) || 0; });
    });
    return base;
}

function sueltos() {
    return KARDEX.filter((k) => !k.suma && !EN_GRUPO.has(k.clave));
}

function carta() {
    return {
        kardex: KARDEX.map((k) => ({ clave: k.clave, nombre: k.nombre, suma: k.suma || null })),
        grupos: GRUPOS.map((g) => ({
            id: g.id,
            nombre: g.nombre,
            panceta: g.panceta === true,
            hijos: g.hijos.map((clave) => ({ clave, nombre: nombreDe(clave) }))
        })),
        sueltos: sueltos().map((k) => ({ clave: k.clave, nombre: k.nombre })),
        opciones: clavesGuardables()
    };
}

module.exports = {
    KARDEX,
    GRUPOS,
    claveDe,
    clavesGuardables,
    filasDeRubros,
    ceroFila,
    sumarFilas,
    carta
};
