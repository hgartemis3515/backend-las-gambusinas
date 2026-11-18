'use strict';

const { boundsDiaOperativo } = require('./diaOperativoRestaurante');
const { clavesGuardables } = require('./inventarioRubros');
const {
    perfilRubro,
    cubetaDe,
    cadenaDeVenta,
    semillaCocido,
    registrosDeVenta,
    normalizarVenta
} = require('./inventarioCascadaVenta');

/**
 * Libro de inventario: una sola pasada, en orden de hora, por todos los movimientos y ventas.
 *
 * Reglas:
 * - Cada producto lleva una cubeta por tipo. Un producto sin cocido tiene una sola cubeta.
 * - Al cerrar el día operativo (04:00), lo que queda pasa entero al día siguiente.
 *   Un saldo negativo no se arrastra: abre en 0 y el faltante se ve en el día que ocurrió.
 * - Saldo anterior de hoy = lo que quedó ayer + los ajustes de apertura de hoy.
 * - Un conteo deja el stock en ese número y lo que venga después sigue restando.
 */

const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

function esAperturaAntigua(motivo) {
    return String(motivo || '').indexOf('Saldo anterior') === 0;
}

function esApertura(motivo) {
    return esAperturaAntigua(motivo) || String(motivo || '').indexOf('Ajuste apertura') === 0;
}

function esConteo(motivo) {
    return String(motivo || '').indexOf('Conteo') === 0;
}

function esPaseEntreTipos(motivo) {
    return /^Pasa (?:a|de) (?:crudo|cocido)\b/.test(String(motivo || ''));
}

function esPaseTransformacion(motivo) {
    const m = String(motivo || '');
    return m.indexOf('Pasa a ') === 0 && !esPaseEntreTipos(m);
}

function ventanaVacia() {
    return {
        inicial: 0,
        cierreAnterior: 0,
        ajusteApertura: 0,
        ingresos: 0,
        pase: 0,
        egreso: 0,
        regulacion: 0,
        venta: 0,
        cubierta: 0,
        ajuste: 0,
        conteo: null,
        difConteo: 0
    };
}

function nuevaCubeta() {
    return { abre: 0, mov: 0, credito: 0, cierreAnterior: 0, w: ventanaVacia() };
}

function saldoDe(c) {
    return Math.max(0, c.abre) + c.mov;
}

/** Productos de la hoja: los fijos, los de mapas, los vendidos y los que tienen movimientos. */
function definiciones(movimientos, ventas, extras) {
    const defs = clavesGuardables().map((d) => ({ clave: d.clave, nombre: d.nombre }));
    const ya = new Set(defs.map((d) => d.clave));
    const sumar = (clave, nombre) => {
        if (!clave || ya.has(clave)) return;
        ya.add(clave);
        defs.push({ clave, nombre: nombre || clave });
    };
    (extras || []).forEach((e) => { if (e) sumar(e.clave, e.nombre); });
    (ventas || []).forEach((v) => { if (v) sumar(v.rubro || v.plato, v.nombre); });
    (movimientos || []).forEach((m) => {
        const clave = m && m.rubro;
        if (!clave || !/^[a-z0-9]+(?:-[a-z0-9]+){0,12}$/.test(String(clave)) || String(clave).length > 80) return;
        sumar(clave, m.nombre);
    });
    return defs;
}

function armarLibro({ movimientos, ventas, opciones, umbrales, extras, desde, hasta }) {
    const desdeMs = new Date(desde).getTime();
    const hastaMs = new Date(hasta).getTime();
    const ops = opciones || {};
    const perfiles = {};
    const perfilDe = (clave) => {
        if (!perfiles[clave]) perfiles[clave] = perfilRubro(clave, ops[clave]);
        return perfiles[clave];
    };
    const cubetas = new Map();
    const cubeta = (rubro, tipo) => {
        const key = rubro + '|' + cubetaDe(perfilDe(rubro), tipo);
        let c = cubetas.get(key);
        if (!c) {
            c = nuevaCubeta();
            cubetas.set(key, c);
        }
        return c;
    };

    const eventos = [];
    (movimientos || []).forEach((m) => {
        const t = new Date(m && m.fecha).getTime();
        if (m && m.rubro && Number.isFinite(t)) eventos.push({ t, mov: m });
    });
    (ventas || []).forEach((v) => {
        const t = new Date(v && v.fecha).getTime();
        if (v && (v.rubro || v.plato) && Number(v.cantidad) > 0 && Number.isFinite(t)) eventos.push({ t, venta: v });
    });
    eventos.sort((a, b) => a.t - b.t || (a.mov ? -1 : 1));

    let finDia = -Infinity;
    let inicioDia = -Infinity;
    let hayDia = false;
    let enVentana = false;
    let abreAlInicioDelDia = false;
    let finPrimerDia = -Infinity;
    const salida = [];

    const cerrarDia = () => {
        cubetas.forEach((c) => {
            const cierre = saldoDe(c);
            c.credito += Math.max(0, -c.abre) + Math.max(0, -cierre);
            if (enVentana) c.w.ajuste += Math.max(0, -cierre);
            c.cierreAnterior = Math.max(0, cierre);
            c.abre = c.cierreAnterior;
            c.mov = 0;
        });
    };

    const avanzarDia = (t) => {
        if (t <= finDia) return;
        if (hayDia) cerrarDia();
        const b = boundsDiaOperativo(new Date(t));
        inicioDia = b.inicio.getTime();
        finDia = b.fin.getTime();
        hayDia = true;
    };

    const entrarVentana = () => {
        enVentana = true;
        abreAlInicioDelDia = Math.abs(desdeMs - inicioDia) < 1500;
        finPrimerDia = finDia;
        cubetas.forEach((c) => {
            c.w.inicial = saldoDe(c);
            c.w.cierreAnterior = c.cierreAnterior;
        });
    };

    const aplicarApertura = (c, m, n, t) => {
        let x = n;
        // Los «Saldo anterior» antiguos tapaban negativos. Ese negativo ya no se arrastra:
        // el ajuste primero salda lo que el cierre ya había perdonado y solo el resto es stock.
        if (x > 0 && esAperturaAntigua(m.motivo)) {
            const absorbe = Math.min(x, c.credito);
            c.credito -= absorbe;
            x -= absorbe;
        }
        const antes = saldoDe(c);
        c.abre += x;
        if (!enVentana) return;
        const cambio = saldoDe(c) - antes;
        if (abreAlInicioDelDia && t <= finPrimerDia) {
            c.w.inicial += cambio;
            c.w.ajusteApertura += cambio;
        } else {
            c.w.ajuste += cambio;
        }
    };

    const aplicarMovimiento = (m, t) => {
        const c = cubeta(m.rubro, m.tipoProducto);
        const n = Number(m.cantidad) || 0;
        if (m.clase === 'inventario') {
            const antes = saldoDe(c);
            c.abre = 0;
            c.mov = n;
            c.credito = 0;
            if (enVentana) {
                c.w.ajuste += n - antes;
                if (esConteo(m.motivo)) {
                    c.w.conteo = n;
                    c.w.difConteo = n - antes;
                }
            }
            return;
        }
        if (!n) return;
        if (m.clase === 'egreso') {
            c.mov -= n;
            if (enVentana) c.w.egreso += n;
            return;
        }
        if (m.clase === 'regulacion') {
            c.mov += n;
            if (enVentana) c.w.regulacion += n;
            return;
        }
        if (esApertura(m.motivo)) {
            aplicarApertura(c, m, n, t);
            return;
        }
        c.mov += n;
        if (!enVentana) return;
        c.w.ingresos += n;
        if (esPaseTransformacion(m.motivo)) c.w.pase -= n;
    };

    const aplicarVenta = (v, t) => {
        const rubro = v.rubro || v.plato;
        const op = ops[rubro] || semillaCocido(rubro);
        const vistos = new Set();
        const cadena = [];
        cadenaDeVenta(v, op).forEach((e) => {
            const tipo = cubetaDe(perfilDe(e.rubro), e.tipo);
            const key = e.rubro + '|' + tipo;
            if (vistos.has(key)) return;
            vistos.add(key);
            cadena.push({ rubro: e.rubro, tipo });
        });
        let falta = Math.max(0, Number(v.cantidad) || 0);
        const partes = [];
        cadena.forEach((e, i) => {
            if (falta <= 0) return;
            const disponible = Math.max(0, saldoDe(cubeta(e.rubro, e.tipo)));
            const toma = i === cadena.length - 1 ? falta : Math.min(falta, disponible);
            if (toma > 0) {
                partes.push({ rubro: e.rubro, tipo: e.tipo, cantidad: toma });
                falta -= toma;
            }
        });
        registrosDeVenta(v, op, partes).forEach((rec) => {
            const nv = normalizarVenta(rec);
            if (nv) {
                const c = cubeta(nv.rubro, nv.tipo);
                if (!nv.sinSaldo) c.mov -= nv.n;
                if (enVentana) {
                    c.w.venta += nv.n;
                    if (nv.sinSaldo) c.w.cubierta += nv.n;
                }
            }
            if (enVentana && t <= hastaMs) {
                if (rec.sinSaldo) rec.tipoProducto = cubetaDe(perfilDe(rec.rubro), rec.tipoProducto);
                salida.push(rec);
            }
        });
    };

    for (const e of eventos) {
        if (e.t > hastaMs) break;
        avanzarDia(e.t);
        if (!enVentana && e.t >= desdeMs) entrarVentana();
        if (e.mov) aplicarMovimiento(e.mov, e.t);
        else aplicarVenta(e.venta, e.t);
    }
    if (!enVentana) {
        avanzarDia(desdeMs);
        entrarVentana();
    }
    avanzarDia(hastaMs);

    const umbralDe = umbrales || {};
    const filas = [];
    definiciones(movimientos, ventas, extras).forEach((def) => {
        const minimo = umbralDe[def.clave] || {};
        ['crudo', 'cocido'].forEach((tipo) => {
            const c = cubetas.get(def.clave + '|' + tipo);
            const w = c ? c.w : ventanaVacia();
            const transformacion = Math.max(0, r3(w.pase));
            const ingresoBruto = w.ingresos + transformacion;
            const inicial = Math.max(0, w.inicial);
            const ajuste = w.ajuste + (w.inicial < 0 ? w.inicial : 0);
            const sinTope = c ? saldoDe(c) : 0;
            const queda = Math.max(0, sinTope);
            const umbral = Number(tipo === 'crudo' ? minimo.crudo : minimo.cocido) || 0;
            filas.push({
                plato: def.clave,
                rubro: def.clave,
                platoId: 0,
                nombre: def.nombre,
                tipoProducto: tipo,
                saldoInicial: r3(inicial),
                cierreAnterior: r3(w.cierreAnterior),
                ajusteApertura: r3(w.ajusteApertura),
                ingresos: r3(w.ingresos),
                ingresoBruto: r3(ingresoBruto),
                transformacion,
                total: r3(inicial + ingresoBruto),
                egreso: r3(w.egreso),
                venta: r3(w.venta),
                cubierta: r3(w.cubierta),
                regulacion: r3(w.regulacion),
                ajuste: r3(ajuste),
                conteo: w.conteo === null ? null : r3(w.conteo),
                tieneConteo: w.conteo !== null,
                difConteo: w.conteo === null ? null : r3(w.difConteo),
                sinTope: r3(sinTope),
                queda: r3(queda),
                saldoFinal: r3(queda),
                baja: r3(queda),
                cierre: r3(queda),
                umbral,
                critico: umbral > 0 && queda <= umbral
            });
        });
    });
    return { filas, ventas: salida };
}

module.exports = { armarLibro, esApertura, esConteo, esPaseTransformacion };
