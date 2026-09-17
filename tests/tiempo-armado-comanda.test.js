const {
    MAX_ARMADO_SEGUNDOS,
    segundosArmado,
    segArmadoComanda,
    tiempoMozoComandaSegundos
} = require('../src/utils/tiempoArmadoComanda');

describe('tiempoArmadoComanda', () => {
    const t0 = new Date('2026-09-17T18:00:00.000Z');

    test('87 s exactos', () => {
        const t1 = new Date(t0.getTime() + 87 * 1000);
        const r = segundosArmado({ iniciadoEn: t0, enviadoEn: t1 });
        expect(r.segundos).toBe(87);
        expect(r.clamped).toBe(false);
    });

    test('t0 > t1 → 0 clamped', () => {
        const t1 = new Date(t0.getTime() - 5000);
        const r = segundosArmado({ iniciadoEn: t0, enviadoEn: t1 });
        expect(r.segundos).toBe(0);
        expect(r.clamped).toBe(true);
    });

    test('40 min → clamp 30 min', () => {
        const t1 = new Date(t0.getTime() + 40 * 60 * 1000);
        const r = segundosArmado({ iniciadoEn: t0.toISOString(), enviadoEn: t1 });
        expect(r.segundos).toBe(MAX_ARMADO_SEGUNDOS);
        expect(r.clamped).toBe(true);
    });

    test('sin campos → null', () => {
        const r = segundosArmado({});
        expect(r.segundos).toBeNull();
        expect(r.clamped).toBe(false);
    });

    test('solo fallback 12', () => {
        const r = segundosArmado({ fallbackSegundos: 12 });
        expect(r.segundos).toBe(12);
        expect(r.clamped).toBe(false);
    });

    test('segArmado prefiere acumulado', () => {
        expect(segArmadoComanda({ tiempoArmadoAcumuladoSegundos: 10, tiempoArmadoSegundos: 90 })).toBe(10);
        expect(segArmadoComanda({ tiempoArmadoSegundos: 90 })).toBe(90);
        expect(segArmadoComanda({})).toBe(0);
    });

    test('armado se suma una vez, no por plato', () => {
        const salon = 20 + 30;
        const armado = 10;
        expect(tiempoMozoComandaSegundos(salon, armado)).toBe(60);
        expect(tiempoMozoComandaSegundos(salon, armado)).not.toBe(80);
    });

    test('solo armado, cocina aún en espera', () => {
        expect(tiempoMozoComandaSegundos(null, 10)).toBe(10);
        expect(tiempoMozoComandaSegundos(null, 0)).toBeNull();
        expect(tiempoMozoComandaSegundos(null, null)).toBeNull();
    });
});
