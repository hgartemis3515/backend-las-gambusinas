const {
    pasosCadenaEntregaAbsoluta,
    destinosCambioEstadoPlato
} = require('../src/utils/cadenaEntregaPlato');

describe('cadenaEntregaPlato', () => {
    test('pass cocina (salio) cierra en entregado', () => {
        expect(destinosCambioEstadoPlato('recoger', 'salio', false)).toEqual(['salio', 'entregado']);
        expect(destinosCambioEstadoPlato('salio', 'salio', false)).toEqual(['entregado']);
    });

    test('absoluto desde pedido recorre recoger → salio → entregado', () => {
        expect(destinosCambioEstadoPlato('pedido', 'recoger', true)).toEqual(['recoger', 'salio', 'entregado']);
        expect(pasosCadenaEntregaAbsoluta('en_espera')).toEqual(['recoger', 'salio', 'entregado']);
    });

    test('entregado del mozo (legado) sigue siendo un solo paso', () => {
        expect(destinosCambioEstadoPlato('salio', 'entregado', false)).toEqual(['entregado']);
    });

    test('ya entregado no re-aplica cadena', () => {
        expect(destinosCambioEstadoPlato('entregado', 'salio', false)).toEqual([]);
        expect(destinosCambioEstadoPlato('pagado', 'salio', true)).toEqual([]);
    });
});
