'use strict';

const MATERIAS = ['pollo-origen', 'pechuga-pollo', 'pierna-pollo', 'filete'];

const NOMBRE_MATERIA = {
    'pollo-origen': 'Pollo fresco',
    'pechuga-pollo': 'Pechuga de Pollo',
    'pierna-pollo': 'Pierna de Pollo',
    filete: 'Filete Pollo crudo'
};

const SEMILLA = {
    pollada: { tieneCocido: true, reservaClave: 'pechuga-pollo' },
    menu: { tieneCocido: true, reservaClave: '' },
    'pollo-lena': { tieneCocido: true, reservaClave: '' },
    'pierna-lena': { tieneCocido: true, reservaClave: '' },
    'pachamanca-pollo': { tieneCocido: true, reservaClave: '' },
    'pachamanca-chancho': { tieneCocido: true, reservaClave: '' },
    'pachamanca-res': { tieneCocido: true, reservaClave: '' },
    'pachamanca-cordero': { tieneCocido: true, reservaClave: '' },
    'salt-pollo': { tieneCocido: true, reservaClave: 'filete' },
    'chaufa-pollo': { tieneCocido: true, reservaClave: 'filete' },
    milanesa: { tieneCocido: true, reservaClave: 'filete' },
    'filete-junior': { tieneCocido: true, reservaClave: 'filete' },
    'chicharron-pollo': { tieneCocido: true, reservaClave: 'filete' },
    'milanesa-junior': { tieneCocido: false, reservaClave: 'filete' },
    'chi-pollo-bbq': { tieneCocido: false, reservaClave: 'filete' },
    'chi-pollo-acevichada': { tieneCocido: false, reservaClave: 'filete' }
};

function esMateria(clave) {
    return MATERIAS.indexOf(String(clave || '')) !== -1;
}

function semillaCocido(clave) {
    const s = SEMILLA[clave];
    if (!s || esMateria(clave)) return { tieneCocido: false, reservaClave: '' };
    return { tieneCocido: s.tieneCocido === true, reservaClave: s.reservaClave || '' };
}

function cadenaDe(rubro, opciones) {
    const op = opciones || {};
    if (esMateria(rubro)) return [{ rubro: rubro, tipo: 'crudo' }];
    const cadena = [];
    if (op.tieneCocido) cadena.push({ rubro: rubro, tipo: 'cocido' });
    cadena.push({ rubro: rubro, tipo: 'crudo' });
    if (op.reservaClave && esMateria(op.reservaClave)) {
        cadena.push({ rubro: op.reservaClave, tipo: 'crudo' });
    }
    return cadena;
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
    if (!parte || parte.rubro === origen) return parte && parte.tipo === 'cocido' ? 'Cocido' : 'Crudo';
    return NOMBRE_MATERIA[parte.rubro] || parte.rubro;
}

function detalleParaParte(detalle, cantidadParte, cantidadTotal) {
    if (!Array.isArray(detalle) || !detalle.length || typeof detalle[0] !== 'object') return [];
    const total = detalle.reduce((a, d) => a + (Number(d && d.cantidad) || 0), 0);
    if (!(cantidadParte > 0)) return [];
    if (!(total > 0) || Math.abs(total - cantidadParte) < 0.001) {
        return detalle.map((d) => Object.assign({}, d));
    }
    let queda = cantidadParte;
    return detalle.map((d) => {
        const n = Math.min(queda, Number(d && d.cantidad) || 0);
        queda -= n;
        const factor = Number(d && d.factor) > 0 ? Number(d.factor) : 1;
        return Object.assign({}, d, { cantidad: n, platos: factor ? n / factor : n });
    }).filter((d) => (Number(d.cantidad) || 0) > 0);
}

function validarCocidoConfig(clave, config) {
    const body = config || {};
    if (esMateria(clave)) return { valido: true, tieneCocido: false, reservaClave: '' };
    const reserva = String(body.reservaClave || '').trim();
    if (reserva && !esMateria(reserva)) {
        return {
            valido: false,
            tieneCocido: body.tieneCocido === true,
            reservaClave: '',
            error: 'La reserva solo puede ser Pollo fresco, Pechuga, Pierna o Filete Pollo Crudo'
        };
    }
    return { valido: true, tieneCocido: body.tieneCocido === true, reservaClave: reserva };
}

function aplicarMovimiento(bases, mov) {
    if (!mov || !mov.rubro) return;
    const key = mov.rubro + '|' + (mov.tipoProducto === 'cocido' ? 'cocido' : 'crudo');
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
        const cadena = cadenaDe(rubro, op);
        if (cadena[0].tipo !== 'cocido') cadena.unshift({ rubro: rubro, tipo: 'cocido' });
        const partes = repartirVenta(cant, cadena, bases);
        const algunaLocal = partes.some((p) => p.rubro === rubro);
        let cubierta = 0;
        partes.forEach((p) => {
            if (p.rubro !== rubro) cubierta += p.cantidad;
            const usoNombre = nombreUso(rubro, p);
            out.push({
                rubro: p.rubro,
                origen: rubro,
                nombre: v.nombre,
                cantidad: p.cantidad,
                fecha: v.fecha,
                motivo: v.motivo,
                detalle: detalleParaParte(v.detalle, p.cantidad, cant),
                tipoProducto: p.tipo,
                usoNombre: usoNombre,
                sinSaldo: false
            });
        });
        if (cubierta > 0) {
            out.push({
                rubro: rubro,
                origen: rubro,
                nombre: v.nombre,
                cantidad: cubierta,
                fecha: v.fecha,
                motivo: v.motivo,
                detalle: algunaLocal ? [] : detalleParaParte(v.detalle, cubierta, cant),
                tipoProducto: op.tieneCocido ? 'cocido' : 'crudo',
                usoNombre: algunaLocal ? '' : nombreUso(rubro, partes[partes.length - 1]),
                sinSaldo: true
            });
        }
    });
    return out;
}

module.exports = {
    MATERIAS,
    esMateria,
    semillaCocido,
    cadenaDe,
    repartirVenta,
    validarCocidoConfig,
    atribuirVentas,
    nombreUso
};
