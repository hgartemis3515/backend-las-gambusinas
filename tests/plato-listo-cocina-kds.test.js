const { platoRetenidoFueraDeCocina } = require('../src/utils/platoListoCocinaKds');

describe('platoListoCocinaKds', () => {
    test('para llevar sin ticket aprobado queda retenido', () => {
        expect(platoRetenidoFueraDeCocina({
            estado: 'pedido',
            tipoServicio: 'para_llevar'
        })).toBe(true);
        expect(platoRetenidoFueraDeCocina({
            estado: 'en_espera',
            tipoServicio: 'para_llevar',
            pagoAdelantado: { requerido: true, estadoTicket: 'pendiente_aprobacion' }
        })).toBe(true);
    });

    test('para llevar aprobado no está retenido', () => {
        expect(platoRetenidoFueraDeCocina({
            estado: 'pedido',
            tipoServicio: 'para_llevar',
            pagoAdelantado: { estadoTicket: 'aprobado' }
        })).toBe(false);
    });

    test('extra llevar entra a KDS sin PPA', () => {
        expect(platoRetenidoFueraDeCocina({
            estado: 'pedido',
            tipoServicio: 'extra_llevar'
        })).toBe(false);
        expect(platoRetenidoFueraDeCocina({
            estado: 'en_espera',
            tipoServicio: 'extra_llevar'
        })).toBe(false);
    });

    test('mesa normal no está retenida; pendiente sí', () => {
        expect(platoRetenidoFueraDeCocina({ estado: 'pedido', tipoServicio: 'mesa' })).toBe(false);
        expect(platoRetenidoFueraDeCocina({ estado: 'pendiente', tipoServicio: 'mesa' })).toBe(true);
    });
});
