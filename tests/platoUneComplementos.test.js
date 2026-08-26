const { platoUneComplementos } = require('../src/utils/platoUneComplementos');

describe('platoUneComplementos', () => {
    test('snapshot true gana', () => {
        expect(platoUneComplementos({
            complementosUnidosAlPlato: true,
            plato: { complementosUnidosAlPlato: false }
        })).toBe(true);
    });
    test('catálogo true une aunque el snapshot de la línea sea false', () => {
        expect(platoUneComplementos({
            complementosUnidosAlPlato: false,
            plato: { complementosUnidosAlPlato: true }
        })).toBe(true);
    });
    test('sin snapshot usa catálogo populado', () => {
        expect(platoUneComplementos({
            plato: { complementosUnidosAlPlato: true, nombre: 'Pachamanca' }
        })).toBe(true);
    });
    test('sin flag → false', () => {
        expect(platoUneComplementos({})).toBe(false);
        expect(platoUneComplementos(null)).toBe(false);
    });
});
