const {
    cadenaDe,
    repartirVenta,
    validarCocidoConfig,
    atribuirVentas,
    semillaCocido
} = require('../src/utils/inventarioCascadaVenta');

const saltado = { tieneCocido: true, reservaClave: 'filete' };

function vender(n, bases) {
    return repartirVenta(n, cadenaDe('salt-pollo', saltado), bases);
}

test('estas filas nacen con cuadro de cocido', () => {
    [
        'chaufa-pollo', 'chicharron-pollo', 'filete-junior', 'salt-pollo', 'milanesa',
        'menu', 'pollo-lena', 'pierna-lena', 'pollada', 'pachamanca-pollo',
        'pachamanca-chancho', 'pachamanca-res', 'pachamanca-cordero'
    ].forEach((clave) => {
        expect(semillaCocido(clave).tieneCocido).toBe(true);
    });
    expect(semillaCocido('filete').tieneCocido).toBe(false);
});

test('el pollo saltado resta primero el cocido', () => {
    const bases = { 'salt-pollo|cocido': 3, 'salt-pollo|crudo': 2, 'filete|crudo': 10 };
    expect(vender(2, bases)).toEqual([{ rubro: 'salt-pollo', tipo: 'cocido', cantidad: 2 }]);
    expect(bases['salt-pollo|cocido']).toBe(1);
});

test('sin cocido usa el crudo y luego el filete', () => {
    const bases = { 'salt-pollo|cocido': 1, 'salt-pollo|crudo': 1, 'filete|crudo': 10 };
    expect(vender(4, bases)).toEqual([
        { rubro: 'salt-pollo', tipo: 'cocido', cantidad: 1 },
        { rubro: 'salt-pollo', tipo: 'crudo', cantidad: 1 },
        { rubro: 'filete', tipo: 'crudo', cantidad: 2 }
    ]);
    expect(bases['filete|crudo']).toBe(8);
});

test('si nada tiene saldo el filete queda en negativo', () => {
    const bases = {};
    expect(vender(1, bases)).toEqual([{ rubro: 'filete', tipo: 'crudo', cantidad: 1 }]);
    expect(bases['filete|crudo']).toBe(-1);
});

test('la materia no tiene cocido ni reserva', () => {
    expect(cadenaDe('filete', { tieneCocido: true, reservaClave: 'pechuga-pollo' })).toEqual([{ rubro: 'filete', tipo: 'crudo' }]);
    expect(validarCocidoConfig('filete', { tieneCocido: true })).toEqual({ valido: true, tieneCocido: false, reservaClave: '' });
    expect(validarCocidoConfig('pollada', { tieneCocido: true, reservaClave: 'pollada' }).valido).toBe(false);
});

test('la pollada sin reserva deja su crudo en negativo', () => {
    const bases = { 'pollada|cocido': 1 };
    expect(repartirVenta(3, cadenaDe('pollada', semillaCocido('pollada')), bases)).toEqual([
        { rubro: 'pollada', tipo: 'cocido', cantidad: 1 },
        { rubro: 'pollada', tipo: 'crudo', cantidad: 2 }
    ]);
    expect(bases['pollada|crudo']).toBe(-2);
});

test('una venta usa el ingreso de cocido guardado antes en el mismo día', () => {
    const movs = [
        { rubro: 'salt-pollo', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 2, fecha: '2026-10-12T12:00:00-05:00' }
    ];
    const ventas = [
        { rubro: 'salt-pollo', nombre: 'Saltado', cantidad: 1, fecha: '2026-10-12T11:00:00-05:00', detalle: ['a'] },
        { rubro: 'salt-pollo', nombre: 'Saltado', cantidad: 3, fecha: '2026-10-12T13:00:00-05:00', detalle: ['b'] }
    ];
    const out = atribuirVentas(movs, ventas, { 'salt-pollo': saltado });
    expect(out.map((v) => [v.rubro, v.tipoProducto, v.cantidad])).toEqual([
        ['filete', 'crudo', 1],
        ['salt-pollo', 'cocido', 2],
        ['filete', 'crudo', 1]
    ]);
    expect(out[1].detalle).toEqual(['b']);
    expect(out[2].detalle).toEqual([]);
});

test('un rubro sin cuadro cocido gasta antes el cocido que quedó', () => {
    const movs = [{ rubro: 'milanesa', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 1, fecha: '2026-10-12T10:00:00-05:00' }];
    const out = atribuirVentas(movs, [{ rubro: 'milanesa', cantidad: 2, fecha: '2026-10-12T12:00:00-05:00' }], {});
    expect(out.map((v) => [v.rubro, v.tipoProducto, v.cantidad])).toEqual([
        ['milanesa', 'cocido', 1],
        ['filete', 'crudo', 1]
    ]);
});
