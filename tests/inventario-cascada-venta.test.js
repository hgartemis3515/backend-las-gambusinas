const {
    cadenaDe,
    repartirVenta,
    validarCocidoConfig,
    atribuirVentas,
    semillaCocido
} = require('../src/utils/inventarioCascadaVenta');

const saltado = { tieneCocido: true, reservaClave: 'pechuga-pollo' };

function vender(n, bases) {
    return repartirVenta(n, cadenaDe('salt-pollo', saltado), bases);
}

test('el cuarto y el mix de pecho no pasan a pecho de pollo', () => {
    const venta = {
        rubro: 'pollo-lena',
        cantidad: 4,
        fecha: '2026-11-03T18:00:00-05:00',
        detalle: [{ nombre: '1/4 pollo a la leña', cantidad: 4, factor: 1, platos: 4 }]
    };
    const out = atribuirVentas([], [venta], { 'pollo-lena': semillaCocido('pollo-lena') });
    const stock = out.filter((v) => !v.sinSaldo);
    expect(stock.map((v) => v.rubro)).toEqual(['pollo-lena']);
    expect(stock.some((v) => v.rubro === 'pechuga-pollo')).toBe(false);
    expect(semillaCocido('pollo-lena').reservaClave).toBe('');
});

test('estas filas nacen con cuadro de cocido', () => {
    [
        'sandwiches', 'pollo-lena', 'pierna-lena', 'pachamanca-pollo',
        'pachamanca-chancho', 'pachamanca-res', 'pachamanca-cordero'
    ].forEach((clave) => {
        expect(semillaCocido(clave).tieneCocido).toBe(true);
    });
    expect(semillaCocido('filete').tieneCocido).toBe(false);
    expect(semillaCocido('menu').tieneCocido).toBe(false);
    expect(semillaCocido('menu-pecho').tieneCocido).toBe(false);
    expect(semillaCocido('menu-pierna').tieneCocido).toBe(false);
});

test('el pollo saltado resta primero el cocido', () => {
    const bases = { 'salt-pollo|cocido': 3, 'salt-pollo|crudo': 2, 'pechuga-pollo|crudo': 10 };
    expect(vender(2, bases)).toEqual([{ rubro: 'salt-pollo', tipo: 'cocido', cantidad: 2 }]);
    expect(bases['salt-pollo|cocido']).toBe(1);
});

test('sin cocido usa el crudo y luego la pechuga', () => {
    const bases = { 'salt-pollo|cocido': 1, 'salt-pollo|crudo': 1, 'pechuga-pollo|crudo': 10 };
    expect(vender(4, bases)).toEqual([
        { rubro: 'salt-pollo', tipo: 'cocido', cantidad: 1 },
        { rubro: 'salt-pollo', tipo: 'crudo', cantidad: 1 },
        { rubro: 'pechuga-pollo', tipo: 'crudo', cantidad: 2 }
    ]);
    expect(bases['pechuga-pollo|crudo']).toBe(8);
});

test('si nada tiene saldo la pechuga queda en negativo', () => {
    const bases = {};
    expect(vender(1, bases)).toEqual([{ rubro: 'pechuga-pollo', tipo: 'crudo', cantidad: 1 }]);
    expect(bases['pechuga-pollo|crudo']).toBe(-1);
});

test('la materia no tiene cocido ni reserva', () => {
    expect(cadenaDe('filete', { tieneCocido: true, reservaClave: 'pechuga-pollo' })).toEqual([{ rubro: 'filete', tipo: 'crudo' }]);
    expect(validarCocidoConfig('filete', { tieneCocido: true })).toEqual({ valido: true, tieneCocido: false, reservaClave: '' });
    expect(validarCocidoConfig('pollada', { tieneCocido: true, reservaClave: 'pollada' }).valido).toBe(false);
});

test('la pollada gasta crudo y al final la pierna', () => {
    const bases = { 'pollada|crudo': 1, 'pierna-pollo|crudo': 5 };
    expect(repartirVenta(3, cadenaDe('pollada', semillaCocido('pollada')), bases)).toEqual([
        { rubro: 'pollada', tipo: 'crudo', cantidad: 1 },
        { rubro: 'pierna-pollo', tipo: 'crudo', cantidad: 2 }
    ]);
    expect(bases['pollada|crudo']).toBe(0);
    expect(bases['pierna-pollo|crudo']).toBe(3);
});

test('sin cocido ni crudo la pollada resta la pierna y se sigue viendo en pollada', () => {
    const detalle = [{ nombre: 'Pollada + papa fritas', cantidad: 2, comanda: 'Comanda 4' }];
    const out = atribuirVentas([], [{
        rubro: 'pollada',
        nombre: 'Pollada',
        cantidad: 2,
        fecha: '2026-10-31T12:00:00-05:00',
        detalle
    }]);
    const stock = out.filter((v) => !v.sinSaldo);
    const vista = out.filter((v) => v.sinSaldo);
    expect(stock.map((v) => [v.rubro, v.tipoProducto, v.cantidad])).toEqual([
        ['pierna-pollo', 'crudo', 2]
    ]);
    expect(vista).toEqual([expect.objectContaining({
        rubro: 'pollada',
        tipoProducto: 'crudo',
        cantidad: 2,
        detalle
    })]);
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
    const stock = out.filter((v) => !v.sinSaldo);
    expect(stock.map((v) => [v.rubro, v.tipoProducto, v.cantidad])).toEqual([
        ['pechuga-pollo', 'crudo', 1],
        ['salt-pollo', 'cocido', 2],
        ['pechuga-pollo', 'crudo', 1]
    ]);
    expect(stock[1].detalle).toEqual([]);
    expect(stock[1].usoNombre).toBe('Cocido');
    expect(stock[2].usoNombre).toBe('Principal — Pecho de Pollo');
    expect(stock[0].usoNombre).toBe('Principal — Pecho de Pollo');
    expect(out.filter((v) => v.sinSaldo).map((v) => [v.rubro, v.cantidad])).toEqual([
        ['salt-pollo', 1],
        ['salt-pollo', 1]
    ]);
});

test('la milanesa junior resta cocido, luego crudo y al final el filete', () => {
    const detalle = [{ nombre: 'Milanesa junior', cantidad: 3, comanda: 'Comanda 8', factor: 1, platos: 3 }];
    const out = atribuirVentas([], [{
        rubro: 'milanesa-junior',
        cantidad: 3,
        fecha: '2026-10-31T18:00:00-05:00',
        detalle
    }], {});
    const stock = out.filter((v) => !v.sinSaldo);
    const conStock = atribuirVentas([
        { rubro: 'milanesa-junior', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 1, fecha: '2026-10-31T10:00:00-05:00' },
        { rubro: 'milanesa-junior', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 1, fecha: '2026-10-31T10:00:00-05:00' },
        { rubro: 'filete', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 5, fecha: '2026-10-31T10:00:00-05:00' }
    ], [{
        rubro: 'milanesa-junior',
        cantidad: 3,
        fecha: '2026-10-31T18:00:00-05:00',
        detalle
    }]);
    expect(conStock.filter((v) => !v.sinSaldo).map((v) => [v.usoNombre, v.cantidad, v.detalle[0].cantidad])).toEqual([
        ['Cocido', 1, 1],
        ['Crudo', 1, 1],
        ['Principal — Filete de pollo', 1, 1]
    ]);
    expect(stock.map((v) => v.usoNombre)).toEqual(['Principal — Filete de pollo']);
});

test('un rubro sin cuadro cocido gasta antes el cocido que quedó', () => {
    const movs = [{ rubro: 'milanesa', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 1, fecha: '2026-10-12T10:00:00-05:00' }];
    const out = atribuirVentas(movs, [{ rubro: 'milanesa', cantidad: 2, fecha: '2026-10-12T12:00:00-05:00' }], {});
    expect(out.filter((v) => !v.sinSaldo).map((v) => [v.rubro, v.tipoProducto, v.cantidad])).toEqual([
        ['milanesa', 'cocido', 1],
        ['filete', 'crudo', 1]
    ]);
});
