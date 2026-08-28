const {
    cantidadUnidadesPlato,
    cantidadUnidadesGuarnicion
} = require('../src/utils/cantidadLineaComanda');

describe('cantidadLineaComanda', () => {
    test('usa comanda.cantidades[index] como Ver Cocina Completo', () => {
        const comanda = { cantidades: [2] };
        const plato = { cantidad: 1 };
        expect(cantidadUnidadesPlato(comanda, 0, plato)).toBe(2);
    });

    test('fallback a plato.cantidad si no hay array', () => {
        expect(cantidadUnidadesPlato({}, 0, { cantidad: 3 })).toBe(3);
        expect(cantidadUnidadesPlato(null, 0, null)).toBe(1);
    });

    test('guarnición de 2 truchas con la misma opción cuenta 2', () => {
        expect(cantidadUnidadesGuarnicion({ cantidad: 1 }, 2)).toBe(2);
        expect(cantidadUnidadesGuarnicion({ cantidad: 2 }, 2)).toBe(2);
        expect(cantidadUnidadesGuarnicion({ cantidad: 1 }, 1)).toBe(1);
    });
});
