const { platoUneComplementos } = require('../src/utils/platoUneComplementos');

describe('platoUneComplementos', () => {
    test('snapshot true gana', () => {
        expect(platoUneComplementos({
            complementosUnidosAlPlato: true,
            plato: { complementosUnidosAlPlato: false }
        })).toBe(true);
    });
    test('snapshot false no usa catálogo', () => {
        expect(platoUneComplementos({
            complementosUnidosAlPlato: false,
            plato: { complementosUnidosAlPlato: true }
        })).toBe(false);
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
