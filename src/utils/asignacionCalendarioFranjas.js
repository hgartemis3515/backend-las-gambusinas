/**
 * Calendario semanal de asignación automática (platos y guarniciones).
 * Zona horaria de runtime: America/Lima. Días: moment.day() 0=Dom … 6=Sáb.
 *
 * Cruce de medianoche: horaFin < horaInicio (ej. 22:00–06:00).
 * diasSemana = días en que EMPIEZA el turno.
 * Intervalo [horaInicio, horaFin) con horaFin exclusiva (23:59/24:00 = fin de día).
 */

const RE_HHMM = /^\d{2}:\d{2}$/;

function compararHHmm(a, b) {
    return a < b ? -1 : (a > b ? 1 : 0);
}

function diaAnterior(dia) {
    return (Number(dia) + 6) % 7;
}

function cruzaMedianoche(horaInicio, horaFin) {
    return compararHHmm(horaFin, horaInicio) < 0;
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

function bloqueCubreMomento(bloque, dia, hhmm) {
    if (!bloque || bloque.activo === false) return false;
    const dias = Array.isArray(bloque.diasSemana) ? bloque.diasSemana.map(Number) : [];
    if (dias.length === 0) return false;
    const hi = bloque.horaInicio;
    const hf = bloque.horaFin;
    if (!hi || !hf) return false;
    const d = Number(dia);

    if (!cruzaMedianoche(hi, hf)) {
        return dias.includes(d) && horaEnRango(hhmm, hi, hf);
    }
    if (dias.includes(d) && compararHHmm(hhmm, hi) >= 0) return true;
    if (dias.includes(diaAnterior(d)) && compararHHmm(hhmm, hf) < 0) return true;
    return false;
}

function compararPrioridadBloques(a, b) {
    const porDias = (a.diasSemana || []).length - (b.diasSemana || []).length;
    if (porDias !== 0) return porDias;
    const porInicio = compararHHmm(b.horaInicio, a.horaInicio);
    if (porInicio !== 0) return porInicio;
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
}

function elegirBloqueActivo(bloques, dia, hhmm) {
    const candidatos = (bloques || []).filter((b) => bloqueCubreMomento(b, dia, hhmm));
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
function segmentosEnDia(bloque, dia) {
    const d = Number(dia);
    const dias = Array.isArray(bloque.diasSemana) ? bloque.diasSemana.map(Number) : [];
    const hi = bloque.horaInicio;
    const hf = bloque.horaFin;
    const segs = [];
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

function franjasSolapan(bloqueA, bloqueB) {
    for (let dia = 0; dia <= 6; dia++) {
        const sa = segmentosEnDia(bloqueA, dia);
        const sb = segmentosEnDia(bloqueB, dia);
        for (const a of sa) {
            for (const b of sb) {
                if (a[0] < b[1] && b[0] < a[1]) return true;
            }
        }
    }
    return false;
}

module.exports = {
    RE_HHMM,
    compararHHmm,
    diaAnterior,
    cruzaMedianoche,
    horaEnRango,
    validarHorarioFranja,
    bloqueCubreMomento,
    compararPrioridadBloques,
    elegirBloqueActivo,
    minutosDesdeMedianoche,
    segmentosEnDia,
    franjasSolapan
};
