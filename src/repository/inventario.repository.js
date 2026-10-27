const mongoose = require('mongoose');
const Plato = require('../database/models/plato.model');
const Movimiento = require('../database/models/inventarioMovimiento.model');
const { armarKardex, alertasDeFilas, aplicarVentasEnFilas, cambioDeAlerta } = require('../utils/inventarioKardex');
const { claveDe, clavesGuardables, filasDeRubros, carta } = require('../utils/inventarioRubros');
const { boundsDiaCalendario, boundsDiaOperativo, ymdOperativo, esSoloFechaYMD } = require('../utils/diaOperativoRestaurante');
const { egresosVentaHasta } = require('../utils/inventarioSalidaVentas');
const Rubro = require('../database/models/inventarioRubro.model');
const Reporte = require('../database/models/inventarioReporte.model');
const logger = require('../utils/logger');

function rango(desde, hasta, ciclo) {
    const iniStr = String(desde || '').trim();
    const finStr = String(hasta || desde || '').trim();
    if (!esSoloFechaYMD(iniStr) || !esSoloFechaYMD(finStr)) {
        const err = new Error('Usa fechas YYYY-MM-DD');
        err.statusCode = 400;
        throw err;
    }
    if (finStr < iniStr) {
        const err = new Error('La fecha hasta es anterior a desde');
        err.statusCode = 400;
        throw err;
    }
    const borde = String(ciclo) === '04' ? boundsDiaOperativo : boundsDiaCalendario;
    const ini = borde(iniStr);
    const fin = borde(finStr);
    return { desde: ini.inicio, hasta: fin.fin };
}

function hoy() {
    const d = ymdOperativo();
    return rango(d, d, '04');
}

function fechaMovimiento(valor) {
    if (!valor) return new Date();
    const f = new Date(valor);
    return Number.isNaN(f.getTime()) ? new Date() : f;
}

async function platosActivos() {
    return Plato.find({ isActive: { $ne: false } })
        .select('id nombre isActive alertaCritica')
        .sort({ nombre: 1 })
        .lean();
}

async function movimientosHasta(platoIds, hasta, extra) {
    const filtro = { plato: { $in: platoIds }, fecha: { $lte: hasta } };
    if (extra && extra.tipo) filtro.tipoProducto = extra.tipo;
    if (extra && extra.plato) filtro.plato = extra.plato;
    return Movimiento.find(filtro).select('plato tipoProducto clase cantidad fecha').lean();
}

async function kardex(desdeStr, hastaStr, ciclo) {
    const { desde, hasta } = (desdeStr || hastaStr) ? rango(desdeStr, hastaStr || desdeStr, ciclo) : hoy();
    const platos = await platosActivos();
    const ids = platos.map((p) => p._id);
    const movs = ids.length ? await movimientosHasta(ids, hasta) : [];
    const filas = armarKardex(platos, movs, desde, hasta);
    return { desde, hasta, filas };
}

async function listarMovimientos({ plato, tipo, desde, hasta, ciclo }) {
    const filtro = {};
    if (desde || hasta) {
        const r = rango(desde || hasta, hasta || desde, ciclo);
        filtro.fecha = { $gte: r.desde, $lte: r.hasta };
    }
    if (tipo === 'crudo' || tipo === 'cocido') filtro.tipoProducto = tipo;
    if (plato && mongoose.Types.ObjectId.isValid(plato)) filtro.plato = plato;
    const docs = await Movimiento.find(filtro)
        .sort({ fecha: -1 })
        .limit(3000)
        .populate('usuario', 'name')
        .lean();
    return docs.map((d) => ({
        _id: d._id,
        plato: d.plato,
        platoId: d.platoId,
        nombre: d.nombre,
        tipoProducto: d.tipoProducto,
        clase: d.clase,
        cantidad: d.cantidad,
        motivo: d.motivo,
        comanda: d.comanda || null,
        usuario: d.usuario && d.usuario.name ? d.usuario.name : '',
        rubro: d.rubro || '',
        fecha: d.fecha
    }));
}

function emitirAlerta(payload) {
    const io = global.io;
    if (!io || typeof io.of !== 'function') return;
    try {
        io.of('/cocina').emit('inventario:alerta', payload);
        io.of('/admin').emit('inventario:alerta', payload);
    } catch (error) {
        logger.error('No se pudo emitir inventario:alerta', { error: error.message });
    }
}

async function alertasActuales() {
    const abierto = new Date(0);
    const platos = await platosActivos();
    const ids = platos.map((p) => p._id);
    const movs = ids.length
        ? await Movimiento.find({ plato: { $in: ids } }).select('plato tipoProducto clase cantidad fecha').lean()
        : [];
    const filas = armarKardex(platos, movs, abierto, new Date());
    const dePlatos = alertasDeFilas(filas);
    const deRubros = await alertasRubro();
    return dePlatos.concat(deRubros);
}

async function crearMovimiento(data, usuarioId) {
    const tipo = data.tipoProducto;
    const clase = data.clase;
    if (tipo !== 'crudo' && tipo !== 'cocido') {
        const err = new Error('El tipo es crudo o cocido');
        err.statusCode = 400;
        throw err;
    }
    if (clase !== 'ingreso' && clase !== 'egreso' && clase !== 'regulacion' && clase !== 'inventario') {
        const err = new Error('La clase es ingreso, egreso, regulación o inventario');
        err.statusCode = 400;
        throw err;
    }
    const cantidad = Number(data.cantidad);
    if (!Number.isFinite(cantidad) || (cantidad === 0 && clase !== 'inventario')) {
        const err = new Error('La cantidad no puede ser 0');
        err.statusCode = 400;
        throw err;
    }
    const motivo = String(data.motivo || '').trim();
    if (!motivo) {
        const err = new Error('Escribe el motivo');
        err.statusCode = 400;
        throw err;
    }
    const rubro = claveDe(data.rubro);
    let plato = null;
    if (!rubro) {
        plato = await Plato.findById(data.plato).select('id nombre isActive').lean();
        if (!plato || plato.isActive === false) {
            const err = new Error('Ese plato no está activo');
            err.statusCode = 400;
            throw err;
        }
    }
    const antes = await alertasActuales();
    const doc = await Movimiento.create({
        plato: plato ? plato._id : null,
        platoId: plato ? plato.id : 0,
        rubro: rubro ? rubro.clave : '',
        nombre: rubro ? rubro.nombre : plato.nombre,
        tipoProducto: tipo,
        clase,
        cantidad,
        motivo,
        comanda: data.comanda && mongoose.Types.ObjectId.isValid(data.comanda) ? data.comanda : null,
        usuario: usuarioId && mongoose.Types.ObjectId.isValid(usuarioId) ? usuarioId : null,
        fecha: fechaMovimiento(data.fecha)
    });
    const despues = await alertasActuales();
    const cambio = cambioDeAlerta(antes, despues, rubro ? rubro.clave : String(plato._id), tipo);
    if (cambio) emitirAlerta({ alertas: despues, cambio });
    return doc.toObject();
}

async function umbralesRubro() {
    const docs = await Rubro.find({}).lean();
    const map = {};
    docs.forEach((d) => { map[d.clave] = { crudo: d.crudo || 0, cocido: d.cocido || 0 }; });
    return map;
}

function lineasReporte(filas, ventas) {
    const ventaPorRubro = {};
    (ventas || []).forEach((v) => {
        const rubro = v && (v.rubro || v.plato);
        const cantidad = Number(v && v.cantidad) || 0;
        if (!rubro || cantidad <= 0) return;
        ventaPorRubro[rubro] = (ventaPorRubro[rubro] || 0) + cantidad;
    });
    return (filas || []).map((f) => {
        const rubro = f.rubro || f.plato || '';
        const anterior = Number(f.saldoInicial) || 0;
        const ingreso = Number(f.ingresos) || 0;
        const reg = Number(f.regulacion) || 0;
        const venta = f.tipoProducto === 'cocido' ? (ventaPorRubro[rubro] || 0) : 0;
        const salida = (Number(f.egreso) || 0) + venta;
        const base = reg !== 0 ? anterior + reg : anterior + ingreso;
        return {
            rubro,
            nombre: f.nombre || '',
            tipoProducto: f.tipoProducto,
            saldoAnterior: anterior,
            ingreso,
            salida,
            saldoFinal: base - salida
        };
    }).filter((l) => l.saldoAnterior || l.ingreso || l.salida || l.saldoFinal);
}

async function filasCartaEn(desde, hasta) {
    const [guardados, ventasPack, umbrales] = await Promise.all([
        Movimiento.find({ rubro: { $nin: [null, ''] }, fecha: { $lte: hasta } })
            .select('rubro tipoProducto clase cantidad fecha')
            .lean(),
        egresosVentaHasta(hasta),
        umbralesRubro()
    ]);
    const filas = filasDeRubros(guardados, desde, hasta, umbrales);
    const desdeMs = desde.getTime();
    const hastaMs = hasta.getTime();
    const ventas = (ventasPack.ventas || []).filter((v) => {
        const t = new Date(v.fecha).getTime();
        return t >= desdeMs && t <= hastaMs;
    });
    return { filas, ventas };
}

function paseDeTipo(motivo) {
    return /^Pasa (?:a|de) (?:crudo|cocido) /.test(String(motivo || ''));
}

async function transformacionesEn(desde, hasta) {
    const movs = await Movimiento.find({
        clase: 'ingreso',
        cantidad: { $lt: 0 },
        motivo: { $regex: '^Pasa a ' },
        fecha: { $gte: desde, $lte: hasta }
    }).select('nombre rubro motivo cantidad').lean();
    const map = {};
    movs.forEach((m) => {
        if (paseDeTipo(m.motivo)) return;
        const origen = m.nombre || m.rubro || '';
        const destino = String(m.motivo || '').slice(7);
        const key = origen + '\0' + destino;
        if (!map[key]) map[key] = { origen, destino, cantidad: 0 };
        map[key].cantidad += Math.abs(Number(m.cantidad) || 0);
    });
    return Object.keys(map).map((k) => map[k]).filter((t) => t.cantidad);
}

async function cerrarDiaSiToca(fecha) {
    if (!fecha || fecha >= ymdOperativo()) return null;
    const ya = await Reporte.findOne({ fecha }).lean();
    if (ya && ya.cerrado && Array.isArray(ya.transformaciones) && ya.transformaciones.length) return ya;
    const { desde, hasta } = rango(fecha, fecha, '04');
    const { filas, ventas } = await filasCartaEn(desde, hasta);
    const lineas = lineasReporte(filas, ventas);
    const transformaciones = await transformacionesEn(desde, hasta);
    const doc = await Reporte.findOneAndUpdate(
        { fecha },
        { $set: { lineas, transformaciones, cerradoEn: new Date(), cerrado: true } },
        { upsert: true, new: true }
    ).lean();
    return doc;
}

async function kardexCarta(desdeStr, hastaStr, ciclo) {
    const operativo = String(ciclo) === '04';
    if (operativo) await cerrarDiaSiToca(diaAnterior(ymdOperativo()));
    const { desde, hasta } = (desdeStr || hastaStr)
        ? rango(desdeStr, hastaStr || desdeStr, ciclo)
        : hoy();
    const { filas, ventas } = await filasCartaEn(desde, hasta);
    const data = { desde, hasta, filas, carta: carta(), ventas };
    if (operativo && desdeStr && desdeStr === (hastaStr || desdeStr)) {
        const fecha = String(desdeStr);
        const hoyOp = ymdOperativo();
        const lineas = lineasReporte(filas, ventas);
        const transformaciones = await transformacionesEn(desde, hasta);
        if (fecha < hoyOp) {
            const doc = await cerrarDiaSiToca(fecha);
            data.reporte = {
                fecha,
                guardado: true,
                lineas: doc ? doc.lineas : lineas,
                transformaciones
            };
        } else if (fecha === hoyOp) {
            await Reporte.findOneAndUpdate(
                { fecha },
                { $set: { lineas, transformaciones, cerradoEn: new Date(), cerrado: false } },
                { upsert: true }
            );
            data.reporte = { fecha, guardado: false, lineas, transformaciones };
        } else {
            data.reporte = { fecha, guardado: false, lineas, transformaciones };
        }
    }
    return data;
}

function diaAnterior(ymd) {
    const antes = new Date(boundsDiaOperativo(ymd).inicio.getTime() - 1000);
    return ymdOperativo(antes);
}

async function guardarUmbralRubro(clave, body) {
    const def = claveDe(clave);
    if (!def) {
        const err = new Error('Ese producto no está en el inventario');
        err.statusCode = 400;
        throw err;
    }
    const minimo = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return 0;
        return n;
    };
    await Rubro.findOneAndUpdate(
        { clave: def.clave },
        { crudo: minimo(body && body.crudo), cocido: minimo(body && body.cocido) },
        { upsert: true, new: true }
    );
    const despues = await alertasActuales();
    emitirAlerta({ alertas: despues, cambio: null });
    return { clave: def.clave };
}

async function alertasRubro() {
    const hasta = new Date();
    const [guardados, ventasPack, umbrales] = await Promise.all([
        Movimiento.find({ rubro: { $nin: [null, ''] } })
            .select('rubro tipoProducto clase cantidad fecha')
            .lean(),
        egresosVentaHasta(hasta),
        umbralesRubro()
    ]);
    const filas = aplicarVentasEnFilas(
        filasDeRubros(guardados, new Date(0), hasta, umbrales),
        ventasPack.ventas
    );
    return alertasDeFilas(filas);
}

let avisoTimer = null;
function avisarAlertas() {
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(async () => {
        try {
            const alertas = await alertasActuales();
            emitirAlerta({ alertas, cambio: null });
        } catch (error) {
            logger.warn('No se pudo avisar el inventario', { error: error.message });
        }
    }, 800);
}

async function ponerEnCero(usuarioId) {
    const ahora = new Date();
    const usuario = usuarioId && mongoose.Types.ObjectId.isValid(usuarioId) ? usuarioId : null;
    const docs = [];
    clavesGuardables().forEach((d) => {
        ['crudo', 'cocido'].forEach((tipo) => {
            docs.push({
                plato: null,
                platoId: 0,
                rubro: d.clave,
                nombre: d.nombre,
                tipoProducto: tipo,
                clase: 'inventario',
                cantidad: 0,
                motivo: 'Puesta en cero',
                usuario,
                fecha: ahora
            });
        });
    });
    if (docs.length) await Movimiento.insertMany(docs);
    avisarAlertas();
    return { puestos: docs.length };
}

async function eliminarHoy() {
    const { desde, hasta } = hoy();
    const docs = await Movimiento.find({ fecha: { $gte: desde, $lte: hasta } })
        .select('nombre rubro tipoProducto clase cantidad motivo fecha')
        .lean();
    if (docs.length) {
        await Movimiento.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
    }
    const despues = await alertasActuales();
    emitirAlerta({ alertas: despues, cambio: null });
    return { eliminados: docs.length, movimientos: docs };
}

module.exports = {
    kardex,
    kardexCarta,
    listarMovimientos,
    crearMovimiento,
    alertasActuales,
    guardarUmbralRubro,
    eliminarHoy,
    ponerEnCero,
    avisarAlertas
};
