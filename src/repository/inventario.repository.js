const mongoose = require('mongoose');
const Plato = require('../database/models/plato.model');
const Movimiento = require('../database/models/inventarioMovimiento.model');
const { armarKardex, alertasDeFilas, aplicarVentasEnFilas, cambioDeAlerta } = require('../utils/inventarioKardex');
const { claveDe, clavesGuardables, filasDeRubros, extrasDeVentas, carta } = require('../utils/inventarioRubros');
const { sanearLista, clavesExtra, leerGuardados } = require('../utils/inventarioMapas');
const MapaSemantico = require('../database/models/inventarioMapa.model');
const { boundsDiaCalendario, boundsDiaOperativo, ymdOperativo, esSoloFechaYMD } = require('../utils/diaOperativoRestaurante');
const { egresosVentaHasta } = require('../utils/inventarioSalidaVentas');
const { atribuirVentas, semillaCocido, validarCocidoConfig, esMateria } = require('../utils/inventarioCascadaVenta');
const Rubro = require('../database/models/inventarioRubro.model');
const Reporte = require('../database/models/inventarioReporte.model');
const logger = require('../utils/logger');

function rango(desde, hasta, ciclo) {
    const iniStr = String(desde || '').trim();
    const finStr = String(hasta || desde || '').trim();
    const iso = (s) => !esSoloFechaYMD(s);
    if ((iso(iniStr) || iso(finStr)) && (esSoloFechaYMD(iniStr) || esSoloFechaYMD(finStr))) {
        const err = new Error('Usa las dos fechas en el mismo formato');
        err.statusCode = 400;
        throw err;
    }
    if (iso(iniStr)) {
        const desde = new Date(iniStr);
        const hasta = new Date(finStr);
        if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || hasta < desde) {
            const err = new Error('Rango de fechas inválido');
            err.statusCode = 400;
            throw err;
        }
        return { desde, hasta };
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
    let rubro = claveDe(data.rubro);
    if (!rubro && data.rubro) {
        const extra = clavesExtra(await leerGuardados().catch(() => [])).find((e) => e.clave === data.rubro);
        if (extra) rubro = extra;
    }
    if (!rubro && /^[a-z0-9]+(?:-[a-z0-9]+){0,12}$/.test(String(data.rubro || '')) && String(data.rubro).length <= 80) {
        rubro = { clave: String(data.rubro), nombre: String(data.nombre || data.rubro).trim().slice(0, 80) };
    }
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
        if (!rubro || cantidad <= 0 || v.sinSaldo) return;
        const key = rubro + '|' + (v.tipoProducto === 'crudo' ? 'crudo' : 'cocido');
        ventaPorRubro[key] = (ventaPorRubro[key] || 0) + cantidad;
    });
    return (filas || []).map((f) => {
        const rubro = f.rubro || f.plato || '';
        const anterior = Number(f.saldoInicial) || 0;
        const ingreso = Number(f.ingresos) || 0;
        const reg = Number(f.regulacion) || 0;
        const venta = ventaPorRubro[rubro + '|' + f.tipoProducto] || 0;
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

async function opcionesCocido() {
    const docs = await Rubro.find({}).select('clave tieneCocido reservaClave stockMinimo').lean();
    const porClave = {};
    (docs || []).forEach((d) => { porClave[d.clave] = d; });
    const mapas = await leerGuardados().catch(() => []);
    const defs = clavesGuardables().concat(clavesExtra(mapas).filter((e) => !claveDe(e.clave)));
    return defs.map((d) => {
        const sem = semillaCocido(d.clave);
        const doc = porClave[d.clave];
        const guardado = doc && typeof doc.tieneCocido === 'boolean';
        let tieneCocido = guardado ? doc.tieneCocido : sem.tieneCocido;
        let reservaClave = guardado ? (doc.reservaClave || '') : sem.reservaClave;
        if (!reservaClave && sem.reservaClave) reservaClave = sem.reservaClave;
        if (esMateria(d.clave)) {
            tieneCocido = false;
            reservaClave = '';
        }
        return { clave: d.clave, nombre: d.nombre, tieneCocido, reservaClave, stockMinimo: doc ? (Number(doc.stockMinimo) || 0) : 0 };
    });
}

function porClave(lista) {
    const map = {};
    (lista || []).forEach((o) => { map[o.clave] = o; });
    return map;
}

async function filasCartaEn(desde, hasta) {
    const mapas = await leerGuardados().catch(() => []);
    const [guardados, ventasPack, umbrales, opciones] = await Promise.all([
        Movimiento.find({ rubro: { $nin: [null, ''] }, fecha: { $lte: hasta } })
            .select('rubro tipoProducto clase cantidad fecha')
            .lean(),
        egresosVentaHasta(hasta),
        umbralesRubro(),
        opcionesCocido()
    ]);
    const atribuidas = atribuirVentas(guardados, ventasPack.ventas, porClave(opciones));
    const filas = aplicarSaldoPrevioDeVentas(
        filasDeRubros(guardados, desde, hasta, umbrales, clavesExtra(mapas).concat(extrasDeVentas(atribuidas))),
        atribuidas,
        desde
    );
    const desdeMs = desde.getTime();
    const hastaMs = hasta.getTime();
    const ventas = atribuidas.filter((v) => {
        const t = new Date(v.fecha).getTime();
        return t >= desdeMs && t <= hastaMs;
    });
    return { filas, ventas, cocidoOpciones: opciones };
}

function aplicarSaldoPrevioDeVentas(filas, ventas, desde) {
    const desdeMs = new Date(desde).getTime();
    const antes = {};
    (ventas || []).forEach((v) => {
        const rubro = v && (v.rubro || v.plato);
        const n = Number(v && v.cantidad) || 0;
        const t = new Date(v && v.fecha).getTime();
        if (!rubro || n <= 0 || v.sinSaldo || !(t < desdeMs)) return;
        const key = rubro + '|' + (v.tipoProducto === 'crudo' ? 'crudo' : 'cocido');
        antes[key] = (antes[key] || 0) + n;
    });
    return (filas || []).map((f) => {
        if (!f) return f;
        const previo = antes[(f.rubro || f.plato) + '|' + f.tipoProducto] || 0;
        if (!previo) return f;
        const saldoInicial = (Number(f.saldoInicial) || 0) - previo;
        const ingresos = Number(f.ingresos) || 0;
        const egreso = Number(f.egreso) || 0;
        const regulacion = Number(f.regulacion) || 0;
        const total = saldoInicial + ingresos;
        const saldoFinal = total - egreso;
        const baja = saldoFinal + regulacion;
        return { ...f, saldoInicial, total, saldoFinal, baja, cierre: baja };
    });
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
    const { filas, ventas, cocidoOpciones } = await filasCartaEn(desde, hasta);
    const data = { desde, hasta, filas, carta: await cartaConMapas(), ventas, cocidoOpciones };
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

async function cartaConMapas() {
    const base = carta();
    const mapas = await leerGuardados().catch(() => []);
    clavesExtra(mapas).forEach((e) => {
        if (!base.kardex.some((k) => k.clave === e.clave)) {
            base.kardex.push({ clave: e.clave, nombre: e.nombre, suma: null });
        }
        if (!base.opciones.some((o) => o.clave === e.clave)) base.opciones.push(e);
        const enGrupo = base.grupos.some((g) => (g.hijos || []).some((h) => h.clave === e.clave));
        if (!enGrupo && !base.sueltos.some((s) => s.clave === e.clave)) base.sueltos.push(e);
    });
    return base;
}

async function leerMapas() {
    return leerGuardados();
}

async function guardarMapas(lista) {
    if (!Array.isArray(lista)) {
        const err = new Error('El cuerpo debe traer la lista de mapas');
        err.statusCode = 400;
        throw err;
    }
    const mapas = sanearLista(lista);
    if (lista.length !== mapas.length) {
        const err = new Error('Cada mapa necesita nombre, tipo y clave de origen. Los id no se repiten.');
        err.statusCode = 400;
        throw err;
    }
    await MapaSemantico.findOneAndUpdate(
        { clave: 'hoja' },
        { $set: { mapas } },
        { upsert: true, new: true }
    );
    return mapas;
}

async function guardarUmbralRubro(clave, body) {
    let def = claveDe(clave);
    if (!def) def = clavesExtra(await leerGuardados().catch(() => [])).find((e) => e.clave === clave) || null;
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
    const set = {};
    if (body && body.crudo !== undefined) set.crudo = minimo(body.crudo);
    if (body && body.cocido !== undefined) set.cocido = minimo(body.cocido);
    if (body && body.stockMinimo !== undefined) {
        const n = minimo(body.stockMinimo);
        set.stockMinimo = n;
        set.crudo = n;
        set.cocido = n;
    }
    if (body && (body.tieneCocido !== undefined || body.reservaClave !== undefined)) {
        const valido = validarCocidoConfig(def.clave, body);
        if (!valido.valido) {
            const err = new Error(valido.error);
            err.statusCode = 400;
            throw err;
        }
        set.tieneCocido = valido.tieneCocido;
        set.reservaClave = valido.reservaClave;
    }
    if (!Object.keys(set).length) return { clave: def.clave };
    await Rubro.findOneAndUpdate(
        { clave: def.clave },
        { $set: set },
        { upsert: true, new: true }
    );
    const despues = await alertasActuales();
    emitirAlerta({ alertas: despues, cambio: null });
    return { clave: def.clave };
}

async function alertasRubro() {
    const hasta = new Date();
    const [guardados, ventasPack, umbrales, opciones, mapas] = await Promise.all([
        Movimiento.find({ rubro: { $nin: [null, ''] } })
            .select('rubro tipoProducto clase cantidad fecha')
            .lean(),
        egresosVentaHasta(hasta),
        umbralesRubro(),
        opcionesCocido(),
        leerGuardados().catch(() => [])
    ]);
    const atribuidas = atribuirVentas(guardados, ventasPack.ventas, porClave(opciones));
    const filas = aplicarVentasEnFilas(
        filasDeRubros(guardados, new Date(0), hasta, umbrales, clavesExtra(mapas).concat(extrasDeVentas(atribuidas))),
        atribuidas
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
    leerMapas,
    guardarMapas,
    eliminarHoy,
    ponerEnCero,
    avisarAlertas
};
