'use strict';

const moment = require('moment-timezone');

const TZ = 'America/Lima';

function esSoloFechaYMD(str) {
    return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str.trim());
}

function parseLimaBound(str, { end } = {}) {
    if (!str) return null;
    const s = String(str).trim();
    if (esSoloFechaYMD(s)) {
        const m = moment.tz(s, 'YYYY-MM-DD', TZ);
        return (end ? m.endOf('day') : m.startOf('day')).toDate();
    }
    const m = moment.parseZone(s);
    if (!m.isValid()) return null;
    return m.toDate();
}

function rangoLima(fechaInicio, fechaFin) {
    const fallback = moment.tz(TZ).format('YYYY-MM-DD');
    const inicioStr = fechaInicio || fallback;
    const finStr = fechaFin || (esSoloFechaYMD(String(inicioStr)) ? inicioStr : fechaInicio) || fallback;
    return {
        inicio: parseLimaBound(inicioStr, { end: false }) || moment.tz(TZ).startOf('day').toDate(),
        fin: parseLimaBound(finStr, { end: true }) || moment.tz(TZ).endOf('day').toDate()
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

function comandaTieneDescuento(c) {
    return Number(c?.descuento) > 0 || Number(c?.montoDescuento) > 0;
}

function montoDescuentoComandaNum(c) {
    const n = Number(c?.montoDescuento);
    if (Number.isFinite(n) && n > 0) return n;
    if (!comandaTieneDescuento(c)) return 0;
    const sin = Number(c?.totalSinDescuento);
    const neto = montoComandaNum(c);
    if (Number.isFinite(sin) && sin > neto) return Number((sin - neto).toFixed(2));
    return 0;
}

let configMonedaCache = { igvPorcentaje: 18, preciosIncluyenIGV: false };

function setConfigMonedaEstadisticas(cfg) {
    configMonedaCache = {
        igvPorcentaje: Number(cfg?.igvPorcentaje) > 0 ? Number(cfg.igvPorcentaje) : 18,
        preciosIncluyenIGV: cfg?.preciosIncluyenIGV === true
    };
    return configMonedaCache;
}

function getConfigMonedaEstadisticas() {
    return configMonedaCache;
}

async function cargarConfigMonedaEstadisticas() {
    try {
        const ConfiguracionSistema = require('../database/models/configuracionSistema.model');
        const doc = await ConfiguracionSistema.findById('configuracion_unica')
            .select('igvPorcentaje preciosIncluyenIGV')
            .lean();
        if (doc) setConfigMonedaEstadisticas(doc);
    } catch (e) {
        /* conservar cache / default */
    }
    return configMonedaCache;
}

function tasaIgvDeConfig(config) {
    const cfg = config || getConfigMonedaEstadisticas();
    const pct = Number(cfg.igvPorcentaje);
    return 1 + ((Number.isFinite(pct) && pct > 0 ? pct : 18) / 100);
}

function platosYaIncluyenIgv(c, brutoPlatos) {
    const bruto = Number(brutoPlatos);
    if (!(bruto > 0)) return false;
    const sin = Number(c?.totalSinDescuento);
    if (Number.isFinite(sin) && sin > 0) {
        return Math.abs(sin - bruto) / Math.max(sin, bruto) < 0.03;
    }
    if (comandaTieneDescuento(c)) return false;
    const tot = firstPositive(c.totalCalculado, c.precioTotal, c.precioTotalOriginal);
    if (!(tot > 0)) return false;
    return Math.abs(tot - bruto) / Math.max(tot, bruto) < 0.03;
}

/** IGV sobre precio de catálogo/snapshot. Si el catálogo ya incluye IGV, no dobla. */
function factorIgvCatalogo(c, config) {
    const cfg = config || getConfigMonedaEstadisticas();
    if (cfg.preciosIncluyenIGV === true) return 1;
    const brutoPlatos = montoDesdePlatos(c);
    if (platosYaIncluyenIgv(c, brutoPlatos)) return 1;
    return tasaIgvDeConfig(cfg);
}

/**
 * Factor para llevar el precio de línea al total de la comanda.
 * Con descuento prorratea al neto. Sin descuento: precio del plato
 * (más IGV solo si el catálogo está sin IGV). No usa totales inflados
 * por platos eliminados (p. ej. 85/79 → 35.51).
 */
function factorNetoComanda(c, config) {
    const brutoPlatos = montoDesdePlatos(c);
    if (!(brutoPlatos > 0)) return 0;
    if (comandaTieneDescuento(c)) {
        return montoComandaNum(c, config) / brutoPlatos;
    }
    return factorIgvCatalogo(c, config);
}

/**
 * Total de la comanda = suma de platos activos (igual que desglose de reportes).
 * Con descuento usa totalCalculado. Sin descuento no usa precioTotal si aún
 * incluye líneas eliminadas.
 */
function montoComandaNum(c, config) {
    if (!c) return 0;
    if (comandaTieneDescuento(c)) {
        const calc = Number(c.totalCalculado);
        if (Number.isFinite(calc) && calc >= 0) return calc;
        const sin = Number(c.totalSinDescuento);
        const desc = Number(c.montoDescuento) || 0;
        if (Number.isFinite(sin) && sin >= 0) return Math.max(0, Number((sin - desc).toFixed(2)));
        return 0;
    }
    const dePlatos = montoDesdePlatos(c);
    if (dePlatos > 0) {
        return Number((dePlatos * factorIgvCatalogo(c, config)).toFixed(2));
    }
    return firstPositive(c.totalCalculado, c.precioTotal, c.precioTotalOriginal);
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
                                            { $in: ['$$p.eliminado', [true, 1, 'true']] },
                                            { $in: ['$$p.anulado', [true, 1, 'true']] }
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
    const cfg = getConfigMonedaEstadisticas();
    const tasa = cfg.preciosIncluyenIGV === true ? 1 : tasaIgvDeConfig(cfg);
    const valorPlatos = tasa === 1 ? '$$dePlatos' : { $multiply: ['$$dePlatos', tasa] };
    const montoSinDescuento = {
        $cond: [
            { $gt: ['$$dePlatos', 0] },
            valorPlatos,
            {
                $switch: {
                    branches: [
                        { case: { $gt: ['$$calc', 0] }, then: '$$calc' },
                        { case: { $gt: ['$$pt', 0] }, then: '$$pt' },
                        { case: { $gt: ['$$orig', 0] }, then: '$$orig' }
                    ],
                    default: 0
                }
            }
        ]
    };
    return {
        $let: {
            vars: {
                calc: { $ifNull: ['$totalCalculado', 0] },
                pt: { $ifNull: ['$precioTotal', 0] },
                orig: { $ifNull: ['$precioTotalOriginal', 0] },
                dePlatos: exprSumaMontosPlatos(),
                tieneDesc: {
                    $or: [
                        { $gt: [{ $ifNull: ['$descuento', 0] }, 0] },
                        { $gt: [{ $ifNull: ['$montoDescuento', 0] }, 0] }
                    ]
                }
            },
            in: {
                $cond: [
                    '$$tieneDesc',
                    { $max: ['$$calc', 0] },
                    montoSinDescuento
                ]
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
 * Comanda vigente para operación, reportes y cierre de caja.
 * Soft-delete (`eliminada: true`) permanece en Mongo como rastro interno;
 * el registro oficial es auditoría. No debe aparecer en reportes ni listados.
 */
function matchComandaVigente(extra = {}) {
    return {
        eliminada: { $ne: true },
        status: { $nin: ['cancelado'] },
        ...extra
    };
}

/** Tickets que siguen contando ventas. Los de comanda eliminada solo viven en auditoría. */
function matchBoucherVigente(extra = {}) {
    return {
        eliminadaPorComanda: { $ne: true },
        ...extra
    };
}

/** Misma visibilidad que comandas.html para ciclo abierto (GET /comanda?incluirPagadas). */
const STATUS_COMANDA_CERRADA = ['pagado', 'completado', 'cancelado'];

/** Ventas que entran al total de reportes / cierre (platos cobrados o entregados). */
const STATUS_COMANDA_VENDIDA = ['pagado', 'entregado', 'completado'];

function esComandaVendida(c) {
    return STATUS_COMANDA_VENDIDA.includes(c?.status);
}

function filtroNoIncluidoEnCierreComanda() {
    return {
        $or: [
            { incluidoEnCierre: null },
            { incluidoEnCierre: { $exists: false } }
        ]
    };
}

/**
 * Marca ObjectId o string de un cierre (datos viejos).
 */
function matchIncluidoEnEsteCierre(cierreId) {
    return {
        $or: [
            { incluidoEnCierre: cierreId },
            { incluidoEnCierre: String(cierreId) }
        ]
    };
}

/**
 * Cierres viejos sin marca incluidoEnCierre: mismas fechas del período,
 * sin incluir comandas ya asignadas a otro cierre.
 */
function matchComandasPeriodoDeCierre(periodoInicio, periodoFin, cierreId) {
    return {
        $and: [
            matchComandaVigente(),
            {
                $or: [
                    { createdAt: { $gte: periodoInicio, $lte: periodoFin } },
                    { tiempoPagado: { $gte: periodoInicio, $lte: periodoFin } },
                    { tiempoEntregado: { $gte: periodoInicio, $lte: periodoFin } }
                ]
            },
            {
                $or: [
                    { incluidoEnCierre: cierreId },
                    { incluidoEnCierre: String(cierreId) },
                    { incluidoEnCierre: null },
                    { incluidoEnCierre: { $exists: false } }
                ]
            }
        ]
    };
}

/**
 * Comandas del período de cierre: misma ventana de fechas que reportes
 * (createdAt / pagado / entregado) y aún no marcadas en un cierre.
 * Usa $and para no pisar los $or de fecha y de incluidoEnCierre.
 */
function matchComandasCierrePendiente(periodoInicio, periodoFin, { soloVendidas = false } = {}) {
    const extra = soloVendidas ? { status: { $in: STATUS_COMANDA_VENDIDA } } : {};
    return {
        $and: [
            matchComandaVigente(extra),
            {
                $or: [
                    { createdAt: { $gte: periodoInicio, $lte: periodoFin } },
                    { tiempoPagado: { $gte: periodoInicio, $lte: periodoFin } },
                    { tiempoEntregado: { $gte: periodoInicio, $lte: periodoFin } }
                ]
            },
            filtroNoIncluidoEnCierreComanda()
        ]
    };
}

function matchComandaAbiertaEnTabla(extra = {}) {
    return {
        eliminada: { $ne: true },
        IsActive: { $ne: false, $exists: true },
        status: { $nin: STATUS_COMANDA_CERRADA },
        ...extra
    };
}

/**
 * Comandas que alimentan reportes / dashboard mozos.
 * Misma fuente que comandas.html: no exige IsActive (las pagadas se desactivan)
 * ni boucher. Excluye canceladas y eliminadas.
 */
function matchComandasEstadisticas(inicio, fin) {
    return matchComandaVigente({
        $or: [
            { createdAt: { $gte: inicio, $lte: fin } },
            { tiempoPagado: { $gte: inicio, $lte: fin } },
            { tiempoEntregado: { $gte: inicio, $lte: fin } }
        ]
    });
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
    const filas = await listarFilasEstadisticas(inicio, fin);
    return agruparVentasPorMozo(filas);
}

async function agregarHorariosComandas(inicio, fin) {
    const filas = await listarFilasEstadisticas(inicio, fin);
    return filasARowsHorario(filas);
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

function mapearFilaReporte(c, config) {
    const cfg = config || getConfigMonedaEstadisticas();
    const factor = factorNetoComanda(c, cfg);
    const mozoDoc = c.mozos && typeof c.mozos === 'object' ? c.mozos : null;
    const mesaDoc = c.mesas && typeof c.mesas === 'object' ? c.mesas : null;
    const platos = (c.platos || [])
        .map((p, i) => {
            if (!p || p.eliminado || p.anulado) return null;
            const cantidad = cantidadPlatoNum(p, i, c.cantidades);
            const precioBase = precioPlatoNum(p);
            const precio = Math.round(precioBase * factor * 100) / 100;
            return {
                nombre: p.nombre || p.platoNombre || p.plato?.nombre || 'Plato',
                cantidad,
                precio,
                subtotal: Math.round(cantidad * precioBase * factor * 100) / 100,
                plato: p.plato,
                categoria: p.plato?.categoria || p.platoCategoria || null,
                tipoServicio: p.tipoServicio || 'mesa',
                complementos: etiquetasComplemento(p)
            };
        })
        .filter(Boolean);
    const totalLineas = Math.round(platos.reduce((s, p) => s + Number(p.subtotal || 0), 0) * 100) / 100;
    const total = (platos.length || comandaTieneDescuento(c))
        ? totalLineas
        : Math.round(montoComandaNum(c, cfg) * 100) / 100;
    const tasa = tasaIgvDeConfig(cfg);
    const fechaPago = c.tiempoPagado || c.tiempoEntregado || c.createdAt;
    return {
        _id: c._id,
        fechaPago,
        total,
        subtotal: Math.round((total / tasa) * 100) / 100,
        igv: Math.round((total - total / tasa) * 100) / 100,
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
        status: c.status,
        descuento: Number(c.descuento) || 0,
        montoDescuento: montoDescuentoComandaNum(c),
        motivoDescuento: c.motivoDescuento || null,
        configuracionIGV: {
            igvPorcentaje: cfg.igvPorcentaje,
            preciosIncluyenIGV: cfg.preciosIncluyenIGV === true
        }
    };
}

/** Misma cifra que reportes.html (suma de líneas de platos, descuentos ya aplicados). */
function montoFilaReporte(c, config) {
    return Number(mapearFilaReporte(c, config).total) || 0;
}

function sumaMontosReporte(comandas, config) {
    return Number((comandas || []).reduce((s, c) => s + montoFilaReporte(c, config), 0).toFixed(2));
}

/** Agrupa filas de reportes por mozo (misma cifra que Platos). */
function agruparVentasPorMozo(filas) {
    const map = new Map();
    for (const f of filas || []) {
        const rawId = f.mozo;
        const key = rawId != null && rawId !== '' ? String(rawId) : '__none__';
        if (!map.has(key)) {
            map.set(key, {
                _id: rawId || null,
                totalVentas: 0,
                cantidad: 0,
                mesasAtendidas: []
            });
        }
        const row = map.get(key);
        row.totalVentas = Number((row.totalVentas + (Number(f.total) || 0)).toFixed(2));
        row.cantidad += 1;
        const mesaId = f.mesa && (f.mesa._id || f.mesa);
        const mesa = mesaId != null ? mesaId : f.numMesa;
        if (mesa != null && mesa !== '') {
            const s = String(mesa);
            if (!row.mesasAtendidas.some((m) => String(m) === s)) row.mesasAtendidas.push(mesa);
        }
    }
    return Array.from(map.values());
}

function filasARowsHorario(filas) {
    return (filas || []).map((f) => {
        const d = moment(f.fechaPago || f.createdAt).tz(TZ);
        const mesaId = f.mesa && (f.mesa._id || f.mesa);
        return {
            _montoStat: Number(f.total) || 0,
            mesas: mesaId != null ? mesaId : (f.numMesa != null ? f.numMesa : null),
            mozos: f.mozo || null,
            hora: d.isValid() ? d.hour() : 0,
            diaSemana: d.isValid() ? d.day() + 1 : 1
        };
    });
}

async function listarFilasEstadisticas(inicio, fin) {
    const cfg = await cargarConfigMonedaEstadisticas();
    const Comanda = getComandaModel();
    const docs = await Comanda.find(matchComandasEstadisticas(inicio, fin))
        .select('platos cantidades totalCalculado precioTotal precioTotalOriginal descuento montoDescuento totalSinDescuento motivoDescuento tiempoPagado tiempoEntregado tiempoEnEspera createdAt mozos mesas mozoNombre mesaNumero comandaNumber status pagoOmitido metodoPago metodoPagoLabel')
        .populate('mozos', 'name nombres apellidos DNI')
        .populate('mesas', 'nummesa')
        .populate('platos.plato', 'nombre precio categoria')
        .sort({ tiempoPagado: -1, createdAt: -1 })
        .lean();
    const filas = docs.map((c) => mapearFilaReporte(c, cfg));
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
    parseLimaBound,
    exprMontoComanda,
    exprFechaComanda,
    matchComandaVigente,
    matchBoucherVigente,
    matchComandaAbiertaEnTabla,
    STATUS_COMANDA_CERRADA,
    STATUS_COMANDA_VENDIDA,
    esComandaVendida,
    matchComandasEstadisticas,
    matchComandasCierrePendiente,
    matchIncluidoEnEsteCierre,
    matchComandasPeriodoDeCierre,
    filtroNoIncluidoEnCierreComanda,
    montoFilaReporte,
    sumaMontosReporte,
    agruparVentasPorMozo,
    filasARowsHorario,
    agregarVentasComandasPorMozo,
    agregarHorariosComandas,
    mapearFilaReporte,
    listarFilasEstadisticas,
    setConfigMonedaEstadisticas,
    getConfigMonedaEstadisticas,
    cargarConfigMonedaEstadisticas,
    resumirHorariosComandas,
    montoComandaNum,
    comandaTieneDescuento,
    montoDescuentoComandaNum,
    factorNetoComanda,
    precioPlatoNum,
    cantidadPlatoNum,
    exprPrecioPlatoUnwind,
    etiquetasComplemento,
    minutosServicioComanda
};
