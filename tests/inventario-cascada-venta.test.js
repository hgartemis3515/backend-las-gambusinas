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

test('el mix de pecho gasta cocido de pecho leña, luego crudo y al final pecho de pollo', () => {
    const movimientos = [
        { rubro: 'pollo-lena', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 1, fecha: '2026-11-03T12:00:00-05:00' },
        { rubro: 'pollo-lena', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 1, fecha: '2026-11-03T12:00:00-05:00' },
        { rubro: 'pechuga-pollo', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 5, fecha: '2026-11-03T12:00:00-05:00' }
    ];
    const venta = {
        rubro: 'pollo-lena',
        nombre: 'Mixto a la leña Pecho',
        cantidad: 3,
        fecha: '2026-11-03T18:00:00-05:00',
        detalle: [{ nombre: 'Mixto a la leña Pecho', cantidad: 3, factor: 1, platos: 3 }]
    };
    const out = atribuirVentas(movimientos, [venta], { 'pollo-lena': semillaCocido('pollo-lena') }).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual([
        'pollo-lena|cocido:1',
        'pollo-lena|crudo:1',
        'pechuga-pollo|crudo:1'
    ]);
});

test('el mix de pierna gasta cocido de pierna leña, luego crudo y al final pierna de pollo', () => {
    const movimientos = [
        { rubro: 'pierna-lena', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 1, fecha: '2026-11-03T12:00:00-05:00' },
        { rubro: 'pierna-lena', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 1, fecha: '2026-11-03T12:00:00-05:00' },
        { rubro: 'pierna-pollo', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 5, fecha: '2026-11-03T12:00:00-05:00' }
    ];
    const venta = {
        rubro: 'pierna-lena',
        nombre: 'Mixto a la leña Pierna',
        cantidad: 3,
        fecha: '2026-11-03T18:00:00-05:00',
        detalle: [{ nombre: 'Mixto a la leña Pierna', cantidad: 3, factor: 1, platos: 3 }]
    };
    const out = atribuirVentas(movimientos, [venta], { 'pierna-lena': semillaCocido('pierna-lena') }).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual([
        'pierna-lena|cocido:1',
        'pierna-lena|crudo:1',
        'pierna-pollo|crudo:1'
    ]);
});

test('si el plato tiene cocido, la venta no toca la pierna de pollo', () => {
    const movimientos = [
        { rubro: 'pachamanca-pollo', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 13, fecha: '2026-11-04T12:00:00-05:00' },
        { rubro: 'pierna-lena', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 15, fecha: '2026-11-04T12:00:00-05:00' }
    ];
    const ventas = [
        {
            rubro: 'pachamanca-pollo',
            nombre: 'Pollo pachamanca pierna',
            cantidad: 1,
            fecha: '2026-11-04T18:00:00-05:00',
            detalle: [{ nombre: 'Pollo de pachamanca', cantidad: 1 }]
        },
        {
            rubro: 'pierna-lena',
            nombre: 'Pierna a la leña',
            cantidad: 2,
            fecha: '2026-11-04T18:10:00-05:00',
            detalle: [{ nombre: 'Mixto a la leña Pierna', cantidad: 2 }]
        }
    ];
    const out = atribuirVentas(movimientos, ventas, {
        'pachamanca-pollo': semillaCocido('pachamanca-pollo'),
        'pierna-lena': semillaCocido('pierna-lena')
    }).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual([
        'pachamanca-pollo|cocido:1',
        'pierna-lena|cocido:2'
    ]);
});

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
        'pachamanca-chancho', 'pachamanca-res', 'pachamanca-cordero', 'carnero'
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

test('el seco de carnero gasta su cocido, su crudo y al final el Carnero Crudo (cocido y crudo)', () => {
    const movimientos = [
        { rubro: 'seco-cordero', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 1, fecha: '2026-11-10T09:00:00-05:00' },
        { rubro: 'seco-cordero', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 1, fecha: '2026-11-10T09:00:00-05:00' },
        { rubro: 'carnero', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 1, fecha: '2026-11-10T09:00:00-05:00' },
        { rubro: 'carnero', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 5, fecha: '2026-11-10T09:00:00-05:00' }
    ];
    const venta = { rubro: 'seco-cordero', nombre: 'Seco de carnero', cantidad: 4, fecha: '2026-11-10T13:00:00-05:00', detalle: [] };
    const out = atribuirVentas(movimientos, [venta], { 'seco-cordero': semillaCocido('seco-cordero') }).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual([
        'seco-cordero|cocido:1',
        'seco-cordero|crudo:1',
        'carnero|cocido:1',
        'carnero|crudo:1'
    ]);
});

test('el sabor Pollo de pachamanca gasta primero los cocidos de pierna y de pecho pachamanca', () => {
    const movimientos = [
        { rubro: 'pachamanca-pollo', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 1, fecha: '2026-11-10T09:00:00-05:00' },
        { rubro: 'pachamanca-pollo-pecho', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 2, fecha: '2026-11-10T09:00:00-05:00' },
        { rubro: 'pierna-pollo', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 5, fecha: '2026-11-10T09:00:00-05:00' }
    ];
    const venta = { rubro: 'pachamanca-pollo', nombre: 'Pollo de pachamanca', cantidad: 4, fecha: '2026-11-10T13:00:00-05:00', detalle: [] };
    const out = atribuirVentas(movimientos, [venta], {}).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual([
        'pachamanca-pollo|cocido:1',
        'pachamanca-pollo-pecho|cocido:2',
        'pierna-pollo|crudo:1'
    ]);
});

test('el cocido agregado antes de la venta se gasta primero (pecho de pato)', () => {
    const movimientos = [
        { rubro: 'pechuga-pato', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 4, fecha: '2026-11-10T08:00:00-05:00' },
        { rubro: 'pechuga-pato', tipoProducto: 'crudo', clase: 'ingreso', cantidad: -2, fecha: '2026-11-10T09:30:00-05:00' },
        { rubro: 'pechuga-pato', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 2, fecha: '2026-11-10T09:30:00-05:00' }
    ];
    const venta = { rubro: 'pechuga-pato', nombre: 'Arroz con pato', cantidad: 1, fecha: '2026-11-10T10:00:00-05:00', detalle: [] };
    const out = atribuirVentas(movimientos, [venta], { 'pechuga-pato': semillaCocido('pechuga-pato') }).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual(['pechuga-pato|cocido:1']);
});
