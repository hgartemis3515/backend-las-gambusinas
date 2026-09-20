'use strict';

const moment = require('moment-timezone');

const TZ = 'America/Lima';
/** El día del restaurante corre de 04:00 a 04:00 (Lima). */
const HORA_INICIO_CICLO = 4;

function esSoloFechaYMD(str) {
    return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str.trim());
}

function nowLima(now) {
    return moment.tz(now || new Date(), TZ);
}

/**
 * Día operativo de un instante: antes de las 04:00 Lima pertenece al día anterior.
 * Ej. 20-sep 00:36 → 2026-09-19.
 */
function ymdOperativo(now = new Date()) {
    const m = nowLima(now);
    if (m.hour() < HORA_INICIO_CICLO) m.subtract(1, 'day');
    return m.format('YYYY-MM-DD');
}

/**
 * Ventana 04:00 → 03:59:59.999 del día siguiente (Lima).
 * `ymdOrNow` puede ser YYYY-MM-DD o un Date.
 */
function boundsDiaOperativo(ymdOrNow = new Date()) {
    const ymd = esSoloFechaYMD(ymdOrNow) ? String(ymdOrNow).trim() : ymdOperativo(ymdOrNow);
    const inicio = moment.tz(ymd, 'YYYY-MM-DD', TZ)
        .hour(HORA_INICIO_CICLO).minute(0).second(0).millisecond(0);
    const fin = inicio.clone().add(1, 'day').subtract(1, 'millisecond');
    return { limaYMD: ymd, inicio: inicio.toDate(), fin: fin.toDate() };
}

function parseLimaBound(str, { end } = {}) {
    if (!str) return null;
    const s = String(str).trim();
    if (esSoloFechaYMD(s)) {
        const { inicio, fin } = boundsDiaOperativo(s);
        return end ? fin : inicio;
    }
    const m = moment.parseZone(s);
    if (!m.isValid()) return null;
    return m.toDate();
}

function rangoLima(fechaInicio, fechaFin) {
    const fallback = ymdOperativo();
    const inicioStr = fechaInicio || fallback;
    const finStr = fechaFin || (esSoloFechaYMD(String(inicioStr)) ? inicioStr : fechaInicio) || fallback;
    const { inicio: inicioHoy } = boundsDiaOperativo(fallback);
    const { fin: finHoy } = boundsDiaOperativo(fallback);
    return {
        inicio: parseLimaBound(inicioStr, { end: false }) || inicioHoy,
        fin: parseLimaBound(finStr, { end: true }) || finHoy
    };
}

module.exports = {
    TZ,
    HORA_INICIO_CICLO,
    esSoloFechaYMD,
    ymdOperativo,
    boundsDiaOperativo,
    parseLimaBound,
    rangoLima
};
