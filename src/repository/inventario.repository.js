const mongoose = require('mongoose');
const Plato = require('../database/models/plato.model');
const Movimiento = require('../database/models/inventarioMovimiento.model');
const { armarKardex, alertasDeFilas, cambioDeAlerta } = require('../utils/inventarioKardex');
const { claveDe, filasDeRubros, carta } = require('../utils/inventarioRubros');
const { boundsDiaOperativo, ymdOperativo, esSoloFechaYMD } = require('../utils/diaOperativoRestaurante');
const { egresosVentaHasta } = require('../utils/inventarioSalidaVentas');
const Rubro = require('../database/models/inventarioRubro.model');
const logger = require('../utils/logger');

function rango(desde, hasta) {
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
    const ini = boundsDiaOperativo(iniStr);
    const fin = boundsDiaOperativo(finStr);
    return { desde: ini.inicio, hasta: fin.fin };
}

function hoy() {
    const d = ymdOperativo();
    return rango(d, d);
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

async function kardex(desdeStr, hastaStr) {
    const { desde, hasta } = (desdeStr || hastaStr) ? rango(desdeStr, hastaStr || desdeStr) : hoy();
    const platos = await platosActivos();
    const ids = platos.map((p) => p._id);
    const movs = ids.length ? await movimientosHasta(ids, hasta) : [];
    const filas = armarKardex(platos, movs, desde, hasta);
    return { desde, hasta, filas };
}

async function listarMovimientos({ plato, tipo, desde, hasta }) {
    const filtro = {};
    if (desde || hasta) {
        const r = rango(desde || hasta, hasta || desde);
        filtro.fecha = { $gte: r.desde, $lte: r.hasta };
    }
    if (tipo === 'crudo' || tipo === 'cocido') filtro.tipoProducto = tipo;
    if (plato && mongoose.Types.ObjectId.isValid(plato)) filtro.plato = plato;
    const docs = await Movimiento.find(filtro)
        .sort({ fecha: -1 })
        .limit(500)
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

async function kardexCarta(desdeStr, hastaStr) {
    const { desde, hasta } = (desdeStr || hastaStr) ? rango(desdeStr, hastaStr || desdeStr) : hoy();
    const [guardados, ventasPack, umbrales] = await Promise.all([
        Movimiento.find({ rubro: { $nin: [null, ''] }, fecha: { $lte: hasta } })
            .select('rubro tipoProducto clase cantidad fecha')
            .lean(),
        egresosVentaHasta(hasta),
        umbralesRubro()
    ]);
    const movs = guardados.concat(ventasPack.movs);
    const filas = filasDeRubros(movs, desde, hasta, umbrales);
    const desdeMs = desde.getTime();
    const hastaMs = hasta.getTime();
    const ventas = (ventasPack.ventas || []).filter((v) => {
        const t = new Date(v.fecha).getTime();
        return t >= desdeMs && t <= hastaMs;
    });
    return { desde, hasta, filas, carta: carta(), ventas };
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
    const [guardados, ventasPack] = await Promise.all([
        Movimiento.find({ rubro: { $nin: [null, ''] } })
            .select('rubro tipoProducto clase cantidad fecha')
            .lean(),
        egresosVentaHasta(hasta)
    ]);
    const filas = filasDeRubros(guardados.concat(ventasPack.movs), new Date(0), hasta, await umbralesRubro());
    return alertasDeFilas(filas);
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
    eliminarHoy
};
