'use strict';

const MAX_ARMADO_SEGUNDOS = 30 * 60;

function parseArmadoInicio(value) {
    if (value == null || value === '') return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

function clampArmadoSegundos(seg) {
    if (seg == null || !Number.isFinite(Number(seg))) {
        return { segundos: null, clamped: false };
    }
    const n = Math.round(Number(seg));
    if (n < 0) return { segundos: 0, clamped: true };
    if (n > MAX_ARMADO_SEGUNDOS) return { segundos: MAX_ARMADO_SEGUNDOS, clamped: true };
    return { segundos: n, clamped: false };
}

function segundosArmado({ iniciadoEn, enviadoEn, fallbackSegundos } = {}) {
    const inicio = parseArmadoInicio(iniciadoEn);
    const fin = parseArmadoInicio(enviadoEn) || new Date();
    if (inicio) {
        const raw = Math.round((fin.getTime() - inicio.getTime()) / 1000);
        return clampArmadoSegundos(raw);
    }
    if (fallbackSegundos != null && fallbackSegundos !== '') {
        return clampArmadoSegundos(Number(fallbackSegundos));
    }
    return { segundos: null, clamped: false };
}

function segArmadoComanda(c) {
    if (!c) return 0;
    if (c.tiempoArmadoAcumuladoSegundos != null && Number.isFinite(Number(c.tiempoArmadoAcumuladoSegundos))) {
        return Math.max(0, Math.round(Number(c.tiempoArmadoAcumuladoSegundos)));
    }
    if (c.tiempoArmadoSegundos != null && Number.isFinite(Number(c.tiempoArmadoSegundos))) {
        return Math.max(0, Math.round(Number(c.tiempoArmadoSegundos)));
    }
    return 0;
}

/** T. mozo de comanda = salón (suma platos) + armado una sola vez. */
function tiempoMozoComandaSegundos(salonSegundos, armadoSegundos) {
    const armado = Math.max(0, Number(armadoSegundos) || 0);
    if (salonSegundos == null || !Number.isFinite(Number(salonSegundos))) {
        return armado > 0 ? armado : null;
    }
    return Math.max(0, Math.round(Number(salonSegundos))) + armado;
}

module.exports = {
    MAX_ARMADO_SEGUNDOS,
    parseArmadoInicio,
    clampArmadoSegundos,
    segundosArmado,
    segArmadoComanda,
    tiempoMozoComandaSegundos
};
