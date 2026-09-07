/**
 * Calendario de asignación automática (platos y guarniciones).
 * Zona horaria de runtime: America/Lima. Días: moment.day() 0=Dom … 6=Sáb.
 *
 * Plantilla semanal: diasSemana + horaInicio/horaFin.
 * Un día concreto: fechaYmd o fechaPuntual (YYYY-MM-DD en Lima) — no se repite cada semana.
 * Ambos nombres son alias (local vs remoto); se lee cualquiera de los dos.
 *
 * Cruce de medianoche: horaFin < horaInicio (ej. 22:00–06:00).
 * diasSemana / fecha = día en que EMPIEZA el turno.
 * Intervalo [horaInicio, horaFin) con horaFin exclusiva (23:59/24:00 = fin de día).
 */

const RE_HHMM = /^\d{2}:\d{2}$/;
const RE_YMD = /^\d{4}-\d{2}-\d{2}$/;

function compararHHmm(a, b) {
    return a < b ? -1 : (a > b ? 1 : 0);
}

function diaAnterior(dia) {
    return (Number(dia) + 6) % 7;
}

function cruzaMedianoche(horaInicio, horaFin) {
    return compararHHmm(horaFin, horaInicio) < 0;
}

function normalizarFechaYmd(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim().slice(0, 10);
    if (!RE_YMD.test(s)) {
        throw new Error('fechaYmd debe tener formato YYYY-MM-DD');
    }
    return s;
}

function normalizarFechaPuntual(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim().slice(0, 10);
    return RE_YMD.test(s) ? s : null;
}

function fechaUnicaDeBloque(bloque) {
    const ymd = bloque && bloque.fechaYmd != null ? String(bloque.fechaYmd).trim().slice(0, 10) : '';
    if (RE_YMD.test(ymd)) return ymd;
    return normalizarFechaPuntual(bloque && bloque.fechaPuntual);
}

function fechaYmdDeBloque(bloque) {
    return fechaUnicaDeBloque(bloque);
}

function esBloqueFechaUnica(bloque) {
    return !!fechaUnicaDeBloque(bloque);
}

function weekdayFromYmd(ymd) {
    const fecha = normalizarFechaPuntual(ymd);
    if (!fecha) return null;
    const [y, m, d] = fecha.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function diaSemanaDeYmd(ymd) {
    return weekdayFromYmd(ymd);
}

function addDaysYmd(ymd, days) {
    const fecha = normalizarFechaPuntual(ymd);
    if (!fecha) return null;
    const [y, m, d] = fecha.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + Number(days || 0)));
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

function ymdMasUnDia(ymd) {
    return addDaysYmd(ymd, 1);
}

function normalizarDiasSemana(diasSemana) {
    return Array.isArray(diasSemana)
        ? [...new Set(diasSemana.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
        : [];
}

function diasSemanaDesdeFechaOLista(diasSemana, fechaPuntual) {
    const fecha = fechaUnicaDeBloque({ fechaYmd: fechaPuntual, fechaPuntual });
    if (fecha) return [weekdayFromYmd(fecha)];
    return normalizarDiasSemana(diasSemana);
}

/**
 * Normaliza diasSemana + fechaYmd/fechaPuntual al crear/actualizar un bloque.
 * Si hay fecha única, diasSemana queda en el weekday de esa fecha.
 * Escribe ambos campos (alias).
 */
function prepararCamposBloqueCalendario(payload = {}, { exigirDias = true } = {}) {
    const fechaPresente = Object.prototype.hasOwnProperty.call(payload, 'fechaYmd')
        || Object.prototype.hasOwnProperty.call(payload, 'fechaPuntual');
    let fecha;
    if (fechaPresente) {
        const raw = payload.fechaYmd != null && payload.fechaYmd !== ''
            ? payload.fechaYmd
            : payload.fechaPuntual;
        if (raw == null || raw === '') {
            fecha = null;
        } else {
            fecha = normalizarFechaPuntual(raw) || normalizarFechaYmd(raw);
        }
    }
    const diasPresente = Array.isArray(payload.diasSemana);
    let diasNorm = diasPresente ? normalizarDiasSemana(payload.diasSemana) : undefined;
    if (payload.diasSemana != null && !diasPresente) {
        throw new Error('diasSemana debe ser un array no vacío de enteros 0..6');
    }
    if (fecha) {
        diasNorm = [diaSemanaDeYmd(fecha)];
    }
    if (diasNorm && diasNorm.length === 0) {
        throw new Error('diasSemana debe ser un array no vacío de enteros 0..6');
    }
    if (exigirDias && !diasNorm) {
        throw new Error('diasSemana debe ser un array no vacío de enteros 0..6');
    }
    const out = {};
    if (diasNorm) out.diasSemana = diasNorm;
    if (fechaPresente) {
        out.fechaYmd = fecha;
        out.fechaPuntual = fecha;
    }
    return out;
}

/**
 * Mismo día: [horaInicio, horaFin). 23:59 / 24:00 cubren hasta fin de día inclusive.
 * No usar esto solo para franjas overnight.
 */
function horaEnRango(hhmm, horaInicio, horaFin) {
    if (horaFin === '23:59' || horaFin === '24:00') {
        return compararHHmm(hhmm, horaInicio) >= 0 && compararHHmm(hhmm, '23:59') <= 0;
    }
    return compararHHmm(hhmm, horaInicio) >= 0 && compararHHmm(hhmm, horaFin) < 0;
}

function validarHorarioFranja(horaInicio, horaFin) {
    if (!RE_HHMM.test(horaInicio) || !RE_HHMM.test(horaFin)) {
        throw new Error('horaInicio y horaFin deben tener formato HH:mm');
    }
    if (horaInicio === horaFin) {
        throw new Error('horaInicio y horaFin no pueden ser iguales (duración 0)');
    }
}

function cubrePorHorarioSemanal(dias, dia, hhmm, hi, hf) {
    const d = Number(dia);
    if (!cruzaMedianoche(hi, hf)) {
        return dias.includes(d) && horaEnRango(hhmm, hi, hf);
    }
    if (dias.includes(d) && compararHHmm(hhmm, hi) >= 0) return true;
    if (dias.includes(diaAnterior(d)) && compararHHmm(hhmm, hf) < 0) return true;
    return false;
}

function cubrePorFechaUnica(fecha, hhmm, hi, hf, ymd) {
    const y = String(ymd || '').trim().slice(0, 10);
    if (!RE_YMD.test(y)) return false;
    if (!cruzaMedianoche(hi, hf)) {
        return y === fecha && horaEnRango(hhmm, hi, hf);
    }
    if (y === fecha && compararHHmm(hhmm, hi) >= 0) return true;
    if (y === addDaysYmd(fecha, 1) && compararHHmm(hhmm, hf) < 0) return true;
    return false;
}

function bloqueCubreMomento(bloque, dia, hhmm, fechaYmd) {
    if (!bloque || bloque.activo === false) return false;
    const hi = bloque.horaInicio;
    const hf = bloque.horaFin;
    if (!hi || !hf) return false;
    const fecha = fechaUnicaDeBloque(bloque);
    if (fecha) {
        return cubrePorFechaUnica(fecha, hhmm, hi, hf, fechaYmd);
    }
    const dias = Array.isArray(bloque.diasSemana) ? bloque.diasSemana.map(Number) : [];
    if (dias.length === 0) return false;
    return cubrePorHorarioSemanal(dias, dia, hhmm, hi, hf);
}

function compararPrioridadBloques(a, b) {
    const fa = esBloqueFechaUnica(a) ? 0 : 1;
    const fb = esBloqueFechaUnica(b) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    const porDias = (a.diasSemana || []).length - (b.diasSemana || []).length;
    if (porDias !== 0) return porDias;
    const porInicio = compararHHmm(b.horaInicio, a.horaInicio);
    if (porInicio !== 0) return porInicio;
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
}

function elegirBloqueActivo(bloques, dia, hhmm, fechaYmd) {
    const candidatos = (bloques || []).filter((b) => bloqueCubreMomento(b, dia, hhmm, fechaYmd));
    candidatos.sort(compararPrioridadBloques);
    return candidatos[0] || null;
}

function minutosDesdeMedianoche(hhmm) {
    const [h, m] = String(hhmm || '00:00').split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function finExclusiveMinutos(horaFin) {
    if (horaFin === '23:59' || horaFin === '24:00') return 24 * 60;
    return minutosDesdeMedianoche(horaFin);
}

/** Segmentos [startMin, endMin) que el bloque ocupa en un día de semana 0..6. */
function segmentosEnDia(bloque, dia, fechaYmd) {
    const d = Number(dia);
    const hi = bloque.horaInicio;
    const hf = bloque.horaFin;
    const segs = [];
    const fechaP = fechaUnicaDeBloque(bloque);
    if (fechaP) {
        const hoy = normalizarFechaPuntual(fechaYmd);
        if (!hoy) return segs;
        if (!cruzaMedianoche(hi, hf)) {
            if (hoy !== fechaP) return segs;
            const start = minutosDesdeMedianoche(hi);
            const end = finExclusiveMinutos(hf);
            if (start < end) segs.push([start, end]);
            return segs;
        }
        if (hoy === fechaP) segs.push([minutosDesdeMedianoche(hi), 24 * 60]);
        if (hoy === addDaysYmd(fechaP, 1)) {
            const end = minutosDesdeMedianoche(hf);
            if (end > 0) segs.push([0, end]);
        }
        return segs;
    }
    const dias = Array.isArray(bloque.diasSemana) ? bloque.diasSemana.map(Number) : [];
    if (!cruzaMedianoche(hi, hf)) {
        if (!dias.includes(d)) return segs;
        const start = minutosDesdeMedianoche(hi);
        const end = finExclusiveMinutos(hf);
        if (start < end) segs.push([start, end]);
        return segs;
    }
    if (dias.includes(d)) segs.push([minutosDesdeMedianoche(hi), 24 * 60]);
    if (dias.includes(diaAnterior(d))) {
        const end = minutosDesdeMedianoche(hf);
        if (end > 0) segs.push([0, end]);
    }
    return segs;
}

function segmentosEnFecha(bloque, ymd) {
    const y = String(ymd || '').trim().slice(0, 10);
    if (!RE_YMD.test(y)) return [];
    const fecha = fechaUnicaDeBloque(bloque);
    if (fecha) {
        return segmentosEnDia(bloque, weekdayFromYmd(y), y);
    }
    return segmentosEnDia(bloque, diaSemanaDeYmd(y));
}

function _fechasRelevantesSolape(bloque) {
    const f = fechaUnicaDeBloque(bloque);
    if (!f) return [];
    const out = [f];
    if (cruzaMedianoche(bloque.horaInicio, bloque.horaFin)) {
        const nxt = addDaysYmd(f, 1);
        if (nxt) out.push(nxt);
    }
    return out;
}

function _segsCruzan(sa, sb) {
    for (const a of sa) {
        for (const b of sb) {
            if (a[0] < b[1] && b[0] < a[1]) return true;
        }
    }
    return false;
}

function franjasSolapan(bloqueA, bloqueB) {
    const fa = fechaUnicaDeBloque(bloqueA);
    const fb = fechaUnicaDeBloque(bloqueB);
    if (fa || fb) {
        const fechas = new Set([..._fechasRelevantesSolape(bloqueA), ..._fechasRelevantesSolape(bloqueB)]);
        if (fechas.size === 0) {
            for (let dia = 0; dia <= 6; dia++) {
                if (_segsCruzan(segmentosEnDia(bloqueA, dia), segmentosEnDia(bloqueB, dia))) return true;
            }
            return false;
        }
        for (const fecha of fechas) {
            const dia = weekdayFromYmd(fecha);
            if (_segsCruzan(segmentosEnDia(bloqueA, dia, fecha), segmentosEnDia(bloqueB, dia, fecha))) return true;
        }
        return false;
    }
    for (let dia = 0; dia <= 6; dia++) {
        if (_segsCruzan(segmentosEnDia(bloqueA, dia), segmentosEnDia(bloqueB, dia))) return true;
    }
    return false;
}

module.exports = {
    RE_HHMM,
    RE_YMD,
    compararHHmm,
    diaAnterior,
    cruzaMedianoche,
    normalizarFechaPuntual,
    weekdayFromYmd,
    addDaysYmd,
    diasSemanaDesdeFechaOLista,
    horaEnRango,
    validarHorarioFranja,
    bloqueCubreMomento,
    compararPrioridadBloques,
    elegirBloqueActivo,
    minutosDesdeMedianoche,
    segmentosEnDia,
    segmentosEnFecha,
    franjasSolapan,
    normalizarFechaYmd,
    fechaYmdDeBloque,
    fechaUnicaDeBloque,
    esBloqueFechaUnica,
    diaSemanaDeYmd,
    ymdMasUnDia,
    normalizarDiasSemana,
    prepararCamposBloqueCalendario
};
