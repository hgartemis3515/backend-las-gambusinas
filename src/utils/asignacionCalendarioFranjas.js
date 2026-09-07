/**
 * Calendario semanal de asignación automática (platos y guarniciones).
 * Zona horaria de runtime: America/Lima. Días: moment.day() 0=Dom … 6=Sáb.
 *
 * Cruce de medianoche: horaFin < horaInicio (ej. 22:00–06:00).
 * diasSemana = días en que EMPIEZA el turno (plantilla recurrente).
 * fechaPuntual = 'YYYY-MM-DD' Lima: excepción de un solo día (no se repite).
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

function normalizarFechaPuntual(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim().slice(0, 10);
    return RE_YMD.test(s) ? s : null;
}

function weekdayFromYmd(ymd) {
    const fecha = normalizarFechaPuntual(ymd);
    if (!fecha) return null;
    const [y, m, d] = fecha.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
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

function diasSemanaDesdeFechaOLista(diasSemana, fechaPuntual) {
    const fecha = normalizarFechaPuntual(fechaPuntual);
    if (fecha) return [weekdayFromYmd(fecha)];
    const diasNorm = Array.isArray(diasSemana)
        ? [...new Set(diasSemana.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
        : [];
    return diasNorm;
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

function bloqueCubreMomento(bloque, dia, hhmm, fechaYmd) {
    if (!bloque || bloque.activo === false) return false;
    const hi = bloque.horaInicio;
    const hf = bloque.horaFin;
    if (!hi || !hf) return false;
    const d = Number(dia);
    const fechaP = normalizarFechaPuntual(bloque.fechaPuntual);

    if (fechaP) {
        const hoy = normalizarFechaPuntual(fechaYmd);
        if (!hoy) return false;
        if (!cruzaMedianoche(hi, hf)) {
            return hoy === fechaP && horaEnRango(hhmm, hi, hf);
        }
        if (hoy === fechaP && compararHHmm(hhmm, hi) >= 0) return true;
        if (hoy === addDaysYmd(fechaP, 1) && compararHHmm(hhmm, hf) < 0) return true;
        return false;
    }

    const dias = Array.isArray(bloque.diasSemana) ? bloque.diasSemana.map(Number) : [];
    if (dias.length === 0) return false;

    if (!cruzaMedianoche(hi, hf)) {
        return dias.includes(d) && horaEnRango(hhmm, hi, hf);
    }
    if (dias.includes(d) && compararHHmm(hhmm, hi) >= 0) return true;
    if (dias.includes(diaAnterior(d)) && compararHHmm(hhmm, hf) < 0) return true;
    return false;
}

function compararPrioridadBloques(a, b) {
    const puntualA = normalizarFechaPuntual(a.fechaPuntual) ? 0 : 1;
    const puntualB = normalizarFechaPuntual(b.fechaPuntual) ? 0 : 1;
    if (puntualA !== puntualB) return puntualA - puntualB;
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
    const fechaP = normalizarFechaPuntual(bloque.fechaPuntual);
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

function _fechasRelevantesSolape(bloque) {
    const f = normalizarFechaPuntual(bloque.fechaPuntual);
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
    const fa = normalizarFechaPuntual(bloqueA.fechaPuntual);
    const fb = normalizarFechaPuntual(bloqueB.fechaPuntual);
    if (fa || fb) {
        const fechas = new Set([..._fechasRelevantesSolape(bloqueA), ..._fechasRelevantesSolape(bloqueB)]);
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
    franjasSolapan
};
