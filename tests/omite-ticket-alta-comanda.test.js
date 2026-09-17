const {
  esPlatoDch,
  comandaEsSoloDch,
  comandaEsCostoCeroAlta,
  comandaOmiteTicketAlta,
} = require('../src/utils/omiteTicketAltaComanda');

describe('omiteTicketAltaComanda', () => {
  test('detecta DCH por alias de cocina, nombre o código', () => {
    expect(esPlatoDch({ plato: { nombreCocina: 'DCH' } })).toBe(true);
    expect(esPlatoDch({ plato: { nombre: 'DCH' } })).toBe(true);
    expect(esPlatoDch({ codigo: 'dch' })).toBe(true);
    expect(esPlatoDch({ nombreCocinaPedido: 'DCH Te' })).toBe(true);
    expect(esPlatoDch({ nombreCocinaPedido: 'DCH Cafe' })).toBe(true);
    expect(esPlatoDch({ plato: { nombre: 'Lomo Saltado', nombreCocina: 'Lomo S/' } })).toBe(false);
  });

  test('omite ticket si las líneas son variantes DCH Te/Café sin populate', () => {
    const c = {
      platos: [
        { nombreCocinaPedido: 'DCH Te', precioUnitario: 0 },
        { nombreCocinaPedido: 'DCH Cafe', precioUnitario: 0 },
      ],
    };
    expect(comandaEsSoloDch(c)).toBe(true);
    expect(comandaOmiteTicketAlta(c)).toBe(true);
  });

  test('omite ticket si la comanda es solo DCH', () => {
    const c = {
      platos: [
        { plato: { nombreCocina: 'DCH', nombre: 'Desayuno chef', precio: 0 } },
      ],
      cantidades: [1],
    };
    expect(comandaEsSoloDch(c)).toBe(true);
    expect(comandaOmiteTicketAlta(c)).toBe(true);
  });

  test('omite ticket si el total es 0 soles', () => {
    const c = {
      totalCalculado: 0,
      totalSinDescuento: 0,
      platos: [{ plato: { nombre: 'Cortesía', precio: 0 }, precioUnitario: 0 }],
      cantidades: [1],
    };
    expect(comandaEsCostoCeroAlta(c)).toBe(true);
    expect(comandaOmiteTicketAlta(c)).toBe(true);
  });

  test('sí crea ticket si hay DCH mezclado con un plato de pago', () => {
    const c = {
      totalCalculado: 32,
      platos: [
        { plato: { nombreCocina: 'DCH', precio: 0 }, precioUnitario: 0 },
        { plato: { nombre: 'Lomo Saltado', precio: 32 }, precioUnitario: 32 },
      ],
      cantidades: [1, 1],
    };
    expect(comandaEsSoloDch(c)).toBe(false);
    expect(comandaOmiteTicketAlta(c)).toBe(false);
  });

  test('omite ticket si omitirPago está activo', () => {
    const c = {
      omitirPago: true,
      totalCalculado: 40,
      platos: [{ plato: { nombre: 'Lomo', precio: 40 }, precioUnitario: 40 }],
    };
    expect(comandaOmiteTicketAlta(c)).toBe(true);
  });
});
