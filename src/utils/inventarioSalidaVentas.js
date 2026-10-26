'use strict';

const moment = require('moment-timezone');
const { matchComandasEstadisticas } = require('./estadisticasComandas');
const { armarContadorPlatos } = require('./contadorPlatosReporte');
const { ymdCalendario } = require('./diaOperativoRestaurante');
const { claveDe } = require('./inventarioRubros');
const logger = require('./logger');

const ZONA = 'America/Lima';

/**
 * Fila del contador de reportes → rubro de inventario.
 * Factor 1: una unidad vendida es una unidad de salida.
 * El medio pollo a la leña cuenta 1 hasta que el negocio diga si son 2 cuartos.
 * Chancho a la leña y el BBQ son rubros distintos.
 */
const MAPA_SALIDA = {
    '1/4 pollo a la lena': { rubro: 'pollo-lena', factor: 1 },
    '1/2 pollo a la lena baby': { rubro: 'pollo-lena', factor: 1 },
    'panceta de chancho lena': { rubro: 'panceta', factor: 1 },
    'chancho a la lena': { rubro: 'chancho-lena', factor: 1 },
    'chancho a la lena bbq': { rubro: 'chancho-lena-bbq', factor: 1 },
    'pollo de pachamanca': { rubro: 'pachamanca-pollo', factor: 1 },
    'cerdo de pachamanca': { rubro: 'pachamanca-chancho', factor: 1 },
    'res de pachamanca': { rubro: 'pachamanca-res', factor: 1 },
    'carnero de pachamanca': { rubro: 'pachamanca-cordero', factor: 1 }
};

function norm(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function filasDelContador(contador) {
    if (!contador) return [];
    return []
        .concat(contador.pollos || [])
        .concat(contador.carnes || [])
        .concat(contador.platos || []);
}

function partirSalida(filas, comanda) {
    const porRubro = {};
    const detalle = {};
    const etiqueta = String(comanda || '');
    const sumar = (rubro, nombre, cantidad) => {
        if (!rubro || !nombre || !cantidad) return;
        if (!detalle[rubro]) detalle[rubro] = {};
        const key = etiqueta + '\0' + nombre;
        if (!detalle[rubro][key]) detalle[rubro][key] = { nombre, cantidad: 0, comanda: etiqueta };
        detalle[rubro][key].cantidad += cantidad;
    };
    for (const fila of filas || []) {
        const mapa = MAPA_SALIDA[norm(fila && fila.nombre)];
        const cantidad = Number(fila && fila.cantidad) || 0;
        if (!mapa || cantidad <= 0) continue;
        const n = cantidad * mapa.factor;
        porRubro[mapa.rubro] = (porRubro[mapa.rubro] || 0) + n;
        const fuentes = fila && fila.fuentes && typeof fila.fuentes === 'object' ? fila.fuentes : null;
        const nombres = fuentes ? Object.keys(fuentes) : [];
        if (nombres.length) {
            nombres.forEach((nombre) => {
                sumar(mapa.rubro, nombre, (Number(fuentes[nombre]) || 0) * mapa.factor);
            });
        } else {
            sumar(mapa.rubro, fila.nombre, n);
        }
    }
    const listas = {};
    Object.keys(detalle).forEach((rubro) => {
        listas[rubro] = Object.keys(detalle[rubro]).map((key) => detalle[rubro][key]);
    });
    return { porRubro, detalle: listas };
}

function aplicarMapa(filas) {
    return partirSalida(filas).porRubro;
}

function fechaEnDia(ymd) {
    return moment.tz(String(ymd), 'YYYY-MM-DD', ZONA).hour(12).minute(0).second(0).millisecond(0).toDate();
}

function lineasDeComanda(comanda) {
    const lineas = [];
    (comanda.platos || []).forEach((p, i) => {
        if (!p || p.eliminado || p.anulado) return;
        const ref = p.plato && typeof p.plato === 'object' ? p.plato : null;
        const cant = Number(p.cantidad) > 0 ? Number(p.cantidad) : (Number(comanda.cantidades?.[i]) || 1);
        lineas.push({
            platoId: ref ? ref._id : p.plato,
            nombre: p.nombre || ref?.nombre || 'Sin nombre',
            cantidad: cant,
            soles: Number(p.subtotal) || 0,
            complementos: p.complementosSeleccionados || []
        });
    });
    return lineas;
}

/**
 * Egresos de venta hasta `hasta`, partidos por día operativo.
 * No se guardan: el kardex los suma y, si la comanda se anula, desaparecen.
 */
async function egresosVentaHasta(hasta) {
    try {
        const Comanda = require('../database/models/comanda.model');
        const Plato = require('../database/models/plato.model');
        const [comandas, catalogo] = await Promise.all([
            Comanda.find(matchComandasEstadisticas(new Date(0), hasta))
                .select('platos cantidades createdAt numeroComandaDia')
                .populate('platos.plato', 'nombre nombreCocina categoria complementos complementosUnidosAlPlato precio')
                .lean(),
            Plato.find({ isActive: { $ne: false } })
                .select('nombre nombreCocina categoria complementos complementosUnidosAlPlato')
                .lean()
        ]);
        const porDia = new Map();
        for (const comanda of comandas || []) {
            if (!comanda || !comanda.createdAt) continue;
            const ymd = ymdCalendario(comanda.createdAt);
            if (!lineasDeComanda(comanda).length) continue;
            if (!porDia.has(ymd)) porDia.set(ymd, []);
            porDia.get(ymd).push(comanda);
        }
        const movs = [];
        const ventas = [];
        for (const [ymd, lista] of porDia) {
            const porRubro = {};
            const detalle = {};
            lista.forEach((comanda) => {
                const nro = comanda.numeroComandaDia;
                const etiqueta = nro != null && nro !== '' ? ('Comanda ' + nro) : 'Sin número';
                const partido = partirSalida(
                    filasDelContador(armarContadorPlatos(lineasDeComanda(comanda), catalogo)),
                    etiqueta
                );
                Object.keys(partido.porRubro).forEach((rubro) => {
                    porRubro[rubro] = (porRubro[rubro] || 0) + partido.porRubro[rubro];
                    if (!detalle[rubro]) detalle[rubro] = [];
                    detalle[rubro] = detalle[rubro].concat(partido.detalle[rubro] || []);
                });
            });
            const fecha = fechaEnDia(ymd);
            Object.keys(porRubro).forEach((rubro) => {
                const cantidad = porRubro[rubro];
                if (!cantidad) return;
                const def = claveDe(rubro);
                movs.push({
                    rubro,
                    tipoProducto: 'cocido',
                    clase: 'egreso',
                    cantidad,
                    fecha
                });
                ventas.push({
                    rubro,
                    nombre: def ? def.nombre : rubro,
                    cantidad,
                    fecha,
                    motivo: 'Venta (reportes)',
                    detalle: detalle[rubro] || []
                });
            });
        }
        return { movs, ventas };
    } catch (error) {
        logger.warn('No se pudo cruzar ventas de reportes con inventario', { error: error.message });
        return { movs: [], ventas: [] };
    }
}

module.exports = {
    MAPA_SALIDA,
    norm,
    aplicarMapa,
    partirSalida,
    filasDelContador,
    egresosVentaHasta
};
