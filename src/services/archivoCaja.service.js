const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const {
    FORMATO,
    VERSION,
    RETENCION_DIAS,
    HORA_LUNES,
    TZ,
    COLECCIONES,
    NUNCA_BORRA,
    ARCHIVOS_JSON_PURGA,
    RESERVAS_CERRADAS,
    corteAntiguedad,
    lunesDeSemana,
    debeExportarSemanal,
    nombreSeguro,
    nombreArchivo,
    validarPaquete,
    resumenPaquete,
    docsEnRango,
    recortarListaJson,
} = require('../utils/archivoCaja');

const DIR = path.join(__dirname, '..', '..', 'EXPORTADOS');
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const ESTADO = path.join(DIR, 'estado.json');

const MODELOS = {
    comandas: () => require('../database/models/comanda.model'),
    historialComandas: () => require('../database/models/historialComandas.model'),
    pedidos: () => require('../database/models/pedido.model'),
    ticketsAprobacion: () => require('../database/models/ticketAprobacion.model'),
    ticketsPagoAdelantado: () => require('../database/models/ticketPagoAdelantado.model'),
    bouchers: () => require('../database/models/boucher.model'),
    propinas: () => require('../database/models/propina.model'),
    cierresCaja: () => require('../database/models/cierreCaja.model'),
    cierresCajaRestaurante: () => require('../database/models/cierreCajaRestaurante.model'),
    reservas: () => require('../database/models/reserva.model'),
    auditoria: () => require('../database/models/auditoriaAcciones.model'),
    clientes: () => require('../database/models/cliente.model'),
};

let cola = Promise.resolve();
let timer = null;

function enSerie(fn) {
    const run = cola.then(fn, fn);
    cola = run.then(() => {}, () => {});
    return run;
}

function asegurarDir() {
    fs.mkdirSync(DIR, { recursive: true });
}

function leerEstado() {
    try {
        const raw = fs.readFileSync(ESTADO, 'utf8');
        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : {};
    } catch {
        return {};
    }
}

function guardarEstado(patch) {
    asegurarDir();
    const next = { ...leerEstado(), ...patch };
    fs.writeFileSync(ESTADO, JSON.stringify(next, null, 2));
    return next;
}

function listarArchivos() {
    asegurarDir();
    return fs.readdirSync(DIR)
        .filter((n) => nombreSeguro(n))
        .map((nombre) => {
            const st = fs.statSync(path.join(DIR, nombre));
            return { nombre, bytes: st.size, modificado: st.mtime.toISOString() };
        })
        .sort((a, b) => (a.modificado < b.modificado ? 1 : -1));
}

function rutaArchivo(nombre) {
    const seguro = nombreSeguro(nombre);
    if (!seguro) return null;
    const full = path.join(DIR, seguro);
    if (!full.startsWith(DIR)) return null;
    return full;
}

function leerArchivo(nombre) {
    const full = rutaArchivo(nombre);
    if (!full || !fs.existsSync(full)) {
        const err = new Error('Archivo no encontrado en EXPORTADOS');
        err.statusCode = 404;
        throw err;
    }
    const paquete = JSON.parse(fs.readFileSync(full, 'utf8'));
    const v = validarPaquete(paquete);
    if (!v.ok) {
        const err = new Error(v.error);
        err.statusCode = 400;
        throw err;
    }
    return paquete;
}

async function borrarIds(Model, ids) {
    let n = 0;
    for (let i = 0; i < ids.length; i += 400) {
        const slice = ids.slice(i, i + 400);
        const r = await Model.deleteMany({ _id: { $in: slice } });
        n += r.deletedCount || 0;
    }
    return n;
}

async function idsClienteVivos() {
    const vivos = new Set();
    const tomar = async (clave, campoFecha) => {
        const Model = MODELOS[clave]();
        const ids = await Model.distinct('cliente', {
            [campoFecha]: { $gte: corteAntiguedad() },
            cliente: { $ne: null },
        });
        for (const id of ids) {
            if (id) vivos.add(String(id));
        }
    };
    await tomar('comandas', 'createdAt');
    await tomar('pedidos', 'createdAt');
    await tomar('bouchers', 'createdAt');
    return vivos;
}

async function recolectar(corte) {
    const colecciones = {};
    const porBorrar = {};
    for (const def of COLECCIONES) {
        if (def.clave === 'clientes' || def.clave === 'historialComandas') continue;
        const Model = MODELOS[def.clave]();
        const q = { [def.fecha]: { $lt: corte } };
        if (def.clave === 'reservas') q.estado = { $in: RESERVAS_CERRADAS };
        const docs = await Model.find(q).lean();
        colecciones[def.clave] = docs;
        porBorrar[def.clave] = docs.map((d) => d._id);
    }

    const Hist = MODELOS.historialComandas();
    const histPorFecha = await Hist.find({ createdAt: { $lt: corte } }).lean();
    const idsComanda = (colecciones.comandas || []).map((d) => d._id);
    const histPorComanda = idsComanda.length
        ? await Hist.find({ comandaId: { $in: idsComanda } }).lean()
        : [];
    const histMap = new Map();
    for (const d of histPorFecha.concat(histPorComanda)) histMap.set(String(d._id), d);
    colecciones.historialComandas = [...histMap.values()];
    porBorrar.historialComandas = colecciones.historialComandas.map((d) => d._id);

    const vivos = await idsClienteVivos();
    const Cliente = MODELOS.clientes();
    const candidatos = await Cliente.find({
        $or: [
            { updatedAt: { $lt: corte } },
            { updatedAt: { $exists: false }, createdAt: { $lt: corte } },
        ],
    }).lean();
    colecciones.clientes = candidatos.filter((c) => !vivos.has(String(c._id)));
    porBorrar.clientes = colecciones.clientes.map((d) => d._id);

    for (const def of COLECCIONES) {
        if (!colecciones[def.clave]) colecciones[def.clave] = [];
    }
    return { colecciones, porBorrar };
}

function resumenConteos(colecciones) {
    const out = {};
    for (const def of COLECCIONES) out[def.clave] = (colecciones[def.clave] || []).length;
    out.total = Object.values(out).reduce((a, b) => a + b, 0);
    return out;
}

async function exportarYPurgar({ motivo = 'manual' } = {}) {
    return enSerie(async () => {
        asegurarDir();
        const corte = corteAntiguedad();
        const { colecciones, porBorrar } = await recolectar(corte);
        const conteos = resumenConteos(colecciones);
        const ahora = new Date();
        const archivo = nombreArchivo(ahora);
        const paquete = {
            formato: FORMATO,
            version: VERSION,
            zona: TZ,
            retencionDias: RETENCION_DIAS,
            motivo,
            exportadoEn: ahora.toISOString(),
            corte: corte.toISOString(),
            nuncaBorra: NUNCA_BORRA,
            resumen: conteos,
            colecciones,
        };
        const full = path.join(DIR, archivo);
        fs.writeFileSync(full, JSON.stringify(paquete));
        const borrados = {};
        if (conteos.total > 0) {
            for (const def of COLECCIONES) {
                const Model = MODELOS[def.clave]();
                borrados[def.clave] = await borrarIds(Model, porBorrar[def.clave] || []);
            }
        }
        const jsonData = recortarArchivosData(corte, porBorrar);
        const estado = guardarEstado({
            ultimoLunes: motivo === 'lunes' ? lunesDeSemana(ahora) : leerEstado().ultimoLunes || null,
            ultimaExportacion: ahora.toISOString(),
            ultimoArchivo: archivo,
            ultimoMotivo: motivo,
            ultimoResumen: conteos,
        });
        logger.info('Archivo de caja exportado', { archivo, motivo, total: conteos.total, jsonData });
        return { archivo, corte: corte.toISOString(), resumen: conteos, borrados, jsonData, estado };
    });
}

function verificar(paquete, { desde, hasta } = {}) {
    const v = validarPaquete(paquete);
    if (!v.ok) {
        const err = new Error(v.error);
        err.statusCode = 400;
        throw err;
    }
    return {
        exportadoEn: paquete.exportadoEn || null,
        corte: paquete.corte || null,
        motivo: paquete.motivo || null,
        resumen: resumenPaquete(paquete, desde || null, hasta || null),
    };
}

async function importar(paquete, { desde, hasta } = {}) {
    return enSerie(async () => {
        const info = verificar(paquete, { desde, hasta });
        const insertados = {};
        for (const def of COLECCIONES) {
            const Model = MODELOS[def.clave]();
            const docs = docsEnRango(paquete, def.clave, def.fecha, desde || null, hasta || null);
            let ok = 0;
            let errores = 0;
            for (let i = 0; i < docs.length; i += 200) {
                const slice = docs.slice(i, i + 200);
                const ops = slice
                    .filter((d) => d && d._id)
                    .map((d) => ({
                        replaceOne: {
                            filter: { _id: d._id },
                            replacement: d,
                            upsert: true,
                        },
                    }));
                if (!ops.length) continue;
                try {
                    const r = await Model.bulkWrite(ops, { ordered: false });
                    ok += (r.upsertedCount || 0) + (r.modifiedCount || 0) + (r.matchedCount || 0);
                } catch (e) {
                    const res = e && e.result;
                    ok += (res?.nUpserted || 0) + (res?.nModified || 0);
                    errores += (e.writeErrors || []).length || 1;
                    logger.warn('Importación parcial de archivo de caja', { clave: def.clave, error: e.message });
                }
            }
            insertados[def.clave] = { enRango: docs.length, aplicados: ok, errores };
        }
        return { ...info, insertados };
    });
}

async function revisarLunes() {
    const estado = leerEstado();
    if (!debeExportarSemanal(new Date(), estado.ultimoLunes)) return null;
    return exportarYPurgar({ motivo: 'lunes' });
}

function iniciarArchivoCajaSemanal() {
    if (timer) return;
    const tick = () => {
        revisarLunes().catch((e) => {
            logger.error('Archivo de caja semanal falló', { error: e.message });
        });
    };
    timer = setInterval(tick, 10 * 60 * 1000);
    if (typeof timer.unref === 'function') timer.unref();
    setTimeout(tick, 8000);
}

function recortarArchivosData(corte, porBorrar) {
    const resultado = [];
    for (const def of ARCHIVOS_JSON_PURGA) {
        const full = path.resolve(DATA_DIR, def.archivo);
        if (path.dirname(full) !== path.resolve(DATA_DIR)) continue;
        if (!fs.existsSync(full)) {
            resultado.push({ archivo: def.archivo, omitido: true });
            continue;
        }
        let lista;
        try {
            lista = JSON.parse(fs.readFileSync(full, 'utf8'));
        } catch (e) {
            logger.warn('No se pudo leer JSON de data para purgar', { archivo: def.archivo, error: e.message });
            resultado.push({ archivo: def.archivo, omitido: true });
            continue;
        }
        const ids = new Set((porBorrar[def.clave] || []).map((id) => String(id)));
        const recorte = recortarListaJson(lista, {
            corte,
            fecha: def.fecha,
            idsBorrar: ids,
            soloIds: !!def.soloIds,
        });
        if (recorte.invalido || recorte.despues === recorte.antes) {
            resultado.push({
                archivo: def.archivo,
                antes: recorte.antes,
                despues: recorte.despues,
                omitido: !!recorte.invalido,
            });
            continue;
        }
        const tmp = `${full}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(recorte.lista));
        fs.renameSync(tmp, full);
        resultado.push({ archivo: def.archivo, antes: recorte.antes, despues: recorte.despues });
    }
    return resultado;
}

function planPublico() {
    return {
        retencionDias: RETENCION_DIAS,
        zona: TZ,
        horaLunes: HORA_LUNES,
        carpeta: 'EXPORTADOS',
        formato: FORMATO,
        colecciones: COLECCIONES.map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, fecha: c.fecha })),
        nuncaBorra: NUNCA_BORRA,
        reservas: 'Solo reservas rechazadas, completadas o canceladas. Las pendientes o activas se quedan.',
        clientes: 'Solo clientes sin comanda, pedido o voucher de los últimos 7 días.',
        jsonData: ARCHIVOS_JSON_PURGA.map((a) => a.archivo),
    };
}

module.exports = {
    DIR,
    asegurarDir,
    leerEstado,
    listarArchivos,
    rutaArchivo,
    leerArchivo,
    exportarYPurgar,
    verificar,
    importar,
    revisarLunes,
    iniciarArchivoCajaSemanal,
    planPublico,
};
