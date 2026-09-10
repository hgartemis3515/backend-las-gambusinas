const {
    minutosEntregaAutomaticaMozos,
    parseTiempoMs,
    msRestantesEntregaAutomatica,
    tiempoSalioRequiereReparacion
} = require('../src/utils/entregaAutomaticaMozos');

describe('entregaAutomaticaMozos', () => {
    const now = Date.parse('2026-09-09T20:00:00.000Z');

    test('config default 15, 0 = instante, tope 180', () => {
        expect(minutosEntregaAutomaticaMozos({})).toBe(15);
        expect(minutosEntregaAutomaticaMozos({ mozos: { entregaAutomaticaMinutos: 0 } })).toBe(0);
        expect(minutosEntregaAutomaticaMozos({ mozos: { entregaAutomaticaMinutos: 15 } })).toBe(15);
        expect(minutosEntregaAutomaticaMozos({ mozos: { entregaAutomaticaMinutos: 200 } })).toBe(180);
    });

    test('countdown parte en los minutos configurados, no más', () => {
        const plato = { tiempos: { salio: new Date(now) } };
        expect(msRestantesEntregaAutomatica(plato, 15, now)).toBe(15 * 60 * 1000);
        expect(msRestantesEntregaAutomatica(plato, 0, now)).toBe(0);
    });

    test('marca salio en el futuro no infla el cronómetro (antes ~77 min)', () => {
        const futuro = now + 62 * 60 * 1000;
        const plato = { tiempos: { salio: new Date(futuro) } };
        expect(msRestantesEntregaAutomatica(plato, 15, now)).toBe(15 * 60 * 1000);
        expect(msRestantesEntregaAutomatica(plato, 15, now)).toBeLessThan(16 * 60 * 1000);
        expect(tiempoSalioRequiereReparacion(plato, now)).toBe(true);
    });

    test('no usa recoger: si solo hay recoger antiguo, cuenta 15 desde ahora', () => {
        const plato = { tiempos: { recoger: new Date(now - 77 * 60 * 1000) } };
        expect(msRestantesEntregaAutomatica(plato, 15, now)).toBe(15 * 60 * 1000);
        expect(tiempoSalioRequiereReparacion(plato, now)).toBe(true);
    });

    test('a los 15 minutos restantes es 0', () => {
        const plato = { tiempos: { salio: new Date(now - 15 * 60 * 1000) } };
        expect(msRestantesEntregaAutomatica(plato, 15, now)).toBe(0);
        expect(tiempoSalioRequiereReparacion(plato, now)).toBe(false);
    });

    test('a los 10 minutos quedan 5', () => {
        const plato = { tiempos: { salio: new Date(now - 10 * 60 * 1000) } };
        expect(msRestantesEntregaAutomatica(plato, 15, now)).toBe(5 * 60 * 1000);
    });

    test('parse ISO y $date', () => {
        expect(parseTiempoMs('2026-09-09T20:00:00.000Z')).toBe(now);
        expect(parseTiempoMs({ $date: '2026-09-09T20:00:00.000Z' })).toBe(now);
    });
});
