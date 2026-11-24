const mongoose = require('mongoose');
const Plato = require('../database/models/plato.model');
const Movimiento = require('../database/models/inventarioMovimiento.model');
const { armarKardex, alertasDeFilas, cambioDeAlerta } = require('../utils/inventarioKardex');
const { armarLibro, indexarPases, otroTipo } = require('../utils/inventarioLibro');
const { claveDe, clavesGuardables, carta } = require('../utils/inventarioRubros');
const { sanearLista, clavesExtra, leerGuardados } = require('../utils/inventarioMapas');
const { sanearGuardado } = require('../../public/assets/js/inventarioRelaciones');
const MapaSemantico = require('../database/models/inventarioMapa.model');
const { boundsDiaCalendario, boundsDiaOperativo, ymdOperativo, esSoloFechaYMD, ampliarTramoAlDia } = require('../utils/diaOperativoRestaurante');
const { egresosVentaHasta } = require('../utils/inventarioSalidaVentas');
const { semillaCocido, validarCocidoConfig, esMateria, perfilRubro } = require('../utils/inventarioCascadaVenta');
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
    return Movimiento.find(filtro).select('plato tipoProducto clase cantidad fecha motivo').lean();
}

async function kardex(desdeStr, hastaStr, ciclo) {
    const pedido = (desdeStr || hastaStr) ? rango(desdeStr, hastaStr || desdeStr, ciclo) : hoy();
    const { desde, hasta } = ampliarTramoAlDia(pedido.desde, pedido.hasta);
    const platos = await platosActivos();
    const ids = platos.map((p) => p._id);
    const movs = ids.length ? await movimientosHasta(ids, hasta) : [];
    const filas = armarKardex(platos, movs, desde, hasta);
    return { desde, hasta, filas };
}

async function listarMovimientos({ plato, tipo, desde, hasta, ciclo }) {
    const filtro = {};
    if (desde || hasta) {
        const r0 = rango(desde || hasta, hasta || desde, ciclo);
        const r = ampliarTramoAlDia(r0.desde, r0.hasta);
        filtro.fecha = { $gte: r.desde, $lte: r.hasta };
    }
    if (plato && mongoose.Types.ObjectId.isValid(plato)) filtro.plato = plato;
    const docs = await Movimiento.find(filtro)
        .sort({ fecha: -1, _id: -1 })
        .limit(20000)
        .populate('usuario', 'name')
        .lean();
    const pases = indexarPases(docs);
    const ids = docs.filter((d) => pases.get(d)?.entrada === d && !d.reviertePase).map((d) => d._id);
    const revertidos = new Set(ids.length ? (await Movimiento.distinct('reviertePase', { reviertePase: { $in: ids } })).map(String) : []);
    const visibles = docs.flatMap((d) => {
        const entrada = pases.get(d)?.entrada;
        const identidad = entrada && !entrada.reviertePase ? {
            paseId: String(entrada._id), paseDestino: entrada.tipoProducto, paseCantidad: entrada.cantidad,
            paseRevertido: revertidos.has(String(entrada._id))
        } : {};
        const mov = { ...d, ...identidad };
        if (!d.paseTipo) return [mov];
        const salida = {
            ...mov, _id: String(d._id) + '-salida', tipoProducto: otroTipo(d.tipoProducto), cantidad: -d.cantidad,
            motivo: d.motivo.replace(/^Pasa de (?:crudo|cocido)/, 'Pasa a ' + d.tipoProducto)
        };
        return [mov, salida];
    });
    return visibles.filter((d) => (tipo !== 'crudo' && tipo !== 'cocido') || d.tipoProducto === tipo).map((d) => ({
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
        lote: d.lote || '',
        paseId: d.paseId,
        paseDestino: d.paseDestino,
        paseCantidad: d.paseCantidad,
        paseRevertido: d.paseRevertido,
        reviertePase: d.reviertePase,
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
    let motivo = String(data.motivo || '').trim();
    if (!motivo && clase === 'regulacion') motivo = 'Corrección';
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
    const paseTipo = data.paseTipo === true;
    if (paseTipo) {
        if (!rubro || clase !== 'ingreso' || cantidad <= 0 || !motivo.startsWith('Pasa de ' + otroTipo(tipo) + ' ')) {
            throw Object.assign(new Error('El pase entre crudo y cocido no es válido.'), { statusCode: 400 });
        }
        await validarPaseDisponible(rubro.clave, otroTipo(tipo), cantidad, motivo);
    }
    const antes = paseTipo ? null : await alertasActuales();
    const lotePedido = String(data.lote || '').trim();
    const lote = clase === 'egreso' && motivo.indexOf('Venta manual') === 0 && /^vm-[a-z0-9]{4,12}-[a-z0-9]{4,12}$/.test(lotePedido)
        ? lotePedido
        : '';
    const doc = await Movimiento.create({
        plato: plato ? plato._id : null,
        platoId: plato ? plato.id : 0,
        rubro: rubro ? rubro.clave : '',
        nombre: rubro ? rubro.nombre : plato.nombre,
        tipoProducto: tipo,
        clase,
        cantidad,
        motivo,
        lote,
        ...(paseTipo ? { paseTipo } : {}),
        comanda: data.comanda && mongoose.Types.ObjectId.isValid(data.comanda) ? data.comanda : null,
        usuario: usuarioId && mongoose.Types.ObjectId.isValid(usuarioId) ? usuarioId : null,
        fecha: paseTipo ? new Date() : fechaMovimiento(data.fecha)
    });
    if (paseTipo) {
        avisarAlertas();
        return doc.toObject();
    }
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

function lineasReporte(filas) {
    return (filas || []).map((f) => ({
        rubro: f.rubro || f.plato || '',
        nombre: f.nombre || '',
        tipoProducto: f.tipoProducto,
        saldoAnterior: Number(f.saldoInicial) || 0,
        ingreso: Number(f.ingresos) || 0,
        salida: (Number(f.egreso) || 0) + (Number(f.venta) || 0) - (Number(f.cubierta) || 0),
        saldoFinal: Number(f.queda) || 0
    })).filter((l) => l.saldoAnterior || l.ingreso || l.salida || l.saldoFinal);
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
        const soloCrudo = ['milanesa', 'filete-junior', 'milanesa-junior', 'salt-pollo', 'chaufa-pollo', 'chicharron-pollo', 'chi-pollo-bbq', 'chi-pollo-acevichada'];
        const conCocido = ['pechuga-pato', 'pierna-pato', 'pollo-baby', 'pierna-lena', 'carnero', 'arroz-pollo', 'pollo-olla', 'caldo-pollo', 'seco-cordero', 'pachamanca-pollo-pecho', 'tamal-chancho', 'tamal-pollo', 'pollada'];
        if (esMateria(d.clave) || soloCrudo.indexOf(d.clave) !== -1) {
            tieneCocido = false;
            if (!esMateria(d.clave) && !reservaClave) reservaClave = 'pechuga-pollo';
        }
        if (d.clave === 'pierna-lena') reservaClave = '';
        if (d.clave === 'pachamanca-pollo') reservaClave = 'pierna-pollo';
        if (d.clave === 'pollada') reservaClave = '';
        if (d.clave === 'pachamanca-pollo-pecho') reservaClave = 'pechuga-pollo';
        if (d.clave === 'seco-cordero') reservaClave = '';
        if (d.clave === 'pollo-lena' || d.clave === 'caldo-pollo') reservaClave = '';
        if (conCocido.indexOf(d.clave) !== -1) tieneCocido = true;
        if (d.clave === 'panceta' || d.clave === 'tira-panceta' || d.clave === 'trozo-panceta') tieneCocido = false;
        if (d.clave === 'menu' || d.clave === 'menu-pecho' || d.clave === 'menu-pierna') tieneCocido = false;
        return { clave: d.clave, nombre: d.nombre, tieneCocido, reservaClave, stockMinimo: doc ? (Number(doc.stockMinimo) || 0) : 0 };
    });
}

function porClave(lista) {
    const map = {};
    (lista || []).forEach((o) => { map[o.clave] = o; });
    return map;
}

// Una sola cuenta para toda la hoja: ver src/utils/inventarioLibro.js.
async function filasCartaEn(desde, hasta) {
    const mapas = await leerGuardados().catch(() => []);
    const [guardados, ventasPack, umbrales, opciones] = await Promise.all([
        Movimiento.find({ rubro: { $nin: [null, ''] }, fecha: { $lte: hasta } })
            .select('rubro nombre tipoProducto clase cantidad fecha motivo paseTipo reviertePase')
            .lean(),
        egresosVentaHasta(hasta),
        umbralesRubro(),
        opcionesCocido()
    ]);
    const libro = armarLibro({
        movimientos: guardados,
        ventas: ventasPack.ventas,
        opciones: porClave(opciones),
        umbrales,
        extras: clavesExtra(mapas),
        desde,
        hasta
    });
    return { filas: libro.filas, ventas: libro.ventas, cocidoOpciones: opciones };
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
    const { filas } = await filasCartaEn(desde, hasta);
    const lineas = lineasReporte(filas);
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
    const pedido = (desdeStr || hastaStr)
        ? rango(desdeStr, hastaStr || desdeStr, ciclo)
        : hoy();
    const { desde, hasta } = ampliarTramoAlDia(pedido.desde, pedido.hasta);
    const [{ filas, ventas, cocidoOpciones }, doc] = await Promise.all([
        filasCartaEn(desde, hasta),
        MapaSemantico.findOne({ clave: claveDescuadresOmitidos(desde, hasta) }).select('descuadresOmitidos').lean()
    ]);
    const data = { desde, hasta, filas, carta: await cartaConMapas(), ventas, cocidoOpciones, descuadresOmitidos: doc?.descuadresOmitidos || [] };
    if (operativo && desdeStr && desdeStr === (hastaStr || desdeStr)) {
        const fecha = String(desdeStr);
        const hoyOp = ymdOperativo();
        const lineas = lineasReporte(filas);
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

function claveDescuadresOmitidos(desde, hasta) {
    return 'descuadres-omitidos:' + desde.toISOString() + ':' + hasta.toISOString();
}

async function omitirDescuadre(desdeStr, hastaStr, ciclo, aviso) {
    const firmaValida = /^[a-z0-9][a-z0-9_-]{0,79}\|(crudo|cocido)\|(emergencia|apertura|conteo)(\|-?\d{1,15}(\.\d{1,3})?){1,3}$/;
    if (typeof aviso !== 'string' || !firmaValida.test(aviso)) {
        const err = new Error('Aviso de descuadre inválido');
        err.statusCode = 400;
        throw err;
    }
    const pedido = rango(desdeStr, hastaStr, ciclo);
    const { desde, hasta } = ampliarTramoAlDia(pedido.desde, pedido.hasta);
    await MapaSemantico.updateOne(
        { clave: claveDescuadresOmitidos(desde, hasta) },
        { $addToSet: { descuadresOmitidos: aviso } },
        { upsert: true }
    );
}

async function saldosRubroHoy(claves) {
    const { desde, hasta } = hoy();
    const { filas } = await filasCartaEn(desde, hasta);
    const quiere = new Set(claves || []);
    const out = {};
    quiere.forEach((c) => { out[c] = 0; });
    (filas || []).forEach((f) => {
        const clave = f && (f.rubro || f.plato);
        if (!clave || !quiere.has(clave)) return;
        if (f.tipoProducto === 'cocido') return;
        const saldo = f.baja != null ? f.baja : f.saldoFinal;
        out[clave] += Number(saldo) || 0;
    });
    return out;
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

async function leerRelaciones() {
    const doc = await MapaSemantico.findOne({ clave: 'relaciones' }).lean();
    if (!doc) return { manuales: [], quitadas: [] };
    return sanearGuardado({ manuales: doc.relaciones, quitadas: doc.quitadas });
}

async function guardarRelaciones(body) {
    const guardado = sanearGuardado(body || {});
    await MapaSemantico.findOneAndUpdate(
        { clave: 'relaciones' },
        { $set: { relaciones: guardado.manuales, quitadas: guardado.quitadas } },
        { upsert: true, new: true }
    );
    return guardado;
}

// Pollo fresco no se reserva. Pecho, Pierna y Octavo se reservan y bloquean por plato, no como pieza.
const NO_BLOQUEABLES = new Set(['pollo_fresco', 'pechuga', 'pierna', 'octavo_pollo']);

function sanearBloqueo(body) {
    const src = body || {};
    const lineas = (Array.isArray(src.lineas) ? src.lineas : []).slice(0, 400).map((l) => {
        // Reserva por tipo. Una línea vieja con solo "reserva" cuenta como crudo.
        const conTipos = l && (l.reservaCrudo !== undefined || l.reservaCocido !== undefined);
        const crudo = Math.max(0, Number(conTipos ? l.reservaCrudo : (l && l.reserva)) || 0);
        const cocido = Math.max(0, Number(conTipos ? l.reservaCocido : 0) || 0);
        const esPlato = l && l.tipo === 'plato';
        return {
            tipo: esPlato ? 'plato' : 'producto',
            id: String(l && l.id || '').slice(0, 80),
            nombre: String(l && l.nombre || '').slice(0, 120),
            bloqueado: !!(l && l.bloqueado),
            reservaCrudo: esPlato ? 0 : crudo,
            reservaCocido: esPlato ? 0 : cocido,
            reserva: esPlato ? 0 : Math.round((crudo + cocido) * 1000) / 1000
        };
    }).filter((l) => l.id && !(l.tipo === 'producto' && NO_BLOQUEABLES.has(l.id)) && (l.bloqueado || l.reserva > 0));
    return {
        motivo: String(src.motivo || '').trim().slice(0, 120),
        hasta: fechaBloqueo(src.hasta),
        desde: fechaBloqueo(src.desde),
        duracion: String(src.duracion || '').slice(0, 40),
        lineas
    };
}

// "hasta" es una fecha ISO (fin del bloqueo). Se acepta la hora suelta "HH:MM" de la versión anterior.
// Vacío = sin límite: dura hasta que alguien lo quite.
function fechaBloqueo(valor) {
    const s = String(valor || '').trim();
    if (!s) return '';
    if (/^\d{1,2}:\d{2}$/.test(s)) return s;
    const t = Date.parse(s);
    return Number.isNaN(t) ? '' : new Date(t).toISOString();
}

function bloqueoVencido(bloqueo) {
    const hasta = bloqueo && bloqueo.hasta;
    if (!hasta || /^\d{1,2}:\d{2}$/.test(hasta)) return false;
    const t = Date.parse(hasta);
    return !Number.isNaN(t) && Date.now() >= t;
}

async function leerBloqueo() {
    const doc = await MapaSemantico.findOne({ clave: 'bloqueo' }).lean();
    if (!doc || !doc.bloqueo) return { motivo: '', hasta: '', desde: '', duracion: '', lineas: [], vencido: false };
    const data = sanearBloqueo(doc.bloqueo);
    data.vencido = bloqueoVencido(data);
    return data;
}

async function guardarBloqueo(body) {
    const guardado = sanearBloqueo(body);
    await MapaSemantico.findOneAndUpdate(
        { clave: 'bloqueo' },
        { $set: { bloqueo: guardado } },
        { upsert: true, new: true }
    );
    try {
        require('./plato.repository').invalidatePlatoMenuCache('plato-carta normal');
    } catch (e) { /* la carta se filtra igual en cada lectura */ }
    return Object.assign({}, guardado, { vencido: bloqueoVencido(guardado) });
}

async function filtrarCartaBloqueada(lista) {
    let bloqueo;
    try {
        bloqueo = await leerBloqueo();
    } catch (e) {
        return lista || [];
    }
    // Pasada la hora de fin, los platos vuelven a la carta sin que nadie tenga que quitar el bloqueo.
    if (bloqueo.vencido) return lista || [];
    const ids = new Set();
    const nombres = new Set();
    (bloqueo.lineas || []).forEach((l) => {
        if (!l.bloqueado || l.tipo !== 'plato') return;
        ids.add(l.id);
        if (l.nombre) nombres.add(l.nombre.toLowerCase());
    });
    if (!ids.size && !nombres.size) return lista || [];
    return (lista || []).filter((p) => {
        const id = String((p && (p._id || p.id)) || '');
        if (ids.has(id) || ids.has('plato-' + id)) return false;
        const nombre = String(p && p.nombre || '').toLowerCase();
        return !nombre || !nombres.has(nombre);
    });
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
            .select('rubro nombre tipoProducto clase cantidad fecha motivo paseTipo reviertePase')
            .lean(),
        egresosVentaHasta(hasta),
        umbralesRubro(),
        opcionesCocido(),
        leerGuardados().catch(() => [])
    ]);
    const { filas } = armarLibro({
        movimientos: guardados,
        ventas: ventasPack.ventas,
        opciones: porClave(opciones),
        umbrales,
        extras: clavesExtra(mapas),
        desde: hasta,
        hasta
    });
    return alertasDeFilas(filas);
}

async function validarPaseDisponible(clave, tipo, cantidad, motivo) {
    const hasta = new Date();
    const { filas, cocidoOpciones } = await filasCartaEn(boundsDiaOperativo(hasta).inicio, hasta);
    if (!perfilRubro(clave, cocidoOpciones.find((o) => o.clave === clave)).tieneCocido) {
        throw Object.assign(new Error('Este producto no tiene pases entre crudo y cocido.'), { statusCode: 409 });
    }
    const fila = filas.find((f) => f.rubro === clave && f.tipoProducto === tipo);
    let disponible = fila?.queda || 0;
    const marca = / · (pecho|pierna)$/i.exec(motivo)?.[1].toLowerCase();
    if (marca && Number.isFinite(fila?.pechoOctavo)) {
        disponible = marca === 'pecho' ? fila.pechoOctavo : disponible - fila.pechoOctavo;
    }
    if (disponible + 0.0001 < cantidad) {
        throw Object.assign(new Error('El stock disponible es insuficiente para ese pase.'), { statusCode: 409 });
    }
}

async function revertirPase(id, usuarioId) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw Object.assign(new Error('El pase no es válido.'), { statusCode: 400 });
    }
    let original = await Movimiento.findById(id).lean();
    const noReversible = () => Object.assign(new Error('El pase ya se revirtió o no está disponible.'), { statusCode: 409 });
    if (!original || original.reviertePase || !original.rubro || original.clase !== 'ingreso' || original.fecha > new Date()) throw noReversible();
    if (!original.paseTipo) {
        const { inicio, fin } = boundsDiaOperativo(original.fecha);
        const movs = await Movimiento.find({ rubro: original.rubro, clase: 'ingreso', fecha: { $gte: inicio, $lte: fin } }).lean();
        const movimiento = movs.find((m) => String(m._id) === String(original._id));
        original = indexarPases(movs).get(movimiento)?.entrada;
    }
    if (!original || original.cantidad <= 0 || await Movimiento.exists({ reviertePase: original._id })) throw noReversible();
    await validarPaseDisponible(original.rubro, original.tipoProducto, original.cantidad, original.motivo);
    const marca = / · (?:pecho|pierna)$/i.exec(original.motivo)?.[0] || '';
    try {
        const doc = await Movimiento.create({
            rubro: original.rubro, nombre: original.nombre, clase: 'ingreso', cantidad: original.cantidad,
            tipoProducto: otroTipo(original.tipoProducto), motivo: 'Pasa de ' + original.tipoProducto + ' ' + original.nombre + marca,
            paseTipo: true, reviertePase: original._id,
            usuario: mongoose.Types.ObjectId.isValid(usuarioId) ? usuarioId : null
        });
        avisarAlertas();
        return doc.toObject();
    } catch (error) {
        if (error.code === 11000) throw noReversible();
        throw error;
    }
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

async function eliminarVentaManual({ lote, ids }) {
    const filtro = { clase: 'egreso', motivo: /^Venta manual/ };
    const loteLimpio = String(lote || '').trim();
    if (loteLimpio) {
        if (!/^vm-[a-z0-9]{4,12}-[a-z0-9]{4,12}$/.test(loteLimpio)) {
            const err = new Error('Esa venta manual no se puede eliminar');
            err.statusCode = 400;
            throw err;
        }
        filtro.lote = loteLimpio;
    } else {
        const lista = (Array.isArray(ids) ? ids : [])
            .map((id) => String(id || '').trim())
            .filter((id) => mongoose.Types.ObjectId.isValid(id));
        if (!lista.length || lista.length > 40) {
            const err = new Error('Esa venta manual no se puede eliminar');
            err.statusCode = 400;
            throw err;
        }
        filtro._id = { $in: lista };
    }
    const docs = await Movimiento.find(filtro)
        .select('nombre rubro tipoProducto clase cantidad motivo lote fecha')
        .lean();
    const anulados = [];
    let sectorRestaurado = '';
    for (const doc of docs) {
        const vigente = { _id: doc._id, clase: 'egreso', motivo: doc.motivo };
        const sector = doc.rubro === 'octavo-pollo' && doc.tipoProducto === 'crudo' && doc.cantidad > 0 && doc.lote
            && /^Venta manual · (Beata|Personal|Eventos?|Rio Lindo)(?: · Motivo: .+)? · (pecho|pierna)$/s.exec(doc.motivo);
        if (sector) {
            const [, nombre, corte] = sector;
            // La descarga liberó la separación con una regulación positiva. El egreso pasa a ser una
            // separación del mismo signo contable, con el mismo corte y fecha. Así admite lotes antiguos.
            const anterior = await Movimiento.findOneAndUpdate(vigente, {
                $set: { clase: 'regulacion', cantidad: -doc.cantidad, motivo: `Separado · ${nombre} · ${corte}`, lote: '' }
            }).lean();
            if (!anterior) continue;
            anulados.push(anterior);
            sectorRestaurado = nombre === 'Eventos' ? 'Evento' : nombre;
        } else {
            const anterior = await Movimiento.findOneAndDelete(vigente).lean();
            if (anterior) anulados.push(anterior);
        }
    }
    if (!anulados.length) {
        const err = new Error('Esa venta manual ya no está');
        err.statusCode = 404;
        throw err;
    }
    const despues = await alertasActuales();
    emitirAlerta({ alertas: despues, cambio: null });
    return { eliminados: anulados.length, movimientos: anulados, sectorRestaurado };
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
    omitirDescuadre,
    saldosRubroHoy,
    listarMovimientos,
    crearMovimiento,
    revertirPase,
    alertasActuales,
    guardarUmbralRubro,
    leerMapas,
    guardarMapas,
    leerRelaciones,
    guardarRelaciones,
    leerBloqueo,
    guardarBloqueo,
    filtrarCartaBloqueada,
    eliminarHoy,
    eliminarVentaManual,
    ponerEnCero,
    avisarAlertas
};
