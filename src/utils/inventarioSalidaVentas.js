'use strict';

const { matchComandasEstadisticas } = require('./estadisticasComandas');
const { armarContadorPlatos, fichaDePlato } = require('./contadorPlatosReporte');
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
    '1/2 pollo a la lena baby': { rubro: 'pollo-baby', factor: 0.5 },
    'panceta de chancho lena': { rubro: 'trozo-panceta', factor: 3 },
    'chancho a la lena': { rubro: 'trozo-panceta', factor: 4 },
    'chancho a la lena bbq': { rubro: 'trozo-panceta', factor: 6 },
    'pollo de pachamanca': { rubro: 'pachamanca-pollo', factor: 1 }, // sabor Pollo: siempre Pollo pachamanca pierna
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

function esAgua(n) {
    return /\bagua\b/.test(n);
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
    if (esAgua(n)) return slugBebida(nombre, 'agua');
    return '';
}

function tipoBebidaPlato(plato) {
    const n = norm(plato && plato.nombre);
    const cat = norm([plato && plato.categoria].concat((plato && plato.categorias) || []).join(' '));
    const grupo = norm(plato && plato.grupoSos);
    if (esGaseosa(n) || grupo === 'gaseosas' || cat.includes('gaseosa')) return 'gaseosas';
    if (!n.includes('vinagre') && (esLicor(n) || grupo === 'alcohol' || cat.includes('vino') || cat.includes('licor'))) return 'licores';
    if (esAgua(n)) return 'bebidas';
    return '';
}

function indiceBebidas(catalogo) {
    const map = {};
    (catalogo || []).forEach((p) => {
        const tipo = tipoBebidaPlato(p);
        if (!tipo || !p.nombre) return;
        const prefijo = tipo === 'gaseosas' ? 'gaseosa' : (tipo === 'bebidas' ? 'agua' : 'licor');
        map[norm(p.nombre)] = claveBebida(p.nombre) || slugBebida(p.nombre, prefijo);
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

function ladoCorteLeña(nombre) {
    const n = norm(nombre);
    if (n === 'pec' || n === 'pecho' || n.includes('pechug') || n.includes('pecho')) return 'pecho';
    if (n === 'pie' || n === 'pierna' || n.includes('pierna')) return 'pierna';
    return '';
}

/**
 * El contador lista el pollo del mixto aparte del 1/4.
 * La panceta sale en su propia fila, así que aquí solo se mueve la presa.
 */
function partirMixtoContador(fila, n) {
    const cantidad = Number(fila && fila.cantidad) || 0;
    if (cantidad <= 0) return null;
    if (n === 'mixto a la lena pecho') return [{ rubro: 'pollo-lena', unidades: cantidad }];
    if (n === 'mixto a la lena pierna') return [{ rubro: 'pierna-lena', unidades: cantidad }];
    if (n === 'mixto a la lena') return [{ rubro: 'pollo-lena', unidades: cantidad }];
    return null;
}

/** Parte el 1/4 y el mix según la presa. Sin presa, sigue el mapa fijo. */
function partirLeñaPorCorte(fila) {
    const n = norm(fila && fila.nombre);
    const mixtoContador = partirMixtoContador(fila, n);
    if (mixtoContador) return mixtoContador;
    const esMix = (n.includes('mix') || n.includes('mixto')) && n.includes('lena');
    const esCuarto = n === '1/4 pollo a la lena' || n.includes('1/4 pollo') || n.includes('cuarto de pollo') || n.includes('cuarto pollo');
    if (!esMix && !esCuarto) return null;
    const cortes = (fila && fila.cortes) || {};
    const keys = Object.keys(cortes);
    if (!keys.length) return null;
    let pecho = 0;
    let pierna = 0;
    let resto = 0;
    keys.forEach((k) => {
        const q = Number(cortes[k]) || 0;
        if (q <= 0) return;
        const lado = ladoCorteLeña(k);
        if (lado === 'pecho') pecho += q;
        else if (lado === 'pierna') pierna += q;
        else resto += q;
    });
    if (!pecho && !pierna && !resto) return null;
    const out = [];
    if (pecho) out.push({ rubro: 'pollo-lena', unidades: pecho });
    if (pierna) out.push({ rubro: esMix ? 'pierna-lena' : 'pierna-pollo', unidades: pierna });
    if (resto) out.push({ rubro: 'pollo-lena', unidades: resto });
    if (esMix) {
        const piezas = pecho + pierna + resto;
        out.push({ rubro: 'trozo-panceta', unidades: piezas * 3 });
    }
    return out;
}

function rubroMenuDe(n) {
    const es = (n.includes('caldo') && n.includes('pollo'))
        || n.includes('arroz con pollo')
        || n.includes('pollo a la olla')
        || (n.includes('pollo') && n.includes('olla'));
    if (!es) return '';
    if (/(^| )pec$/.test(n)) return 'menu-pecho';
    if (/(^| )pie$/.test(n)) return 'menu-pierna';
    return 'menu-pecho';
}

function rubrosDeFila(fila, mapas, bebidas) {
    const partido = partirLeñaPorCorte(fila);
    if (partido) return partido;
    const nombre = fila && fila.nombre;
    const n = norm(nombre);
    if (n.includes('baby') && n.includes('pollo') && n.includes('lena')) {
        return [{ rubro: 'pollo-baby', factor: 0.5 }];
    }
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
    } else if (n.includes('filete junior')) add('filete-junior', 0.5);
    else if (n.includes('filete de pollo')) add('filete-pollo');
    else if (n.includes('mix') && n.includes('lena')) { add('trozo-panceta', 3); add('pollo-lena', 1); }
    else if (n.includes('chancho') && n.includes('lena') && n.includes('bbq')) add('trozo-panceta', 6);
    else if (n.includes('chancho') && n.includes('lena')) add('trozo-panceta', 4);
    else if (n.includes('chaufa') && n.includes('chancho')) add('trozo-panceta', 1);
    else if (n.includes('desayuno criollo')) add('chicharron-chancho', 0.5);
    else if (n.includes('fuente') && n.includes('chicharron') && n.includes('chancho')) add('chicharron-chancho', 2);
    else if ((n.includes('1/2') || n.includes('medio')) && n.includes('chicharron') && n.includes('chancho')) add('chicharron-chancho', 0.5);
    else if (n.includes('chicharron') && n.includes('chancho')) add('chicharron-chancho', 1);
    else if ((n.includes('ceviche') || n.includes('chicharron')) && n.includes('pota')) add('pieza-pota', 1);
    else if (n.includes('duo marino')) add('pieza-pescado', 2);
    else if (!n.includes('trucha') && (n.includes('pescado frito') || (n.includes('jalea') && n.includes('pescado')) || (n.includes('chicharron') && n.includes('pescado')) || (n.includes('ceviche') && n.includes('pescado')) || n === 'ceviche')) add('pieza-pescado', 1);
    else if ((n.includes('1/2') || n.includes('medio')) && n.includes('cuy')) add('cuy', 0.5);
    else if (n.includes('cuy')) add('cuy', 1);
    else if (!n.includes('baby') && (n.includes('1/4 pollo') || n.includes('cuarto de pollo') || n.includes('pollo a la lena'))) add('pollo-lena');
    else if (n.includes('chicharron de pollo') && n.includes('bbq')) add('chi-pollo-bbq');
    else if (n.includes('acevichada') && n.includes('pollo')) add('chi-pollo-acevichada');
    else if (n.includes('chicharron') && n.includes('pollo')) add('chicharron-pollo');
    else if (n.includes('pachamanca') && n.includes('pollo')) add('pachamanca-pollo');
    else if (n.includes('milanesa')) add('milanesa');
    else if (n.includes('chaufa') && n.includes('pollo')) add('chaufa-pollo');
    else if (n.includes('saltado') && n.includes('pollo')) add('salt-pollo');
    else if (n.includes('pan con pollo') || (n.includes('sandwich') && n.includes('pollo'))) add('sandwiches');
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
    if ((n.includes('salchipapa') || n.includes('hotdog') || n.includes('hot dog')) && !lista.some((x) => x.rubro === 'hotdog')) add('hotdog');
    const humitas = factorHumita(n);
    if (humitas && !lista.some((x) => x.rubro === 'humita')) add('humita', humitas);
    if (consumeYuca(n) && !lista.some((x) => x.rubro === 'yuca')) add('yuca');
    if (consumeInca300(n) && !lista.some((x) => x.rubro === 'gaseosa-inca-kola-300ml')) add('gaseosa-inca-kola-300ml');
    if (consumeCarneroCrudo(n) && !lista.some((x) => x.rubro === 'carnero')) add('carnero');
    if (n.includes('frugos') && !lista.some((x) => x.rubro === 'frugos-1-5l')) add('frugos-1-5l');
    const pizza = rubroPizza(n);
    if (pizza && !lista.some((x) => x.rubro === pizza)) add(pizza);
    if (esPlatoBistec(n) && !lista.some((x) => x.rubro === 'bisteck')) add('bisteck');
    if ((n === 'delicia' || n.includes('delicias')) && !lista.some((x) => x.rubro === 'delicias')) add('delicias');
    if (/\bhelados?\b/.test(n) && !lista.some((x) => x.rubro === 'helados')) add('helados');
    if ((n.includes('papa frita') || n.includes('papas fritas')) && !lista.some((x) => x.rubro === 'papas')) add('papas');
    if (n.includes('arroz con pollo')) add('arroz-tipo-pollo');
    else if (n.includes('arroz verde')) add('arroz-verde');
    else if (n.includes('arroz con mariscos') || n.includes('arroz de mariscos') || n.includes('arroz mariscos')) add('arroz-mariscos');
    else if ((n.includes('arroz chaufa') || n.includes('chaufa de arroz')) && !n.includes('pollo')) add('arroz-chaufa');
    else if (n.includes('arroz blanco')) add('arroz-blanco');
    else if (n.includes('arroz con pato') || n.includes('arroz de pato')) {
        if (!lista.some((x) => x.rubro === 'arroz-pato')) add('arroz-pato');
    } else if (/\barroz\b/.test(n) && !n.includes('chaufa') && !lista.some((x) => x.rubro === 'arroz-blanco')) {
        add('arroz-blanco');
    }
    const menu = rubroMenuDe(n);
    if (menu && !lista.some((x) => x.rubro === menu)) add(menu);
    return lista;
}

/** El plato Bistec o Bisteck. El saltado y el chaufa de bistec no entran aquí. */
function esPlatoBistec(n) {
    return n === 'bistec' || n === 'bisteck' || n.startsWith('bistec ') || n.startsWith('bisteck ');
}

/** El plato Humita. Un sabor suelto (Pollo de pachamanca) no cuenta: la humita sale del plato. */
function esPlatoHumita(n) {
    return n === 'humita' || n.startsWith('humita ');
}

/** El plato comercial (1, 2, 3 o 4 sabores, olla, cordero). No el sabor ni la fila sintética sin sabor. */
function esPlatoPachamancaNombre(n) {
    if (!n.startsWith('pachamanca')) return false;
    if (n.includes('sin sabor')) return false;
    return true;
}

/** 1 sabor = 1, 2 = 2, 3 = 3, 4 = 4. Sin número en el nombre, una. */
function saboresPachamanca(n) {
    const m = String(n || '').match(/pachamanca\s+(\d+)\s+sabor/);
    const k = m ? Number(m[1]) : 0;
    return k >= 1 ? k : 0;
}

function factorHumita(n) {
    if (esPlatoHumita(n)) return 1;
    if (!esPlatoPachamancaNombre(n)) return 0;
    return saboresPachamanca(n) || 1;
}

/** Una yuca por plato. El dúo marino y el ceviche de pota no entran. */
function consumeYuca(n) {
    if (n.includes('duo') && n.includes('marino')) return false;
    if (n.includes('ceviche') && n.includes('pota')) return false;
    if (n.includes('chicharron') && n.includes('pota')) return true;
    if (n.includes('chicharron') && n.includes('pescado')) return true;
    if (n.includes('jalea') && n.includes('pescado')) return true;
    if (n.includes('fuente') && n.includes('pollo') && !n.includes('chancho')) return true;
    if (n.includes('chicharron') && n.includes('pollo')) return true;
    if (n.includes('chicharron') && n.includes('trucha')) return true;
    if (n.includes('duo') && n.includes('truch')) return true;
    return false;
}

function consumeInca300(n) {
    if (n.includes('pollada')) return true;
    if (n.includes('milanesa') && n.includes('junior')) return true;
    if (n.includes('filete') && n.includes('junior')) return true;
    if (n.includes('arroz con pollo')) return true;
    if (n.includes('seco') && n.includes('res')) return true;
    if (n.includes('pollo') && n.includes('olla')) return true;
    return false;
}

function consumeCarneroCrudo(n) {
    return n.includes('seco') && (n.includes('carnero') || n.includes('cordero'));
}

function rubroPizza(n) {
    if (!n.includes('pizza')) return '';
    if (/30\s*x\s*30/.test(n)) return 'pizza-30x30';
    if (/20\s*x\s*20/.test(n)) return 'pizza-20x20';
    if (n.includes('grande')) return 'pizza-30x30';
    return '';
}

/**
 * Humitas según los sabores del plato, no según la pieza.
 * El contador parte la pachamanca en sabores; la cantidad sale de la línea original.
 */
function unidadesHumitaPachamanca(lineas, catalogo) {
    const porId = new Map();
    (catalogo || []).forEach((p) => {
        if (p && p._id != null) porId.set(String(p._id), p);
    });
    const detalle = [];
    let total = 0;
    (lineas || []).forEach((linea) => {
        if (!linea || linea.eliminado || linea.anulado) return;
        const id = linea.platoId || (linea.plato && (linea.plato._id || linea.plato));
        const cat = id != null ? porId.get(String(id)) : null;
        const ficha = fichaDePlato(cat || {
            nombre: linea.nombre,
            categoria: linea.categoria,
            complementos: linea.complementosCatalogo,
            complementosUnidosAlPlato: linea.complementosUnidosAlPlato
        });
        if (!ficha || ficha.tipo !== 'pachamanca') return;
        const cant = Number(linea.cantidad) > 0 ? Number(linea.cantidad) : 1;
        const factor = factorHumita(norm(ficha.nombre || linea.nombre)) || 1;
        const uso = cant * factor;
        total += uso;
        detalle.push({
            nombre: ficha.nombre || linea.nombre || 'Pachamanca',
            cantidad: uso,
            platos: cant,
            factor: factor
        });
    });
    return { total, detalle };
}

function rubroPropioDeNombre(n) {
    if (n.includes('fuente') || n.includes('filete de pollo') || n.includes('filete junior')) return '';
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
        const Corte = require('../database/models/inventarioCorte.model');
        const corte = await Corte.findOne({ clave: 'inventario' }).lean();
        const desde = corte && corte.desde ? new Date(corte.desde) : new Date(0);
        if (desde > hasta) return { movs: [], ventas: [] };
        const [comandas, catalogo] = await Promise.all([
            Comanda.find(matchComandasEstadisticas(desde, hasta))
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
            const lineas = lineasDeComanda(comanda);
            if (!comanda || !comanda.createdAt || !lineas.length) continue;
            const nro = comanda.numeroComandaDia;
            const etiqueta = nro != null && nro !== '' ? ('Comanda ' + nro) : 'Sin número';
            const partido = partirSalida(
                filasDelContador(armarContadorPlatos(lineas, catalogo)),
                etiqueta,
                mapasVenta,
                { comandaId: comanda._id, hora: comanda.createdAt, bebidas: bebidas }
            );
            const humita = unidadesHumitaPachamanca(lineas, catalogo);
            if (humita.total > 0) {
                partido.porRubro.humita = (partido.porRubro.humita || 0) + humita.total;
                const extra = humita.detalle.map((d) => ({
                    nombre: d.nombre,
                    cantidad: d.cantidad,
                    platos: d.platos,
                    factor: 1,
                    comanda: etiqueta,
                    comandaId: comanda._id ? String(comanda._id) : '',
                    hora: comanda.createdAt
                }));
                partido.detalle.humita = (partido.detalle.humita || []).concat(extra);
            }
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
    unidadesHumitaPachamanca,
    egresosVentaHasta
};
