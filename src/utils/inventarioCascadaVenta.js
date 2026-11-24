'use strict';

const MATERIAS = ['pollo-origen', 'pechuga-pollo', 'pierna-pollo', 'filete', 'octavo-pollo'];

const NOMBRE_MATERIA = {
    'pollo-origen': 'Pollo fresco',
    'pechuga-pollo': 'Pecho de Pollo',
    'pierna-pollo': 'Pierna de Pollo',
    filete: 'Filete de pollo',
    'octavo-pollo': 'Octavo de pollo'
};

const SEMILLA = {
    pollada: { tieneCocido: false, reservaClave: '' },
    menu: { tieneCocido: false, reservaClave: '' },
    'menu-pecho': { tieneCocido: false, reservaClave: '' },
    'menu-pierna': { tieneCocido: false, reservaClave: '' },
    sandwiches: { tieneCocido: true, reservaClave: 'pechuga-pollo' },
    'pollo-lena': { tieneCocido: true, reservaClave: '' },
    'pierna-lena': { tieneCocido: true, reservaClave: '' },
    'pachamanca-pollo': { tieneCocido: true, reservaClave: 'pierna-pollo' },
    'pachamanca-chancho': { tieneCocido: true, reservaClave: '' },
    'pachamanca-res': { tieneCocido: true, reservaClave: '' },
    'pachamanca-cordero': { tieneCocido: true, reservaClave: '' },
    carnero: { tieneCocido: true, reservaClave: '' },
    'seco-cordero': { tieneCocido: true, reservaClave: '' },
    'pachamanca-pollo-pecho': { tieneCocido: true, reservaClave: 'pechuga-pollo' },
    'salt-pollo': { tieneCocido: false, reservaClave: 'filete' },
    'chaufa-pollo': { tieneCocido: false, reservaClave: 'filete' },
    milanesa: { tieneCocido: false, reservaClave: 'filete' },
    'filete-pollo': { tieneCocido: false, reservaClave: 'filete' },
    'filete-junior': { tieneCocido: false, reservaClave: 'filete' },
    'chicharron-pollo': { tieneCocido: false, reservaClave: 'filete' },
    'trozo-panceta': { tieneCocido: false, reservaClave: '' },
    'pechuga-pato': { tieneCocido: true, reservaClave: '' },
    'pierna-pato': { tieneCocido: true, reservaClave: '' },
    'pollo-baby': { tieneCocido: true, reservaClave: '' },
    'milanesa-junior': { tieneCocido: false, reservaClave: 'filete' },
    'chi-pollo-bbq': { tieneCocido: false, reservaClave: 'filete' },
    'chi-pollo-acevichada': { tieneCocido: false, reservaClave: 'filete' },
    'arroz-pollo': { tieneCocido: true, reservaClave: '' },
    'pollo-olla': { tieneCocido: true, reservaClave: '' },
    'caldo-pollo': { tieneCocido: true, reservaClave: '' }
};

function esMateria(clave) {
    return MATERIAS.indexOf(String(clave || '')) !== -1;
}

/** Filas que solo manejan crudo aunque la configuración diga otra cosa. */
const SOLO_CRUDO = [
    'milanesa', 'milanesa-junior', 'filete-junior', 'salt-pollo', 'chaufa-pollo',
    'chicharron-pollo', 'chi-pollo-bbq', 'chi-pollo-acevichada'
];

/** Productos con un solo stock: la venta resta su crudo y no pasa por cocido ni reserva. */
function esStockGeneral(clave) {
    const c = String(clave || '');
    return c === 'helados' || c === 'delicias' || c === 'yuca' || c === 'cuy' || c === 'bisteck'
        || c === 'lomo-fino' || c === 'carne-guiso' || c === 'seco-res' || c === 'humita'
        || c === 'trucha' || c === 'filete-trucha' || c === 'pieza-pescado' || c === 'filete'
        || c.indexOf('frugos') === 0 || c.indexOf('pizza') === 0
        || c.indexOf('gaseosa-') === 0 || c.indexOf('licor-') === 0 || c.indexOf('agua-') === 0;
}

/**
 * Qué tipos de stock tiene un producto en la hoja. Es la misma regla que
 * aplicarOpcionesCocido en inventario.html: la prueba inventario-hoja las compara fila por fila.
 */
function perfilRubro(clave, opcion) {
    const c = String(clave || '');
    const base = opcion && typeof opcion.tieneCocido === 'boolean' ? opcion : semillaCocido(c);
    let tieneCocido = !esMateria(c) && SOLO_CRUDO.indexOf(c) === -1 && base.tieneCocido === true;
    let soloCocido = false;
    if (c === 'pierna-lena' || c === 'pollo-baby') tieneCocido = true;
    if (c === 'panceta') tieneCocido = false;
    if (c === 'tira-panceta' || c === 'trozo-panceta' || c === 'tamal-chancho' || c === 'tamal-pollo') {
        tieneCocido = false;
        soloCocido = true;
    }
    if (esStockGeneral(c)) {
        tieneCocido = false;
        soloCocido = false;
    }
    if (c === 'arroz-blanco' || c === 'arroz-verde') {
        tieneCocido = false;
        soloCocido = true;
    }
    if (c === 'carnero') tieneCocido = true;
    if (c === 'menu' || c === 'menu-pecho' || c === 'menu-pierna') tieneCocido = false;
    if (c === 'arroz-pollo' || c === 'pollo-olla' || c === 'caldo-pollo') tieneCocido = true;
    if (c === 'seco-cordero' || c === 'pachamanca-pollo-pecho' || c === 'pachamanca-pollo') tieneCocido = true;
    if (c === 'pollada') {
        tieneCocido = true;
        soloCocido = false;
    }
    return { tieneCocido, soloCocido };
}

/** Cubeta real de un movimiento: sin cuadro de cocido, crudo y cocido son el mismo stock. */
function cubetaDe(perfil, tipo) {
    if (perfil && perfil.soloCocido) return 'cocido';
    if (!perfil || !perfil.tieneCocido) return 'crudo';
    return tipo === 'cocido' ? 'cocido' : 'crudo';
}

/**
 * Reservas que no son piezas de pollo. El seco de carnero, si no tiene cocido ni crudo propio,
 * gasta el Carnero Crudo (primero su cocido, después su crudo).
 */
const RESERVAS_CON_COCIDO = ['carnero'];

function esReservaValida(clave) {
    return esMateria(clave) || RESERVAS_CON_COCIDO.indexOf(String(clave || '')) !== -1;
}

function semillaCocido(clave) {
    const s = SEMILLA[clave];
    if (!s || esMateria(clave)) return { tieneCocido: false, reservaClave: '' };
    return { tieneCocido: s.tieneCocido === true, reservaClave: s.reservaClave || '' };
}

function esMixPechoLena(venta) {
    const nombres = [];
    if (venta && venta.nombre) nombres.push(venta.nombre);
    (venta && venta.detalle || []).forEach((d) => { if (d && d.nombre) nombres.push(d.nombre); });
    return nombres.some((nombre) => {
        const n = String(nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!((n.includes('mix') || n.includes('mixto')) && n.includes('lena'))) return false;
        if (n.includes('pierna') || /(^| )pie$/.test(n)) return false;
        return true;
    });
}

function cadenaMixPechoLena() {
    return [
        { rubro: 'pollo-lena', tipo: 'cocido' },
        { rubro: 'pollo-lena', tipo: 'crudo' },
        { rubro: 'pechuga-pollo', tipo: 'crudo' }
    ];
}

/** Platos de Pecho y Pierna: la venta solo baja el cocido del plato, nunca la pieza. Pollada no entra: si no hay cocido, baja su propio crudo. */
const PLATOS_POLLO_SOLO_COCIDO = [
    'pierna-lena', 'pachamanca-pollo',
    'pollo-lena', 'sandwiches', 'pachamanca-pollo-pecho'
];

function platoPolloSoloCocido(clave) {
    return PLATOS_POLLO_SOLO_COCIDO.indexOf(String(clave || '')) !== -1;
}

/** Arroz blanco y arroz verde + pato nacen cocidos al transformar. No tienen crudo. */
function arrozPorcionCocida(rubro) {
    return rubro === 'arroz-blanco' || rubro === 'arroz-verde';
}

function tipoProductoDe(rubro, tipo) {
    if (arrozPorcionCocida(rubro)) return 'cocido';
    return tipo === 'cocido' ? 'cocido' : 'crudo';
}

function esPlatoOctavoVenta(rubro) {
    return rubro === 'arroz-pollo' || rubro === 'pollo-olla' || rubro === 'caldo-pollo';
}

function cadenaDe(rubro, opciones) {
    const op = opciones || {};
    if (esMateria(rubro) || rubro === 'panceta') return [{ rubro: rubro, tipo: 'crudo' }];
    if (rubro === 'pollada') return [{ rubro: 'pollada', tipo: 'cocido' }, { rubro: 'pollada', tipo: 'crudo' }];
    if (esPlatoOctavoVenta(rubro) || platoPolloSoloCocido(rubro) || rubro === 'trozo-panceta' || rubro === 'tira-panceta' || rubro === 'tamal-chancho' || rubro === 'tamal-pollo' || arrozPorcionCocida(rubro)) return [{ rubro: rubro, tipo: 'cocido' }];
    // Con el cuadro de cocido activo, la venta solo baja ese cocido. No toca el crudo ni el producto principal.
    if (op.tieneCocido) return [{ rubro: rubro, tipo: 'cocido' }];
    const cadena = [{ rubro: rubro, tipo: 'crudo' }];
    if (op.reservaClave && esMateria(op.reservaClave)) {
        cadena.push({ rubro: op.reservaClave, tipo: 'crudo' });
    } else if (op.reservaClave && RESERVAS_CON_COCIDO.indexOf(op.reservaClave) !== -1) {
        cadena.push({ rubro: op.reservaClave, tipo: 'cocido' });
        cadena.push({ rubro: op.reservaClave, tipo: 'crudo' });
    }
    return cadena;
}

/**
 * Sabor Pollo de la pachamanca: gasta los cocidos (pierna y pecho pachamanca),
 * después los crudos y, si no alcanza, la Pierna de Pollo.
 */
function cadenaPachamancaPollo() {
    return [
        { rubro: 'pachamanca-pollo', tipo: 'cocido' },
        { rubro: 'pachamanca-pollo-pecho', tipo: 'cocido' },
        { rubro: 'pachamanca-pollo', tipo: 'crudo' },
        { rubro: 'pachamanca-pollo-pecho', tipo: 'crudo' },
        { rubro: 'pierna-pollo', tipo: 'crudo' }
    ];
}

function repartirVenta(cantidad, cadena, bases) {
    const resultado = [];
    let falta = Math.max(0, Number(cantidad) || 0);
    if (!falta || !cadena || !cadena.length) return resultado;
    for (let i = 0; i < cadena.length && falta > 0; i++) {
        const eslabon = cadena[i];
        const key = eslabon.rubro + '|' + eslabon.tipo;
        if (i === cadena.length - 1) {
            bases[key] = (Number(bases[key]) || 0) - falta;
            resultado.push({ rubro: eslabon.rubro, tipo: eslabon.tipo, cantidad: falta });
            falta = 0;
        } else {
            const disponible = Math.max(0, Number(bases[key]) || 0);
            if (disponible > 0) {
                const toma = Math.min(falta, disponible);
                bases[key] = (Number(bases[key]) || 0) - toma;
                falta -= toma;
                resultado.push({ rubro: eslabon.rubro, tipo: eslabon.tipo, cantidad: toma });
            }
        }
    }
    return resultado;
}

function nombreUso(origen, parte) {
    if (!parte) return 'Crudo';
    if (parte.rubro !== origen) return 'Principal — ' + (NOMBRE_MATERIA[parte.rubro] || parte.rubro);
    return parte.tipo === 'cocido' ? 'Cocido' : 'Crudo';
}

/**
 * Reparte las líneas de plato de una venta entre sus partes, sin repetir ninguna.
 * Antes cada parte volvía a leer desde la primera línea: un plato salía dos veces y otro no salía.
 */
function repartirDetalle(detalle, cantidades) {
    if (!Array.isArray(detalle) || !detalle.length || typeof detalle[0] !== 'object') return cantidades.map(() => []);
    if (cantidades.length === 1) {
        const total = detalle.reduce((a, d) => a + (Number(d && d.cantidad) || 0), 0);
        if (!(total > 0) || Math.abs(total - cantidades[0]) < 0.001) return [detalle.map((d) => Object.assign({}, d))];
    }
    const pendientes = detalle.map((d) => ({ d, queda: Number(d && d.cantidad) || 0 }));
    return cantidades.map((cantidad) => {
        let falta = Number(cantidad) || 0;
        const salida = [];
        for (const p of pendientes) {
            if (falta <= 0.000001) break;
            if (p.queda <= 0.000001) continue;
            const toma = Math.min(falta, p.queda);
            p.queda -= toma;
            falta -= toma;
            const factor = Number(p.d && p.d.factor) > 0 ? Number(p.d.factor) : 1;
            salida.push(Object.assign({}, p.d, { cantidad: toma, platos: toma / factor }));
        }
        return salida;
    });
}

function detalleParaParte(detalle, cantidadParte) {
    if (!(cantidadParte > 0)) return [];
    return repartirDetalle(detalle, [cantidadParte])[0];
}

/** Orden en que una venta busca stock. Cada eslabón es { rubro, tipo }. */
function cadenaDeVenta(venta, opcion) {
    const rubro = venta.rubro || venta.plato;
    const op = opcion || semillaCocido(rubro);
    const pancetaCruda = rubro === 'panceta';
    const stockGeneral = esStockGeneral(rubro);
    const soloCocido = !stockGeneral && rubro !== 'pollada' && !pancetaCruda && (op.tieneCocido === true || esPlatoOctavoVenta(rubro) || platoPolloSoloCocido(rubro) || rubro === 'trozo-panceta' || rubro === 'tira-panceta' || arrozPorcionCocida(rubro));
    const mixPecho = !soloCocido && rubro === 'pollo-lena' && esMixPechoLena(venta);
    const pachaPollo = !soloCocido && rubro === 'pachamanca-pollo';
    let cadena;
    if (rubro === 'pollada') cadena = [{ rubro: 'pollada', tipo: 'cocido' }, { rubro: 'pollada', tipo: 'crudo' }];
    else if (stockGeneral) cadena = [{ rubro: rubro, tipo: 'crudo' }];
    else if (rubro === 'filete-junior') cadena = [{ rubro: 'filete', tipo: 'crudo' }];
    else if (pancetaCruda) cadena = [{ rubro: rubro, tipo: 'crudo' }];
    else if (soloCocido) cadena = [{ rubro: rubro, tipo: 'cocido' }];
    else if (mixPecho) cadena = cadenaMixPechoLena();
    else if (pachaPollo) cadena = cadenaPachamancaPollo();
    else cadena = cadenaDe(rubro, op);
    if (!pancetaCruda && !stockGeneral && rubro !== 'filete-junior' && !soloCocido && !mixPecho && !pachaPollo && cadena[0].tipo !== 'cocido') {
        cadena = [{ rubro: rubro, tipo: 'cocido' }].concat(cadena);
    }
    return cadena;
}

/** Filas de venta que salen de repartir una venta: una por parte y, si otro producto la cubrió, la del plato. */
function registrosDeVenta(venta, opcion, partes) {
    const rubro = venta.rubro || venta.plato;
    const op = opcion || semillaCocido(rubro);
    const pancetaCruda = rubro === 'panceta';
    const detalles = repartirDetalle(venta.detalle, partes.map((p) => p.cantidad));
    const algunaLocal = partes.some((p) => p.rubro === rubro);
    const out = [];
    let cubierta = 0;
    partes.forEach((p, i) => {
        if (p.rubro !== rubro) cubierta += p.cantidad;
        out.push({
            rubro: p.rubro,
            origen: rubro,
            nombre: venta.nombre,
            cantidad: p.cantidad,
            fecha: venta.fecha,
            motivo: venta.motivo,
            detalle: detalles[i] || [],
            tipoProducto: p.tipo,
            usoNombre: nombreUso(rubro, p),
            sinSaldo: false
        });
    });
    if (cubierta > 0) {
        out.push({
            rubro: rubro,
            origen: rubro,
            nombre: venta.nombre,
            cantidad: cubierta,
            fecha: venta.fecha,
            motivo: venta.motivo,
            detalle: algunaLocal ? [] : detalleParaParte(venta.detalle, cubierta),
            tipoProducto: pancetaCruda ? 'crudo' : (op.tieneCocido ? 'cocido' : 'crudo'),
            usoNombre: algunaLocal ? '' : nombreUso(rubro, partes[partes.length - 1]),
            sinSaldo: true
        });
    }
    return out;
}

/**
 * Cuánto y de qué stock resta una línea de venta en la hoja.
 * Filete de la carta y filete junior salen del filete crudo. Milanesa junior va por su pieza.
 * null = no entra al inventario.
 */
function normalizarVenta(v) {
    let rubro = v && (v.rubro || v.plato);
    if (!rubro || rubro === 'milanesa-junior' || rubro === 'milanesa_junior' || v.codigo === 'T643') return null;
    let n = Number(v.cantidad) || 0;
    let tipo = v.tipoProducto === 'crudo' ? 'crudo' : 'cocido';
    if (rubro === 'filete-pollo' || rubro === 'filete_pollo') {
        rubro = 'filete';
        tipo = 'crudo';
        if (v.platos != null && !(Number(v.factor) > 0)) n = Number(v.platos);
    } else if (rubro === 'arroz-blanco' || rubro === 'arroz-verde') {
        tipo = 'cocido';
    } else if (rubro === 'filete-junior' || rubro === 'filete_junior') {
        rubro = 'filete';
        tipo = 'crudo';
        if (v.platos != null) n = Number(v.platos) * 0.5;
        else if (Number(v.factor) !== 0.5) n *= 0.5;
    }
    const texto = [v.nombre].concat(v.detalle || []).map((d) => (d && d.nombre) || d).join(' ')
        .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (texto.includes('milanesa') && texto.includes('junior') && (rubro === 'filete' || rubro === 'milanesa')) {
        const platos = v.platos != null ? Number(v.platos) : ((v.detalle && v.detalle[0] && Number(v.detalle[0].platos)) || 0);
        if (platos > 0 && n + 0.001 >= platos) n = Math.round(platos * 500) / 1000;
        rubro = 'filete';
        tipo = 'crudo';
    }
    if (n <= 0) return null;
    return { rubro, tipo, n, sinSaldo: !!v.sinSaldo };
}

function validarCocidoConfig(clave, config) {
    const body = config || {};
    if (esMateria(clave)) return { valido: true, tieneCocido: false, reservaClave: '' };
    if (clave === 'panceta' || clave === 'tira-panceta' || clave === 'trozo-panceta') {
        return { valido: true, tieneCocido: false, reservaClave: '' };
    }
    const reserva = String(body.reservaClave || '').trim();
    if (reserva && !esReservaValida(reserva)) {
        return {
            valido: false,
            tieneCocido: body.tieneCocido === true,
            reservaClave: '',
            error: 'La reserva solo puede ser Pollo fresco, Pechuga, Pierna, Filete Pollo Crudo, Octavo o Carnero Crudo'
        };
    }
    return { valido: true, tieneCocido: body.tieneCocido === true, reservaClave: reserva };
}

function aplicarMovimiento(bases, mov) {
    if (!mov || !mov.rubro) return;
    const key = mov.rubro + '|' + tipoProductoDe(mov.rubro, mov.tipoProducto);
    const n = Number(mov.cantidad) || 0;
    if (mov.clase === 'inventario') {
        bases[key] = n;
        return;
    }
    if (!n) return;
    if (mov.clase === 'egreso') bases[key] = (bases[key] || 0) - n;
    else bases[key] = (bases[key] || 0) + n;
}

/**
 * Reparte cada venta, en orden de hora, contra el saldo que dejan los movimientos guardados.
 * Un rubro sin cuadro cocido gasta primero el cocido que quedó de antes (Transformar o ventas viejas).
 * El detalle del plato queda en el producto relacionado. Si el stock sale del producto anterior,
 * esa parte no vuelve a bajar el saldo del relacionado: llega marcada con sinSaldo.
 */
function atribuirVentas(movimientos, ventas, opciones) {
    const eventos = [];
    (movimientos || []).forEach((m) => {
        const t = new Date(m && m.fecha).getTime();
        if (Number.isFinite(t)) eventos.push({ t: t, mov: m });
    });
    (ventas || []).forEach((v) => {
        const t = new Date(v && v.fecha).getTime();
        if (Number.isFinite(t)) eventos.push({ t: t, venta: v });
    });
    eventos.sort((a, b) => a.t - b.t || (a.mov ? -1 : 1));
    const bases = {};
    const out = [];
    eventos.forEach((e) => {
        if (e.mov) {
            aplicarMovimiento(bases, e.mov);
            return;
        }
        const v = e.venta;
        const rubro = v.rubro || v.plato;
        const cant = Number(v.cantidad) || 0;
        if (!rubro || cant <= 0) return;
        const op = (opciones && opciones[rubro]) || semillaCocido(rubro);
        const partes = repartirVenta(cant, cadenaDeVenta(v, op), bases);
        registrosDeVenta(v, op, partes).forEach((r) => out.push(r));
    });
    return out;
}

module.exports = {
    MATERIAS,
    esMateria,
    esStockGeneral,
    perfilRubro,
    cubetaDe,
    cadenaDeVenta,
    registrosDeVenta,
    repartirDetalle,
    normalizarVenta,
    semillaCocido,
    cadenaDe,
    arrozPorcionCocida,
    tipoProductoDe,
    esPlatoOctavoVenta,
    platoPolloSoloCocido,
    cadenaMixPechoLena,
    cadenaPachamancaPollo,
    esReservaValida,
    esMixPechoLena,
    repartirVenta,
    validarCocidoConfig,
    atribuirVentas,
    nombreUso
};
