'use strict';

const { matchComandasEstadisticas } = require('./estadisticasComandas');
const { armarContadorPlatos } = require('./contadorPlatosReporte');
const { claveDe } = require('./inventarioRubros');
const { semilla, consumoDeFila, leerGuardados } = require('./inventarioMapas');
const logger = require('./logger');

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
    'cerdo pachamanca': { rubro: 'pachamanca-chancho', factor: 1 },
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

function esGaseosa(n) {
    return /gaseosa|inca kola|inkakola|coca[- ]?cola|sprite|fanta|guarana/.test(n);
}

function esLicor(n) {
    return /\b(vino|vinos|cerveza|pisco|ron|whisky|whiskey|vodka|chilcano|tequila|sangria|licor|licores|gin)\b/.test(n) && !n.includes('vinagre');
}

function slugBebida(nombre, prefijo) {
    const n = norm(nombre);
    const s = n.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'bebida';
    return prefijo + '-' + s;
}

function claveBebida(nombre) {
    const n = norm(nombre);
    if (esGaseosa(n)) return slugBebida(nombre, 'gaseosa');
    if (esLicor(n)) return slugBebida(nombre, 'licor');
    return '';
}

function tipoBebidaPlato(plato) {
    const n = norm(plato && plato.nombre);
    const cat = norm([plato && plato.categoria].concat((plato && plato.categorias) || []).join(' '));
    const grupo = norm(plato && plato.grupoSos);
    if (esGaseosa(n) || grupo === 'gaseosas' || cat.includes('gaseosa')) return 'gaseosas';
    if (!n.includes('vinagre') && (esLicor(n) || grupo === 'alcohol' || cat.includes('vino') || cat.includes('licor'))) return 'licores';
    return '';
}

function indiceBebidas(catalogo) {
    const map = {};
    (catalogo || []).forEach((p) => {
        const tipo = tipoBebidaPlato(p);
        if (!tipo || !p.nombre) return;
        map[norm(p.nombre)] = claveBebida(p.nombre) || slugBebida(p.nombre, tipo === 'gaseosas' ? 'gaseosa' : 'licor');
    });
    return map;
}

function filasDelContador(contador) {
    if (!contador) return [];
    const bebidas = (contador.guarniciones || [])
        .filter((g) => g && claveBebida(g.nombre))
        .map((g) => ({ nombre: g.nombre, cantidad: g.cantidad }));
    return []
        .concat(contador.pollos || [])
        .concat(contador.carnes || [])
        .concat(contador.platos || [])
        .concat(bebidas);
}

function partirSalida(filas, comanda, mapasVenta, meta) {
    const porRubro = {};
    const detalle = {};
    const etiqueta = String(comanda || '');
    const sumar = (rubro, nombre, cantidad, platos, factor) => {
        if (!rubro || !nombre || !cantidad) return;
        if (!detalle[rubro]) detalle[rubro] = {};
        const key = etiqueta + '\0' + nombre;
        if (!detalle[rubro][key]) {
            detalle[rubro][key] = {
                nombre,
                cantidad: 0,
                platos: 0,
                factor: Number(factor) > 0 ? Number(factor) : 1,
                comanda: etiqueta,
                comandaId: meta && meta.comandaId ? String(meta.comandaId) : '',
                hora: meta && meta.hora ? meta.hora : null
            };
        }
        detalle[rubro][key].cantidad += cantidad;
        detalle[rubro][key].platos += Number(platos) || 0;
    };
    for (const fila of filas || []) {
        const mapas = rubrosDeFila(fila, mapasVenta, meta && meta.bebidas);
        const cantidad = Number(fila && fila.cantidad) || 0;
        if (!mapas.length || cantidad <= 0) continue;
        const fuentes = fila && fila.fuentes && typeof fila.fuentes === 'object' ? fila.fuentes : null;
        const nombres = fuentes ? Object.keys(fuentes) : [];
        mapas.forEach((mapa, idx) => {
            const n = mapa.unidades != null ? Number(mapa.unidades) : cantidad * (Number(mapa.factor) || 1);
            const factorFuente = mapa.unidades != null ? (cantidad > 0 ? n / cantidad : 0) : (Number(mapa.factor) || 1);
            porRubro[mapa.rubro] = (porRubro[mapa.rubro] || 0) + n;
            if (idx === 0 && nombres.length) {
                nombres.forEach((nombre) => {
                    const platos = Number(fuentes[nombre]) || 0;
                    sumar(mapa.rubro, nombre, platos * factorFuente, platos, factorFuente);
                });
            } else {
                const factor = Number(mapa.factor) > 0 ? Number(mapa.factor) : 1;
                const platos = Number(mapa.factor) > 0 ? cantidad : n;
                sumar(mapa.rubro, fila.nombre, n, platos, factor);
            }
        });
    }
    const listas = {};
    Object.keys(detalle).forEach((rubro) => {
        listas[rubro] = Object.keys(detalle[rubro]).map((key) => detalle[rubro][key]);
    });
    return { porRubro, detalle: listas };
}

function rubrosDeFila(fila, mapas, bebidas) {
    const nombre = fila && fila.nombre;
    const n = norm(nombre);
    const directo = MAPA_SALIDA[n];
    if (directo) return [directo];
    const lista = [];
    const add = (rubro, factor, unidades) => {
        const item = { rubro: rubro };
        if (unidades != null) item.unidades = unidades;
        else item.factor = factor || 1;
        lista.push(item);
    };
    const delMapa = consumoDeFila(fila || { nombre: nombre }, mapas || semilla());
    if (delMapa.length) {
        delMapa.forEach((item) => {
            if (item.unidades != null) add(item.rubro, null, item.unidades);
            else add(item.rubro, item.factor);
        });
    } else if (n.includes('filete de pollo')) add('filete');
    else if (n.includes('1/4 pollo') || n.includes('cuarto de pollo') || n.includes('pollo a la lena')) add('pollo-lena');
    else if (n.includes('chicharron de pollo') && n.includes('bbq')) add('chi-pollo-bbq');
    else if (n.includes('acevichada') && n.includes('pollo')) add('chi-pollo-acevichada');
    else if (n.includes('chicharron') && n.includes('pollo')) add('chicharron-pollo');
    else if (n.includes('pachamanca') && n.includes('pollo')) add('pachamanca-pollo');
    else if (n.includes('milanesa')) add('milanesa');
    else if (n.includes('chaufa') && n.includes('pollo')) add('chaufa-pollo');
    else if (n.includes('saltado') && n.includes('pollo')) add('salt-pollo');
    else if (n.includes('pan con pollo')) add('menu');
    else if (n.includes('pollada')) add('pollada');
    else if (n.includes('tamal')) add('tamal');
    else if (bebidas && bebidas[n]) add(bebidas[n]);
    else if (claveBebida(nombre)) add(claveBebida(nombre));
    const propio = rubroPropioDeNombre(n);
    if (propio) {
        for (let i = 0; i < lista.length; i++) {
            if (lista[i].rubro === 'filete') lista[i] = Object.assign({}, lista[i], { rubro: propio });
        }
    }
    if ((n.includes('papa frita') || n.includes('papas fritas')) && !lista.some((x) => x.rubro === 'papas')) add('papas');
    if (n.includes('arroz verde')) add('arroz-verde');
    else if (n.includes('arroz con mariscos') || n.includes('arroz de mariscos') || n.includes('arroz mariscos')) add('arroz-mariscos');
    else if ((n.includes('arroz chaufa') || n.includes('chaufa de arroz')) && !n.includes('pollo')) add('arroz-chaufa');
    else if (n.includes('arroz blanco')) add('arroz-blanco');
    else if (n.includes('arroz con pato') || n.includes('arroz de pato')) {
        if (!lista.some((x) => x.rubro === 'arroz-pato')) add('arroz-pato');
    } else if (/\barroz\b/.test(n) && !n.includes('chaufa') && !n.includes('arroz con pollo') && !lista.some((x) => x.rubro === 'arroz-tipo-pollo')) {
        add('arroz-tipo-pollo');
    }
    return lista;
}

function rubroPropioDeNombre(n) {
    if (n.includes('fuente') || n.includes('filete de pollo')) return '';
    if (n.includes('filete junior')) return 'filete-junior';
    if (n.includes('saltado') && n.includes('pollo')) return 'salt-pollo';
    if (n.includes('chaufa') && n.includes('pollo')) return 'chaufa-pollo';
    if (n.includes('milanesa junior')) return 'milanesa-junior';
    if (n.includes('milanesa')) return 'milanesa';
    if (n.includes('chicharron') && n.includes('pollo') && n.includes('bbq')) return 'chi-pollo-bbq';
    if (n.includes('acevichad') && n.includes('pollo')) return 'chi-pollo-acevichada';
    if (n.includes('chicharron') && n.includes('pollo')) return 'chicharron-pollo';
    return '';
}

function rubrosDeNombre(nombre, mapas) {
    return rubrosDeFila({ nombre: nombre }, mapas);
}

function aplicarMapa(filas, mapas, bebidas) {
    return partirSalida(filas, '', mapas, { bebidas: bebidas }).porRubro;
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
                .select('nombre nombreCocina categoria categorias grupoSos complementos complementosUnidosAlPlato')
                .lean()
        ]);
        const movs = [];
        const ventas = [];
        let mapasVenta = semilla();
        try {
            mapasVenta = await leerGuardados();
        } catch (errorMapa) {
            logger.warn('Inventario usa los mapas de semilla', { error: errorMapa.message });
        }
        const bebidas = indiceBebidas(catalogo);
        for (const comanda of comandas || []) {
            if (!comanda || !comanda.createdAt || !lineasDeComanda(comanda).length) continue;
            const nro = comanda.numeroComandaDia;
            const etiqueta = nro != null && nro !== '' ? ('Comanda ' + nro) : 'Sin número';
            const partido = partirSalida(
                filasDelContador(armarContadorPlatos(lineasDeComanda(comanda), catalogo)),
                etiqueta,
                mapasVenta,
                { comandaId: comanda._id, hora: comanda.createdAt, bebidas: bebidas }
            );
            Object.keys(partido.porRubro).forEach((rubro) => {
                const cantidad = partido.porRubro[rubro];
                if (!cantidad) return;
                const def = claveDe(rubro);
                ventas.push({
                    rubro,
                    nombre: def ? def.nombre : rubro,
                    cantidad,
                    fecha: comanda.createdAt,
                    motivo: 'Venta (reportes)',
                    detalle: partido.detalle[rubro] || []
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
    rubrosDeNombre,
    partirSalida,
    filasDelContador,
    indiceBebidas,
    egresosVentaHasta
};
