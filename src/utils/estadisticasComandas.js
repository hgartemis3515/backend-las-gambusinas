'use strict';

const moment = require('moment-timezone');

const TZ = 'America/Lima';

function rangoLima(fechaInicio, fechaFin) {
    const inicioStr = fechaInicio || moment().tz(TZ).format('YYYY-MM-DD');
    const finStr = fechaFin || inicioStr;
    return {
        inicio: moment.tz(inicioStr, 'YYYY-MM-DD', TZ).startOf('day').toDate(),
        fin: moment.tz(finStr, 'YYYY-MM-DD', TZ).endOf('day').toDate()
    };
}

function numPositivo(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function firstPositive(...vals) {
    for (const v of vals) {
        const n = numPositivo(v);
        if (n > 0) return n;
    }
    return 0;
}

/** Precio unitario como comandas.html: catálogo → precio → snapshot → base+extras. 0 no bloquea el fallback. */
function precioPlatoNum(p) {
    if (!p) return 0;
    const cat = p.plato?.precio;
    const baseExtra = numPositivo(p.precioBase) + (Number(p.extraComplementos) || 0);
    return firstPositive(p.precioUnitario, baseExtra, p.precio, cat);
}

function cantidadPlatoNum(p, i, cantidades) {
    const n = Number(p?.cantidad);
    if (Number.isFinite(n) && n > 0) return n;
    const c = Number(cantidades?.[i]);
    return Number.isFinite(c) && c > 0 ? c : 1;
}

function montoDesdePlatos(c) {
    return (c?.platos || []).reduce((sum, p, i) => {
        if (!p || p.eliminado || p.anulado) return sum;
        return sum + precioPlatoNum(p) * cantidadPlatoNum(p, i, c.cantidades);
    }, 0);
}

/** totalCalculado/precioTotal default 0: no usar $ifNull (0 cuenta como valor). */
function montoComandaNum(c) {
    if (!c) return 0;
    return firstPositive(c.totalCalculado, c.precioTotal, c.precioTotalOriginal, montoDesdePlatos(c));
}

function exprPrecioPlatoItem(pExpr) {
    return {
        $let: {
            vars: {
                cat: {
                    $cond: [
                        { $eq: [{ $type: `${pExpr}.plato` }, 'object'] },
                        { $ifNull: [`${pExpr}.plato.precio`, 0] },
                        0
                    ]
                },
                unit: { $ifNull: [`${pExpr}.precioUnitario`, 0] },
                base: {
                    $add: [
                        { $ifNull: [`${pExpr}.precioBase`, 0] },
                        { $ifNull: [`${pExpr}.extraComplementos`, 0] }
                    ]
                },
                prec: { $ifNull: [`${pExpr}.precio`, 0] }
            },
            in: {
                $switch: {
                    branches: [
                        { case: { $gt: ['$$unit', 0] }, then: '$$unit' },
                        { case: { $gt: ['$$base', 0] }, then: '$$base' },
                        { case: { $gt: ['$$prec', 0] }, then: '$$prec' },
                        { case: { $gt: ['$$cat', 0] }, then: '$$cat' }
                    ],
                    default: 0
                }
            }
        }
    };
}

function exprSumaMontosPlatos() {
    return {
        $reduce: {
            input: {
                $zip: {
                    inputs: [
                        { $ifNull: ['$platos', []] },
                        { $ifNull: ['$cantidades', []] }
                    ],
                    useLongestLength: true
                }
            },
            initialValue: 0,
            in: {
                $let: {
                    vars: {
                        p: { $arrayElemAt: ['$$this', 0] },
                        cantArr: { $arrayElemAt: ['$$this', 1] }
                    },
                    in: {
                        $add: [
                            '$$value',
                            {
                                $cond: [
                                    {
                                        $or: [
                                            { $eq: ['$$p', null] },
                                            { $eq: ['$$p.eliminado', true] },
                                            { $eq: ['$$p.anulado', true] }
                                        ]
                                    },
                                    0,
                                    {
                                        $multiply: [
                                            {
                                                $let: {
                                                    vars: { cItem: { $ifNull: ['$$p.cantidad', '$$cantArr'] } },
                                                    in: { $cond: [{ $gt: ['$$cItem', 0] }, '$$cItem', 1] }
                                                }
                                            },
                                            exprPrecioPlatoItem('$$p')
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                }
            }
        }
    };
}

function exprMontoComanda() {
    return {
        $let: {
            vars: {
                calc: { $ifNull: ['$totalCalculado', 0] },
                pt: { $ifNull: ['$precioTotal', 0] },
                orig: { $ifNull: ['$precioTotalOriginal', 0] },
                dePlatos: exprSumaMontosPlatos()
            },
            in: {
                $switch: {
                    branches: [
                        { case: { $gt: ['$$calc', 0] }, then: '$$calc' },
                        { case: { $gt: ['$$pt', 0] }, then: '$$pt' },
                        { case: { $gt: ['$$orig', 0] }, then: '$$orig' }
                    ],
                    default: '$$dePlatos'
                }
            }
        }
    };
}

/** Tras $unwind de platos + $lookup catálogo en `_catDoc`. */
function exprPrecioPlatoUnwind() {
    return {
        $let: {
            vars: {
                cat: { $ifNull: ['$_catDoc.precio', { $ifNull: ['$platos.plato.precio', 0] }] },
                unit: { $ifNull: ['$platos.precioUnitario', 0] },
                base: {
                    $add: [
                        { $ifNull: ['$platos.precioBase', 0] },
                        { $ifNull: ['$platos.extraComplementos', 0] }
                    ]
                },
                prec: { $ifNull: ['$platos.precio', 0] }
            },
            in: {
                $switch: {
                    branches: [
                        { case: { $gt: ['$$unit', 0] }, then: '$$unit' },
                        { case: { $gt: ['$$base', 0] }, then: '$$base' },
                        { case: { $gt: ['$$prec', 0] }, then: '$$prec' },
                        { case: { $gt: ['$$cat', 0] }, then: '$$cat' }
                    ],
                    default: 0
                }
            }
        }
    };
}

function exprFechaComanda() {
    return { $ifNull: ['$tiempoPagado', { $ifNull: ['$tiempoEntregado', '$createdAt'] }] };
}

/**
 * Comandas que alimentan reportes / dashboard mozos.
 * Misma fuente que comandas.html: no exige IsActive (las pagadas se desactivan)
 * ni boucher. Excluye canceladas.
 */
function matchComandasEstadisticas(inicio, fin) {
    return {
        status: { $nin: ['cancelado'] },
        $or: [
            { createdAt: { $gte: inicio, $lte: fin } },
            { tiempoPagado: { $gte: inicio, $lte: fin } },
            { tiempoEntregado: { $gte: inicio, $lte: fin } }
        ]
    };
}

function getComandaModel() {
    const mongoose = require('mongoose');
    try {
        return mongoose.model('Comanda');
    } catch (e) {
        return require('../database/models/comanda.model');
    }
}

async function agregarVentasComandasPorMozo(inicio, fin) {
    const Comanda = getComandaModel();
    return Comanda.aggregate([
        { $match: matchComandasEstadisticas(inicio, fin) },
        {
            $group: {
                _id: '$mozos',
                totalVentas: { $sum: exprMontoComanda() },
                cantidad: { $sum: 1 },
                mesasAtendidas: { $addToSet: '$mesas' }
            }
        }
    ]);
}

async function agregarHorariosComandas(inicio, fin) {
    const Comanda = getComandaModel();
    const rows = await Comanda.aggregate([
        { $match: matchComandasEstadisticas(inicio, fin) },
        {
            $addFields: {
                _fechaStat: exprFechaComanda(),
                _montoStat: exprMontoComanda()
            }
        },
        {
            $project: {
                _montoStat: 1,
                mesas: 1,
                mozos: 1,
                hora: { $hour: { date: '$_fechaStat', timezone: TZ } },
                diaSemana: { $dayOfWeek: { date: '$_fechaStat', timezone: TZ } }
            }
        }
    ]);
    return rows;
}

function etiquetasComplemento(p) {
    const raw = p?.complementosSeleccionados || p?.complementos || [];
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const c of raw) {
        if (!c || c.eliminado) continue;
        if (typeof c === 'string') {
            if (c.trim()) out.push(c.trim());
            continue;
        }
        const label = [c.grupo, c.opcion].filter(Boolean).join(': ');
        if (label) out.push(label);
    }
    return out;
}

function minutosServicioComanda(c) {
    const ini = c?.tiempoEnEspera || c?.createdAt;
    const fin = c?.tiempoPagado || c?.tiempoEntregado;
    if (!ini || !fin) return null;
    const m = (new Date(fin) - new Date(ini)) / 60000;
    if (!Number.isFinite(m) || m <= 0 || m > 24 * 60) return null;
    return Math.round(m * 10) / 10;
}

function getBoucherModel() {
    const mongoose = require('mongoose');
    try {
        return mongoose.model('Boucher');
    } catch (e) {
        return require('../database/models/boucher.model');
    }
}

async function adjuntarMetodosPagoDesdeBouchers(filas) {
    const pendientes = (filas || []).filter(f => !f.metodoPago || f.metodoPago === 'efectivo');
    const ids = pendientes.map(f => f._id).filter(Boolean);
    if (!ids.length) return filas;
    try {
        const Boucher = getBoucherModel();
        const bouchers = await Boucher.find({
            $or: [
                { usadoEnComanda: { $in: ids } },
                { comandas: { $in: ids } }
            ]
        })
            .select('metodoPago metodoPagoLabel usadoEnComanda comandas')
            .lean();
        const map = new Map();
        for (const b of bouchers) {
            const metodo = b.metodoPago || null;
            if (!metodo) continue;
            const targets = [];
            if (b.usadoEnComanda) targets.push(String(b.usadoEnComanda));
            (b.comandas || []).forEach(id => targets.push(String(id)));
            for (const id of targets) {
                const prev = map.get(id);
                if (!prev || prev === 'efectivo') map.set(id, metodo);
            }
        }
        return filas.map(f => {
            if (f.metodoPago && f.metodoPago !== 'efectivo') return f;
            const metodo = map.get(String(f._id));
            return metodo ? { ...f, metodoPago: metodo } : { ...f, metodoPago: f.metodoPago || 'efectivo' };
        });
    } catch (e) {
        return filas.map(f => ({ ...f, metodoPago: f.metodoPago || 'efectivo' }));
    }
}

function mapearFilaReporte(c) {
    const total = Math.round(montoComandaNum(c) * 100) / 100;
    const mozoDoc = c.mozos && typeof c.mozos === 'object' ? c.mozos : null;
    const mesaDoc = c.mesas && typeof c.mesas === 'object' ? c.mesas : null;
    const platos = (c.platos || [])
        .map((p, i) => {
            if (!p || p.eliminado || p.anulado) return null;
            const cantidad = cantidadPlatoNum(p, i, c.cantidades);
            const precio = precioPlatoNum(p);
            return {
                nombre: p.nombre || p.platoNombre || p.plato?.nombre || 'Plato',
                cantidad,
                precio,
                subtotal: Math.round(cantidad * precio * 100) / 100,
                plato: p.plato,
                categoria: p.plato?.categoria || p.platoCategoria || null,
                tipoServicio: p.tipoServicio || 'mesa',
                complementos: etiquetasComplemento(p)
            };
        })
        .filter(Boolean);
    const fechaPago = c.tiempoPagado || c.tiempoEntregado || c.createdAt;
    return {
        _id: c._id,
        fechaPago,
        total,
        subtotal: Math.round((total / 1.18) * 100) / 100,
        igv: Math.round((total - total / 1.18) * 100) / 100,
        isActive: true,
        mozo: mozoDoc ? mozoDoc._id : c.mozos,
        nombreMozo: c.mozoNombre || mozoDoc?.name || mozoDoc?.nombres || '—',
        numMesa: c.mesaNumero || mesaDoc?.nummesa || mesaDoc?.numero || null,
        mesa: mesaDoc
            ? { ...mesaDoc, numero: mesaDoc.nummesa || mesaDoc.numero, nummesa: mesaDoc.nummesa }
            : null,
        platos,
        metodoPago: c.pagoOmitido?.aplicado ? 'omitido' : (c.metodoPago || null),
        metodoPagoLabel: c.metodoPagoLabel || null,
        minutosServicio: minutosServicioComanda(c),
        tiempoEnEspera: c.tiempoEnEspera,
        tiempoPagado: c.tiempoPagado,
        tiempoEntregado: c.tiempoEntregado,
        createdAt: c.createdAt,
        _fuente: 'comanda',
        comandaNumber: c.comandaNumber,
        status: c.status
    };
}

async function listarFilasEstadisticas(inicio, fin) {
    const Comanda = getComandaModel();
    const docs = await Comanda.find(matchComandasEstadisticas(inicio, fin))
        .select('platos cantidades totalCalculado precioTotal precioTotalOriginal tiempoPagado tiempoEntregado tiempoEnEspera createdAt mozos mesas mozoNombre mesaNumero comandaNumber status pagoOmitido metodoPago metodoPagoLabel')
        .populate('mozos', 'name nombres apellidos DNI')
        .populate('mesas', 'nummesa')
        .populate('platos.plato', 'nombre precio categoria')
        .sort({ tiempoPagado: -1, createdAt: -1 })
        .lean();
    const filas = docs.map(mapearFilaReporte);
    return adjuntarMetodosPagoDesdeBouchers(filas);
}

function _diaSemanaVacio() {
    return [
        { dia: 'Lun', ventas: 0, tickets: 0 },
        { dia: 'Mar', ventas: 0, tickets: 0 },
        { dia: 'Mié', ventas: 0, tickets: 0 },
        { dia: 'Jue', ventas: 0, tickets: 0 },
        { dia: 'Vie', ventas: 0, tickets: 0 },
        { dia: 'Sáb', ventas: 0, tickets: 0 },
        { dia: 'Dom', ventas: 0, tickets: 0 }
    ];
}

/** Mongo $dayOfWeek 1=Dom … 7=Sáb → índice Lun=0 … Dom=6 */
const DIA_MONGO_A_LUNES = { 1: 6, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 };

function resumirHorariosComandas(rows) {
    const ventasPorHora = Array.from({ length: 24 }, (_, hora) => ({ hora, total: 0 }));
    const mesasPorHoraSets = Array.from({ length: 24 }, () => new Set());
    const mozoHoraMesas = new Map();
    const ventasPorDiaSemana = _diaSemanaVacio();
    const almuerzo = { ventas: 0, tickets: 0, mesas: new Set() };
    const cena = { ventas: 0, tickets: 0, mesas: new Set() };

    for (const r of rows || []) {
        const h = Number(r.hora);
        const monto = Number(r._montoStat) || 0;
        const mesa = r.mesas != null ? String(r.mesas) : null;
        const mozo = r.mozos != null ? String(r.mozos) : null;
        if (h >= 0 && h < 24) {
            ventasPorHora[h].total = Math.round((ventasPorHora[h].total + monto) * 100) / 100;
            if (mesa) mesasPorHoraSets[h].add(mesa);
            if (mozo && mesa) {
                const k = `${mozo}|${h}`;
                if (!mozoHoraMesas.has(k)) mozoHoraMesas.set(k, new Set());
                mozoHoraMesas.get(k).add(mesa);
            }
        }
        const idxDia = DIA_MONGO_A_LUNES[r.diaSemana];
        if (idxDia !== undefined) {
            ventasPorDiaSemana[idxDia].ventas = Math.round((ventasPorDiaSemana[idxDia].ventas + monto) * 100) / 100;
            ventasPorDiaSemana[idxDia].tickets += 1;
        }
        if (h >= 11 && h <= 16) {
            almuerzo.ventas += monto;
            almuerzo.tickets += 1;
            if (mesa) almuerzo.mesas.add(mesa);
        } else if (h >= 17 && h <= 23) {
            cena.ventas += monto;
            cena.tickets += 1;
            if (mesa) cena.mesas.add(mesa);
        }
    }

    const roundTurno = (t) => ({
        ventas: Math.round(t.ventas * 100) / 100,
        tickets: t.tickets,
        ticketPromedio: t.tickets > 0 ? Math.round((t.ventas / t.tickets) * 100) / 100 : 0,
        mesas: t.mesas.size
    });

    const productividadMozoHora = [];
    mozoHoraMesas.forEach((set, k) => {
        const [mozoId, horaStr] = k.split('|');
        productividadMozoHora.push({
            mozoId,
            hora: Number(horaStr),
            mesas: set.size
        });
    });

    return {
        ventasPorHora,
        mesasPorHora: mesasPorHoraSets.map((set, hora) => ({ hora, mesas: set.size })),
        productividadMozoHora,
        ventasPorDiaSemana,
        comparacionPorTurno: {
            almuerzo: roundTurno(almuerzo),
            cena: roundTurno(cena)
        }
    };
}

module.exports = {
    TZ,
    rangoLima,
    exprMontoComanda,
    exprFechaComanda,
    matchComandasEstadisticas,
    agregarVentasComandasPorMozo,
    agregarHorariosComandas,
    mapearFilaReporte,
    listarFilasEstadisticas,
    resumirHorariosComandas,
    montoComandaNum,
    precioPlatoNum,
    cantidadPlatoNum,
    exprPrecioPlatoUnwind,
    etiquetasComplemento,
    minutosServicioComanda
};
