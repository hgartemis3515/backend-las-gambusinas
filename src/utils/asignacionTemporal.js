/**
 * Asignación temporal de platos (overlay sobre la regla permanente del perfil).
 * Zona: America/Lima. El último día de vigencia cierra a las 23:59:59.999.
 */
const moment = require('moment-timezone');

const TZ = 'America/Lima';
const MAX_DIAS = 14;

function nowLima(momento) {
    if (momento && typeof momento.clone === 'function') return momento.clone().tz(TZ);
    if (momento) return moment(momento).tz(TZ);
    return moment().tz(TZ);
}

/** dias=1 → hoy 23:59:59.999 Lima. dias=2 → mañana 23:59:59.999. */
function finTemporalLima(dias, fromMoment) {
    const n = Math.floor(Number(dias));
    if (!Number.isFinite(n) || n < 1) return null;
    const clamped = Math.min(MAX_DIAS, n);
    return nowLima(fromMoment).startOf('day').add(clamped, 'days').subtract(1, 'millisecond').toDate();
}

function temporalVigente(temporal, momento) {
    if (!temporal || temporal.dias == null) return false;
    const dias = Number(temporal.dias);
    if (!Number.isFinite(dias) || dias < 1) return false;
    if (!temporal.hasta) return false;
    const hasta = temporal.hasta instanceof Date ? temporal.hasta : new Date(temporal.hasta);
    if (Number.isNaN(hasta.getTime())) return false;
    return nowLima(momento).toDate().getTime() <= hasta.getTime();
}

function temporalTieneCocinero(temporal) {
    if (!temporal) return false;
    if (temporal.cocineroPrimarioId) return true;
    return Array.isArray(temporal.backups) && temporal.backups.some((b) => b && b.cocineroId);
}

function indiceTurnoComanda(comandasPrevias, cantidadCocineros) {
    const n = Math.max(0, Number(comandasPrevias) || 0);
    const len = Number(cantidadCocineros);
    if (!Number.isFinite(len) || len < 1) return 0;
    return n % len;
}

function rotarCandidatos(candidatos, indice) {
    const list = Array.isArray(candidatos) ? candidatos.slice() : [];
    if (list.length === 0) return list;
    const i = ((Number(indice) || 0) % list.length + list.length) % list.length;
    const rot = list.slice(i).concat(list.slice(0, i));
    return rot.map((c, orden) => ({
        ...c,
        esPrimario: orden === 0,
        orden
    }));
}

function sanitizarBackups(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
        .filter((b) => b && b.cocineroId)
        .map((b, i) => ({
            cocineroId: b.cocineroId,
            orden: Number.isFinite(b.orden) ? b.orden : i
        }))
        .sort((a, b) => a.orden - b.orden);
}

/**
 * @param {object|null} incoming
 * @param {object|null} existente  temporal ya persistido (para no recortar la ventana)
 */
function parseHasta(h) {
    if (!h) return null;
    const d = h instanceof Date ? h : new Date(h);
    return Number.isNaN(d.getTime()) ? null : d;
}

function sanitizarTemporal(incoming, existente, momento) {
    if (!incoming || incoming.dias == null || incoming.dias === '' || Number(incoming.dias) < 1) {
        return null;
    }
    const dias = Math.min(MAX_DIAS, Math.max(1, Math.floor(Number(incoming.dias))));
    const ahoraMs = nowLima(momento).toDate().getTime();
    const incomingHasta = parseHasta(incoming.hasta);
    if (incomingHasta && incomingHasta.getTime() < ahoraMs) {
        return null;
    }
    const existenteVigente = temporalVigente(existente, momento);
    const mismoDias = existente && Number(existente.dias) === dias;
    let hasta;
    if (incomingHasta && incomingHasta.getTime() >= ahoraMs) {
        hasta = incomingHasta;
    } else if (existenteVigente && mismoDias && existente.hasta) {
        hasta = parseHasta(existente.hasta) || finTemporalLima(dias, momento);
    } else {
        hasta = finTemporalLima(dias, momento);
    }
    return {
        dias,
        hasta,
        variarPorTurno: incoming.variarPorTurno === true,
        cocineroPrimarioId: incoming.cocineroPrimarioId || null,
        backups: sanitizarBackups(incoming.backups)
    };
}

function reglaEfectivaParaAsignar(regla, momento) {
    if (!regla) return { regla, origenTemporal: false, variarPorTurno: false };
    if (!temporalVigente(regla.temporal, momento) || !temporalTieneCocinero(regla.temporal)) {
        return { regla, origenTemporal: false, variarPorTurno: false };
    }
    const t = regla.temporal;
    return {
        regla: {
            ...regla,
            cocineroPrimarioId: t.cocineroPrimarioId || null,
            backups: Array.isArray(t.backups) ? t.backups : []
        },
        origenTemporal: true,
        variarPorTurno: t.variarPorTurno === true
    };
}

module.exports = {
    TZ,
    MAX_DIAS,
    nowLima,
    finTemporalLima,
    temporalVigente,
    temporalTieneCocinero,
    indiceTurnoComanda,
    rotarCandidatos,
    sanitizarTemporal,
    reglaEfectivaParaAsignar
};
