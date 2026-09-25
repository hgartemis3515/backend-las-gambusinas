/**
 * Archivo de caja: exportar registros operativos (>7 días) e importarlos por fecha.
 * No incluye platos, cocina, usuarios, roles ni configuración.
 */
const moment = require('moment-timezone');

const TZ = 'America/Lima';
const RETENCION_DIAS = 7;
const FORMATO = 'gambusinas-archivo-caja';
const VERSION = 1;
const HORA_LUNES = 4;

const COLECCIONES = [
    { clave: 'comandas', fecha: 'createdAt', etiqueta: 'Comandas' },
    { clave: 'historialComandas', fecha: 'createdAt', etiqueta: 'Historial de comandas' },
    { clave: 'pedidos', fecha: 'createdAt', etiqueta: 'Pedidos' },
    { clave: 'ticketsAprobacion', fecha: 'createdAt', etiqueta: 'Tickets de aprobación' },
    { clave: 'ticketsPagoAdelantado', fecha: 'createdAt', etiqueta: 'Tickets de pago adelantado' },
    { clave: 'bouchers', fecha: 'createdAt', etiqueta: 'Vouchers' },
    { clave: 'propinas', fecha: 'fechaRegistro', etiqueta: 'Propinas' },
    { clave: 'cierresCaja', fecha: 'fechaCierre', etiqueta: 'Cierres de caja (mozo)' },
    { clave: 'cierresCajaRestaurante', fecha: 'fechaCierre', etiqueta: 'Cierres de caja (restaurante)' },
    { clave: 'reservas', fecha: 'fechaReserva', etiqueta: 'Reservas cerradas' },
    { clave: 'auditoria', fecha: 'timestamp', etiqueta: 'Auditoría' },
    { clave: 'clientes', fecha: 'updatedAt', etiqueta: 'Clientes sin movimiento reciente' },
];

const NUNCA_BORRA = [
    'platos',
    'categorías y complementos',
    'cocina (zonas, vistas, pantallas, perfiles)',
    'usuarios y roles',
    'mesas y áreas',
    'configuración y personalización',
];

/** Copias en data/ que crecen con la operación. El resto de esa carpeta no se toca. */
const ARCHIVOS_JSON_PURGA = [
    { clave: 'comandas', archivo: 'comandas.json', fecha: 'createdAt' },
    { clave: 'bouchers', archivo: 'boucher.json', fecha: 'createdAt' },
    { clave: 'auditoria', archivo: 'auditoria.json', fecha: 'timestamp' },
    { clave: 'clientes', archivo: 'clientes.json', soloIds: true },
];

const RESERVAS_CERRADAS = ['rechazada', 'completada', 'cancelada'];

function corteAntiguedad(ahora = new Date(), dias = RETENCION_DIAS) {
    return moment(ahora).tz(TZ).subtract(dias, 'days').toDate();
}

function lunesDeSemana(ahora = new Date()) {
    return moment(ahora).tz(TZ).startOf('isoWeek').format('YYYY-MM-DD');
}

/** Lunes a las 04:00 Lima, o al encender si ese lunes ya pasó y no corrió. */
function debeExportarSemanal(ahora = new Date(), ultimoLunesYmd = null) {
    const lima = moment(ahora).tz(TZ);
    const umbral = lima.clone().startOf('isoWeek').hour(HORA_LUNES).minute(0).second(0).millisecond(0);
    if (lima.isBefore(umbral)) return false;
    const clave = lima.clone().startOf('isoWeek').format('YYYY-MM-DD');
    if (!ultimoLunesYmd) return true;
    return String(ultimoLunesYmd) < clave;
}

function fechaDe(doc, campo) {
    const v = doc && doc[campo];
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
}

function inicioDia(ymd) {
    const m = moment.tz(String(ymd || ''), 'YYYY-MM-DD', true, TZ);
    return m.isValid() ? m.startOf('day').toDate() : null;
}

function finDia(ymd) {
    const m = moment.tz(String(ymd || ''), 'YYYY-MM-DD', true, TZ);
    return m.isValid() ? m.endOf('day').toDate() : null;
}

function enRango(doc, campo, desde, hasta) {
    if (!desde && !hasta) return true;
    const f = fechaDe(doc, campo);
    if (!f) return false;
    const ini = desde ? inicioDia(desde) : null;
    const fin = hasta ? finDia(hasta) : null;
    if (desde && !ini) return false;
    if (hasta && !fin) return false;
    if (ini && f < ini) return false;
    if (fin && f > fin) return false;
    return true;
}

function rangoDe(docs, campo) {
    let min = null;
    let max = null;
    for (const d of docs || []) {
        const f = fechaDe(d, campo);
        if (!f) continue;
        if (!min || f < min) min = f;
        if (!max || f > max) max = f;
    }
    return {
        desde: min ? min.toISOString() : null,
        hasta: max ? max.toISOString() : null,
    };
}

function nombreSeguro(nombre) {
    const base = String(nombre || '').replace(/\\/g, '/').split('/').pop();
    if (!/^caja-[a-z0-9-]+\.json$/i.test(base)) return null;
    return base;
}

function nombreArchivo(ahora = new Date()) {
    return `caja-${moment(ahora).tz(TZ).format('YYYYMMDD-HHmmss')}.json`;
}

function validarPaquete(obj) {
    if (!obj || obj.formato !== FORMATO || Number(obj.version) !== VERSION) {
        return { ok: false, error: 'El archivo no es un exportado de caja de Gambusinas.' };
    }
    if (!obj.colecciones || typeof obj.colecciones !== 'object' || Array.isArray(obj.colecciones)) {
        return { ok: false, error: 'Faltan las colecciones del archivo.' };
    }
    const claves = new Set(COLECCIONES.map((c) => c.clave));
    for (const k of Object.keys(obj.colecciones)) {
        if (!claves.has(k)) return { ok: false, error: `Colección no permitida en el archivo: ${k}` };
        if (!Array.isArray(obj.colecciones[k])) return { ok: false, error: `${k} no es una lista.` };
    }
    return { ok: true };
}

function resumenPaquete(paquete, desde, hasta) {
    return COLECCIONES.map((c) => {
        const docs = (paquete.colecciones && paquete.colecciones[c.clave]) || [];
        const rango = rangoDe(docs, c.fecha);
        const en = docs.filter((d) => enRango(d, c.fecha, desde, hasta));
        return {
            clave: c.clave,
            etiqueta: c.etiqueta,
            fecha: c.fecha,
            total: docs.length,
            enRango: en.length,
            desde: rango.desde,
            hasta: rango.hasta,
        };
    });
}

function docsEnRango(paquete, clave, campo, desde, hasta) {
    const docs = (paquete.colecciones && paquete.colecciones[clave]) || [];
    return docs.filter((d) => enRango(d, campo, desde, hasta));
}

/** true = el registro se queda en el JSON de data/. */
function conservarRegistroJson(doc, { corte, fecha, idsBorrar, soloIds } = {}) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
    const id = doc._id == null ? '' : String(doc._id);
    if (id && idsBorrar && idsBorrar.has(id)) return false;
    if (soloIds) return true;
    const f = fechaDe(doc, fecha);
    if (!f || !corte) return true;
    return f >= corte;
}

function recortarListaJson(lista, opts) {
    if (!Array.isArray(lista)) return { lista: [], antes: 0, despues: 0, invalido: true };
    const next = lista.filter((d) => conservarRegistroJson(d, opts));
    return { lista: next, antes: lista.length, despues: next.length, invalido: false };
}

module.exports = {
    TZ,
    RETENCION_DIAS,
    FORMATO,
    VERSION,
    HORA_LUNES,
    COLECCIONES,
    NUNCA_BORRA,
    ARCHIVOS_JSON_PURGA,
    RESERVAS_CERRADAS,
    corteAntiguedad,
    lunesDeSemana,
    debeExportarSemanal,
    fechaDe,
    inicioDia,
    finDia,
    enRango,
    rangoDe,
    nombreSeguro,
    nombreArchivo,
    validarPaquete,
    resumenPaquete,
    docsEnRango,
    conservarRegistroJson,
    recortarListaJson,
};
