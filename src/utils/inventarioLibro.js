'use strict';

const { boundsDiaOperativo, ymdOperativo } = require('./diaOperativoRestaurante');
const { clavesGuardables, esRubroRetirado } = require('./inventarioRubros');
const {
    perfilRubro,
    cubetaDe,
    cadenaDeVenta,
    esPlatoOctavoVenta,
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

const CLAVE_OCTAVO = 'octavo-pollo';

function esAperturaAntigua(motivo) {
    return String(motivo || '').indexOf('Saldo anterior') === 0;
}

function esApertura(motivo) {
    return esAperturaAntigua(motivo) || String(motivo || '').indexOf('Ajuste apertura') === 0;
}

/**
 * Nota que reparte el saldo del octavo al abrir el día: +pecho, +pierna y −«sin separar».
 * Suma cero: indica de qué corte es el saldo, no agrega stock.
 */
function esNotaReparto(motivo) {
    return /^Saldo anterior · (?:pecho|pierna|sin separar)$/.test(String(motivo || ''));
}

/** Corte que indica un motivo. Misma regla que motivoEsCorte en inventario.html. */
function corteDeMotivo(motivo) {
    const m = String(motivo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/(?:^|·)\s*sin separar\s*$/.test(m)) return '';
    const marca = m.match(/(?:^|·)\s*(pecho|pierna)\s*$/);
    if (marca) return marca[1];
    const pecho = m.includes('pecho') || m.includes('pechuga');
    const pierna = m.includes('pierna');
    if (pierna && !pecho) return 'pierna';
    return pecho && !pierna ? 'pecho' : '';
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

// Beata, Personal, Evento y Rio Lindo son descarga. El cuadro anota el ingreso
// y lo separa en el mismo momento: no es mercadería que entró.
function esDescargaSector(motivo) {
    return /·\s*Sector\s+(?:Beata|Personal|Evento|Eventos|Rio Lindo)\b/i.test(String(motivo || ''));
}

const otroTipo = (tipo) => tipo === 'cocido' ? 'crudo' : 'cocido';

// Los pases nuevos se guardan en la entrada. Los antiguos guardaban entrada y salida por separado.
function indexarPases(movimientos) {
    const pases = new Map();
    const pendientes = new Map();
    const ingresosCocidos = new Map();
    const antiguos = [];
    const unir = (entrada, salida) => {
        const pase = { entrada, salida };
        pases.set(entrada, pase);
        if (salida) pases.set(salida, pase);
    };
    for (const m of movimientos) {
        if (!m || m.clase !== 'ingreso' || !m.rubro || !Number(m.cantidad)) continue;
        if (m.paseTipo) {
            unir(m, null);
            continue;
        }
        const motivo = String(m.motivo || '');
        const fecha = new Date(m.fecha);
        if (!Number.isFinite(fecha.getTime())) continue;
        const n = Number(m.cantidad);
        // La edición antigua de la tabla guardaba primero el cambio cocido y después el crudo.
        if (m.tipoProducto === 'cocido' && motivo === 'Ingreso cocido') {
            const key = JSON.stringify([m.rubro, ymdOperativo(fecha), n]);
            if (!ingresosCocidos.has(key)) ingresosCocidos.set(key, []);
            ingresosCocidos.get(key).push(m);
        } else if (m.tipoProducto === 'crudo' && motivo.startsWith('Cocido desde crudo ')) {
            antiguos.push([m, JSON.stringify([m.rubro, ymdOperativo(fecha), -n])]);
        } else if (esPaseEntreTipos(motivo)) {
            const [, lado, tipo, nombre] = /^Pasa (a|de) (crudo|cocido)\b\s*(.*)$/.exec(motivo);
            if (tipo !== otroTipo(m.tipoProducto) || (lado === 'de' ? n <= 0 : n >= 0)) continue;
            const destino = lado === 'de' ? m.tipoProducto : tipo;
            const key = JSON.stringify([m.rubro, ymdOperativo(fecha), destino, Math.abs(n), nombre]);
            if (!pendientes.has(key)) pendientes.set(key, { a: [], de: [] });
            pendientes.get(key)[lado].push(m);
        }
    }
    for (const { a, de } of pendientes.values()) {
        const porFecha = (x, y) => new Date(x.fecha) - new Date(y.fecha);
        a.sort(porFecha);
        de.sort(porFecha);
        let salida = 0;
        for (const entrada of de) {
            const anterior = a[salida];
            if (anterior && new Date(anterior.fecha) <= new Date(entrada.fecha)) unir(entrada, a[salida++]);
        }
    }
    for (const [crudo, key] of antiguos.sort(([a], [b]) => new Date(a.fecha) - new Date(b.fecha))) {
        const candidatos = ingresosCocidos.get(key) || [];
        let indice = -1;
        let distancia = 60_000;
        candidatos.forEach((m, i) => {
            const diferencia = new Date(crudo.fecha) - new Date(m.fecha);
            if (diferencia >= 0 && diferencia < distancia) {
                indice = i;
                distancia = diferencia;
            }
        });
        if (indice < 0) continue;
        const [cocido] = candidatos.splice(indice, 1);
        if (Number(crudo.cantidad) < 0) unir(cocido, crudo);
        else unir(crudo, cocido);
    }
    return pases;
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
        octavoPecho: 0,
        octavoPierna: 0,
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

// Para los platos de octavo se arrastra el corte junto al saldo de cada tipo.
// Los ingresos sin marca se muestran en pierna, como en los cuadros históricos.
function ajustarPecho(c, antes, corte) {
    const despues = Math.max(0, saldoDe(c));
    if (corte === 'pecho') c.pecho += despues - antes;
    if (!corte && despues < antes) c.pecho *= despues / antes;
    c.pecho = Math.max(0, Math.min(despues, r3(c.pecho)));
}

/** Productos de la hoja: los fijos, los de mapas, los vendidos y los que tienen movimientos. */
function definiciones(movimientos, ventas, extras) {
    const defs = clavesGuardables().map((d) => ({ clave: d.clave, nombre: d.nombre }));
    const ya = new Set(defs.map((d) => d.clave));
    const sumar = (clave, nombre) => {
        if (!clave || ya.has(clave) || esRubroRetirado(clave)) return;
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

function armarLibro({ movimientos = [], ventas, opciones, umbrales, extras, desde, hasta }) {
    const desdeMs = new Date(desde).getTime();
    const hastaMs = new Date(hasta).getTime();
    const ops = opciones || {};
    const perfiles = {};
    const perfilDe = (clave) => {
        if (!perfiles[clave]) perfiles[clave] = perfilRubro(clave, ops[clave]);
        return perfiles[clave];
    };
    // Los tres platos de octavo conservan sus tipos de origen en el libro. El modo de la
    // fecha del movimiento determina si pueden compartir saldo; el modo actual solo arma la vista.
    const tipoDeCubeta = (rubro, tipo) => esPlatoOctavoVenta(rubro)
        ? (tipo === 'cocido' ? 'cocido' : 'crudo') : cubetaDe(perfilDe(rubro), tipo);
    const cubetas = new Map();
    const cubeta = (rubro, tipo) => {
        const key = rubro + '|' + tipoDeCubeta(rubro, tipo);
        let c = cubetas.get(key);
        if (!c) {
            c = nuevaCubeta();
            if (esPlatoOctavoVenta(rubro)) c.pecho = 0;
            cubetas.set(key, c);
        }
        return c;
    };

    const eventos = [];
    const pases = indexarPases(movimientos);
    const distribuciones = new Map();
    const modosOctavo = new Map();
    const soloCocidoEnLibro = (rubro) => esPlatoOctavoVenta(rubro)
        && (modosOctavo.get(rubro) ?? perfilDe(rubro).soloCocido);
    for (const [rubro, op] of Object.entries(ops)) {
        if (!esPlatoOctavoVenta(rubro)) continue;
        const cambios = (op?.cambiosSoloCocido || []).map((cambio) => ({
            t: new Date(cambio.fecha).getTime(), cambioModo: rubro, soloCocido: cambio.soloCocido
        })).filter((cambio) => typeof cambio.soloCocido === 'boolean' && Number.isFinite(cambio.t)).sort((a, b) => a.t - b.t);
        if (cambios.length) {
            modosOctavo.set(rubro, !cambios[0].soloCocido);
            eventos.push(...cambios);
        }
    }
    (movimientos || []).forEach((m) => {
        const t = new Date(m && m.fecha).getTime();
        if (m && m.rubro && !esRubroRetirado(m.rubro) && Number.isFinite(t)) eventos.push({ t, mov: m });
    });
    (ventas || []).forEach((v) => {
        const t = new Date(v && v.fecha).getTime();
        const rubro = v && (v.rubro || v.plato);
        if (rubro && !esRubroRetirado(rubro) && Number(v.cantidad) > 0 && Number.isFinite(t)) eventos.push({ t, venta: v });
    });
    eventos.sort((a, b) => a.t - b.t || Number(!!b.cambioModo) - Number(!!a.cambioModo) || Number(!!b.mov) - Number(!!a.mov));

    let finDia = -Infinity;
    let inicioDia = -Infinity;
    let hayDia = false;
    let enVentana = false;
    let abreAlInicioDelDia = false;
    let finPrimerDia = -Infinity;
    const salida = [];
    // Octavos marcados de cada corte. Las ventas de comanda no dicen el corte y no los bajan.
    const cortes = { pierna: 0, pecho: 0 };
    let cortesIniciales = { pierna: 0, pecho: 0 };
    const pendientesSectores = {};
    const conteosOctavo = new Map();
    const tiposTransferidosOctavo = new Map();

    // Lo marcado pasa al día siguiente, sin superar lo que de verdad quedó.
    const cerrarCortes = () => {
        const octavo = cubetas.get(CLAVE_OCTAVO + '|' + cubetaDe(perfilDe(CLAVE_OCTAVO), 'crudo'));
        const real = octavo ? octavo.cierreAnterior : 0;
        const pierna = Math.max(0, cortes.pierna);
        const pecho = Math.max(0, cortes.pecho);
        const suma = pierna + pecho;
        const factor = suma > real + 0.5 ? real / suma : 1;
        cortes.pierna = Math.round(pierna * factor);
        cortes.pecho = Math.round(pecho * factor);
    };

    const cerrarDia = () => {
        cubetas.forEach((c) => {
            const cierre = saldoDe(c);
            c.credito += Math.max(0, -c.abre) + Math.max(0, -cierre);
            if (enVentana) c.w.ajuste += Math.max(0, -cierre);
            c.cierreAnterior = Math.max(0, cierre);
            c.abre = c.cierreAnterior;
            c.mov = 0;
        });
        cerrarCortes();
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
        cortesIniciales = { ...cortes };
    };

    const marcarCorte = (m, n, t) => {
        if (m.rubro !== CLAVE_OCTAVO || (m.tipoProducto || 'crudo') !== 'crudo') return;
        if (m.clase !== 'egreso' && m.clase !== 'ingreso' && m.clase !== 'regulacion') return;
        if (esNotaReparto(m.motivo)) return;
        const corte = corteDeMotivo(m.motivo);
        if (!corte) return;
        const cambio = m.clase === 'egreso' ? -n : n;
        cortes[corte] += cambio;
        if (enVentana && abreAlInicioDelDia && t <= finPrimerDia && esApertura(m.motivo)) {
            cortesIniciales[corte] += cambio;
        }
    };

    const aplicarApertura = (c, m, n, t) => {
        let x = n;
        // Los «Saldo anterior» antiguos tapaban negativos. Ese negativo ya no se arrastra:
        // el ajuste primero salda lo que el cierre ya había perdonado y solo el resto es stock.
        if (x > 0 && esAperturaAntigua(m.motivo) && !esNotaReparto(m.motivo)) {
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

    const aplicarMovimiento = (c, m, n, t) => {
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
        marcarCorte(m, n, t);
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
        if (esDescargaSector(m.motivo)) {
            c.w.regulacion += n;
            return;
        }
        c.w.ingresos += n;
        if (esPaseTransformacion(m.motivo)) c.w.pase -= n;
    };

    const aplicarPase = ({ entrada, salida }) => {
        const tipo = entrada.tipoProducto;
        const destino = cubeta(entrada.rubro, tipo);
        const origen = cubeta(entrada.rubro, otroTipo(tipo));
        if (origen === destino) return;
        const n = Math.abs(Number(entrada.cantidad));
        const marca = corteDeMotivo((salida && salida.motivo) || entrada.motivo);
        const saldoOrigen = Math.max(0, saldoDe(origen));
        const saldoDestino = Math.max(0, saldoDe(destino));
        origen.mov -= n;
        destino.mov += n;
        if (origen.pecho !== undefined) ajustarPecho(origen, saldoOrigen, marca);
        if (destino.pecho !== undefined) ajustarPecho(destino, saldoDestino, marca);
        if (!enVentana) return;

        const previo = entrada.reviertePase && distribuciones.get(String(entrada.reviertePase));
        const disponibleApertura = Math.max(0, origen.w.inicial);
        const disponibleIngreso = Math.max(0, origen.w.ingresos + Math.max(0, r3(origen.w.pase)));
        const ingresoPrevio = previo ? Math.min(previo.ingreso, disponibleIngreso) : 0;
        const ajustePrevio = previo ? previo.ajuste : 0;
        const apertura = Math.min(r3(n - ingresoPrevio - ajustePrevio), disponibleApertura);
        const ingreso = Math.min(r3(n - apertura - ajustePrevio), disponibleIngreso);
        const ajuste = r3(n - apertura - ingreso);
        origen.w.inicial -= apertura;
        destino.w.inicial += apertura;
        origen.w.ingresos -= ingreso;
        destino.w.ingresos += ingreso;
        origen.w.ajuste -= ajuste;
        destino.w.ajuste += ajuste;
        if (entrada._id) distribuciones.set(String(entrada._id), { ingreso, ajuste });
    };

    const ajustarCubetaOctavo = (c, cantidad) => {
        const antes = Math.max(0, saldoDe(c));
        c.mov += cantidad;
        if (enVentana) c.w.ajuste += cantidad;
        ajustarPecho(c, antes, '');
    };

    const cubrirFaltanteOctavo = (rubro) => {
        const crudo = cubeta(rubro, 'crudo');
        const cocido = cubeta(rubro, 'cocido');
        const saldoCrudo = saldoDe(crudo);
        const saldoCocido = saldoDe(cocido);
        if (saldoCrudo * saldoCocido >= 0) return;
        const crudoRecibe = saldoCrudo < 0;
        const cantidad = Math.min(Math.abs(saldoCrudo), Math.abs(saldoCocido));
        ajustarCubetaOctavo(crudo, crudoRecibe ? cantidad : -cantidad);
        ajustarCubetaOctavo(cocido, crudoRecibe ? -cantidad : cantidad);
    };

    const descontarOctavo = (rubro, tipo, n, corte, descontar, saldoDeTipo = saldoDe) => {
        const tipos = [tipo, otroTipo(tipo)];
        const stocks = tipos.map((t) => cubeta(rubro, t));
        const cantidades = [0, 0];
        let falta = n;
        for (const marca of corte ? [corte, ''] : ['']) {
            stocks.forEach((c, i) => {
                const saldo = Math.max(0, saldoDeTipo(c));
                const pecho = Math.min(saldo, c.pecho);
                const disponible = marca === 'pecho' ? pecho : (marca === 'pierna' ? saldo - pecho : saldo);
                const toma = Math.min(falta, Math.max(0, disponible - cantidades[i]));
                cantidades[i] += toma;
                falta -= toma;
            });
        }
        cantidades[0] += falta;
        stocks.forEach((c, i) => {
            if (!cantidades[i]) return;
            const antes = Math.max(0, saldoDe(c));
            descontar(c, cantidades[i], tipos[i]);
            ajustarPecho(c, antes, corte);
        });
    };

    const aplicarVenta = (v, t) => {
        const rubro = v.rubro || v.plato;
        const op = ops[rubro] || semillaCocido(rubro);
        const vistos = new Set();
        const cadena = [];
        cadenaDeVenta(v, op).forEach((e) => {
            const tipo = tipoDeCubeta(e.rubro, e.tipo);
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
            if (nv && !nv.sinSaldo && soloCocidoEnLibro(nv.rubro)) {
                descontarOctavo(nv.rubro, nv.tipo, nv.n, '', (c, n) => {
                    c.mov -= n;
                    if (enVentana) c.w.venta += n;
                });
            } else if (nv) {
                const c = cubeta(nv.rubro, nv.tipo);
                if (!nv.sinSaldo) {
                    const antes = Math.max(0, saldoDe(c));
                    c.mov -= nv.n;
                    if (c.pecho !== undefined) ajustarPecho(c, antes, '');
                }
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

    const aplicarMovimientoOctavo = (m, t) => {
        const rubro = m.rubro;
        const tipo = tipoDeCubeta(rubro, m.tipoProducto);
        const c = cubeta(rubro, tipo);
        const unificado = soloCocidoEnLibro(rubro);
        const corte = corteDeMotivo(m.motivo);
        const n = Number(m.cantidad) || 0;
        const apertura = m.clase === 'ingreso' && esApertura(m.motivo);
        const saldoTotal = () => saldoDe(cubeta(rubro, 'crudo')) + saldoDe(cubeta(rubro, 'cocido'));
        const ingresoOctavo = m.clase === 'ingreso' && /^Sale de Octavo de pollo · (?:pecho|pierna)$/i.test(m.motivo || '');
        const campoTransferencia = corte === 'pecho' ? 'octavoPecho' : 'octavoPierna';
        const aplicar = (cubetaFuente, cantidad) => {
            aplicarMovimiento(cubetaFuente, m, cantidad, t);
            if (enVentana && ingresoOctavo) cubetaFuente.w[campoTransferencia] += cantidad;
        };
        const descontar = (fuente, cantidad, signo) => descontarOctavo(rubro, fuente, cantidad, corte,
            (cubetaFuente, monto) => aplicar(cubetaFuente, monto * signo), apertura ? (c) => c.abre : saldoDe);
        const claveTransferencia = rubro + '|' + corte;
        const transferidos = tiposTransferidosOctavo.get(claveTransferencia) || { crudo: 0, cocido: 0 };
        const contar = m.clase === 'inventario' && esConteo(m.motivo);
        const antesConteo = contar ? saldoTotal() : 0;

        if (unificado && ingresoOctavo && n < 0) {
            let falta = -n;
            for (const fuente of [tipo, otroTipo(tipo)]) {
                // Las devoluciones de una transformación antigua salen primero de donde entró ese corte.
                const cantidad = Math.min(falta, Math.max(0, transferidos[fuente]));
                if (cantidad) descontar(fuente, cantidad, -1);
                transferidos[fuente] -= cantidad;
                falta -= cantidad;
            }
            if (falta > 0) descontar(tipo, falta, -1);
        } else if (unificado && m.clase === 'egreso' && n > 0) {
            descontar(tipo, n, 1);
        } else if (unificado && n < 0 && (m.clase === 'regulacion' || m.clase === 'ingreso')) {
            descontar(tipo, -n, -1);
        } else {
            let antes = Math.max(0, saldoDe(c));
            if (m.clase === 'inventario' && m.conteoUnificado) {
                const crudo = cubeta(rubro, 'crudo');
                antes += Math.max(0, saldoDe(crudo));
                c.pecho += crudo.pecho;
                aplicarMovimiento(crudo, { ...m, motivo: '' }, 0, t);
                crudo.pecho = 0;
            }
            aplicar(c, n);
            ajustarPecho(c, antes, corte);
            if (ingresoOctavo) transferidos[tipo] += n;
        }
        if (ingresoOctavo) tiposTransferidosOctavo.set(claveTransferencia, transferidos);
        if (unificado) cubrirFaltanteOctavo(rubro);
        if (enVentana && contar) conteosOctavo.set(rubro, { conteo: saldoTotal(), difConteo: saldoTotal() - antesConteo });
    };

    for (const e of eventos) {
        if (e.t > hastaMs) break;
        avanzarDia(e.t);
        if (!enVentana && e.t >= desdeMs) entrarVentana();
        if (e.cambioModo) {
            modosOctavo.set(e.cambioModo, e.soloCocido);
            if (e.soloCocido) {
                // El cambio de vista arrastra lo disponible. Los faltantes previos no consumen el otro tipo.
                for (const tipo of ['crudo', 'cocido']) {
                    const c = cubeta(e.cambioModo, tipo);
                    const falta = Math.max(0, -saldoDe(c));
                    if (falta) ajustarCubetaOctavo(c, falta);
                }
            }
        } else if (e.mov) {
            const m = e.mov;
            if (m.rubro === CLAVE_OCTAVO && (m.tipoProducto || 'crudo') === 'crudo' && m.clase === 'regulacion') {
                const separado = /^Separado · (Beata|Personal|Eventos?|R[ií]o Lindo) · (pecho|pierna)$/i.exec(m.motivo || '');
                if (separado) {
                    const sector = separado[1].toLowerCase().replace(/eventos$/, 'evento').replace(/^r[ií]o lindo$/, 'rio lindo');
                    const clave = sector + '|' + separado[2].toLowerCase();
                    pendientesSectores[clave] = r3((pendientesSectores[clave] || 0) - (Number(m.cantidad) || 0));
                }
            }
            const pase = pases.get(m);
            if (pase) {
                if (pase.entrada === m) {
                    aplicarPase(pase);
                    if (soloCocidoEnLibro(m.rubro)) cubrirFaltanteOctavo(m.rubro);
                }
                continue;
            }
            if (esPlatoOctavoVenta(m.rubro)) aplicarMovimientoOctavo(m, e.t);
            else aplicarMovimiento(cubeta(m.rubro, m.tipoProducto), m, Number(m.cantidad) || 0, e.t);
        } else aplicarVenta(e.venta, e.t);
    }
    if (!enVentana) {
        avanzarDia(desdeMs);
        entrarVentana();
    }
    avanzarDia(hastaMs);

    const umbralDe = umbrales || {};
    const filas = [];
    const entero = (n) => Math.max(0, Math.round(n));
    const cortesDe = (c) => ({ pierna: entero(c.pierna), pecho: entero(c.pecho) });
    definiciones(movimientos, ventas, extras).forEach((def) => {
        const minimo = umbralDe[def.clave] || {};
        const unificado = esPlatoOctavoVenta(def.clave) && perfilDe(def.clave).soloCocido;
        let combinado;
        if (unificado) {
            combinado = { abre: 0, mov: 0, pecho: 0, w: ventanaVacia() };
            for (const tipo of ['crudo', 'cocido']) {
                const c = cubetas.get(def.clave + '|' + tipo);
                if (!c) continue;
                combinado.mov += saldoDe(c);
                combinado.pecho += c.pecho;
                for (const campo of Object.keys(combinado.w)) {
                    if (campo !== 'conteo' && campo !== 'difConteo') combinado.w[campo] += c.w[campo];
                }
            }
            Object.assign(combinado.w, conteosOctavo.get(def.clave));
        }
        ['crudo', 'cocido'].forEach((tipo) => {
            const crudoOculto = unificado && tipo === 'crudo';
            const c = unificado ? (crudoOculto ? undefined : combinado) : cubetas.get(def.clave + '|' + tipo);
            const w = c ? c.w : ventanaVacia();
            const transformacion = Math.max(0, r3(w.pase));
            const ingresoBruto = w.ingresos + transformacion;
            const inicial = Math.max(0, w.inicial);
            const ajuste = w.ajuste + (w.inicial < 0 ? w.inicial : 0);
            const sinTope = c ? saldoDe(c) : 0;
            const queda = Math.max(0, sinTope);
            const umbral = crudoOculto ? 0 : (Number(minimo[tipo]) || 0);
            const extraOctavo = def.clave === CLAVE_OCTAVO && tipo === 'crudo'
                ? { cortes: { inicial: cortesDe(cortesIniciales), queda: cortesDe(cortes) }, pendientesSectores }
                : {};
            filas.push({
                ...extraOctavo,
                ...(esPlatoOctavoVenta(def.clave) ? {
                    pechoOctavo: c ? c.pecho : 0,
                    octavoTransformado: { pecho: r3(w.octavoPecho), pierna: r3(w.octavoPierna) }
                } : {}),
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

module.exports = { armarLibro, esApertura, esConteo, esPaseTransformacion, esDescargaSector, indexarPases, otroTipo };
