const {
    snapshotAsignacionCocinero,
    camposRestauracionAlRevertir,
    restaurarCocineroEnPlatoDocumento
} = require('../src/utils/restaurarAsignacionAlRevertir');

describe('restaurarAsignacionAlRevertir', () => {
    const cocinero3 = {
        cocineroId: 'c3',
        nombre: 'Luis',
        alias: 'Chef 3',
        pronombre: 'C3',
        timestamp: new Date('2026-09-07T20:00:00Z'),
        tomadoEn: new Date('2026-09-07T19:50:00Z')
    };

    test('usa procesadoPor (cocinero que finalizó / auto-asignado)', () => {
        const snap = snapshotAsignacionCocinero({
            procesandoPor: { cocineroId: null },
            procesadoPor: cocinero3
        });
        expect(snap.cocineroId).toBe('c3');
        expect(snap.pronombre).toBe('C3');
        expect(snap.timestamp).toEqual(cocinero3.tomadoEn);
    });

    test('si aún está tomado, usa procesandoPor', () => {
        const snap = snapshotAsignacionCocinero({
            procesandoPor: { cocineroId: 'c1', alias: 'Ana' },
            procesadoPor: { cocineroId: null }
        });
        expect(snap.cocineroId).toBe('c1');
        expect(snap.alias).toBe('Ana');
    });

    test('campos $set restauran plato y guarnición auto-cerrada', () => {
        const ahora = new Date('2026-09-07T21:00:00Z');
        const plato = {
            procesandoPor: { cocineroId: null },
            procesadoPor: cocinero3,
            complementosSeleccionados: [{
                estadoCocina: 'recoger',
                procesandoPor: { cocineroId: null },
                procesadoPor: { cocineroId: 'c4', alias: 'C4', pronombre: 'C4', tomadoEn: ahora }
            }]
        };
        const fields = camposRestauracionAlRevertir(plato, 2, ahora);
        expect(fields['platos.2.procesandoPor'].cocineroId).toBe('c3');
        expect(fields['platos.2.complementosSeleccionados.0.procesandoPor'].cocineroId).toBe('c4');
        expect(fields['platos.2.complementosSeleccionados.0.estadoCocina']).toBe('en_espera');
    });

    test('documento in-place no borra procesadoPor y reasigna', () => {
        const ahora = new Date();
        const plato = {
            procesandoPor: { cocineroId: null, nombre: null },
            procesadoPor: { ...cocinero3 },
            complementosSeleccionados: []
        };
        restaurarCocineroEnPlatoDocumento(plato, ahora);
        expect(plato.procesandoPor.cocineroId).toBe('c3');
        expect(plato.procesadoPor.cocineroId).toBe('c3');
    });
});
