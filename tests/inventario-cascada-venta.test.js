const {
    cadenaDe,
    repartirVenta,
    validarCocidoConfig,
    atribuirVentas,
    semillaCocido
} = require('../src/utils/inventarioCascadaVenta');
const { filasDeRubros } = require('../src/utils/inventarioRubros');

const saltado = { tieneCocido: true, reservaClave: 'pechuga-pollo' };

function vender(n, bases) {
    return repartirVenta(n, cadenaDe('salt-pollo', saltado), bases);
}

test('el mix de pecho solo gasta el cocido de pecho leña', () => {
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
        'pollo-lena|cocido:3'
    ]);
    expect(out.some((v) => v.rubro === 'pechuga-pollo')).toBe(false);
});

test('el 1/4 y el mix de pierna gastan solo el cocido de pierna leña', () => {
    const movimientos = [
        { rubro: 'pierna-lena', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 1, fecha: '2026-11-03T12:00:00-05:00' },
        { rubro: 'pierna-lena', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 4, fecha: '2026-11-03T12:00:00-05:00' },
        { rubro: 'pierna-pollo', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 5, fecha: '2026-11-03T12:00:00-05:00' }
    ];
    const venta = {
        rubro: 'pierna-lena',
        nombre: 'Pierna a la leña',
        cantidad: 3,
        fecha: '2026-11-03T18:00:00-05:00',
        detalle: [
            { nombre: '1/4 pollo a la leña', cantidad: 1, factor: 1, platos: 1 },
            { nombre: 'Mixto a la leña Pierna', cantidad: 2, factor: 1, platos: 2 }
        ]
    };
    const out = atribuirVentas(movimientos, [venta], { 'pierna-lena': semillaCocido('pierna-lena') });
    const stock = out.filter((v) => !v.sinSaldo);
    expect(stock.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual([
        'pierna-lena|cocido:3'
    ]);
    expect(stock.some((v) => v.rubro === 'pierna-pollo' || v.tipoProducto === 'crudo')).toBe(false);
    expect(out.some((v) => v.sinSaldo)).toBe(false);
    expect(semillaCocido('pierna-lena').reservaClave).toBe('');
    expect(cadenaDe('pierna-lena', { tieneCocido: true, reservaClave: 'pierna-pollo' })).toEqual([
        { rubro: 'pierna-lena', tipo: 'cocido' }
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
        'pollo-lena', 'pierna-lena', 'pollo-baby', 'pachamanca-pollo',
        'pachamanca-chancho', 'pachamanca-res', 'pachamanca-cordero', 'carnero'
    ].forEach((clave) => {
        expect(semillaCocido(clave).tieneCocido).toBe(true);
    });
    expect(semillaCocido('filete').tieneCocido).toBe(false);
    expect(semillaCocido('menu').tieneCocido).toBe(false);
    expect(semillaCocido('menu-pecho').tieneCocido).toBe(false);
    expect(semillaCocido('menu-pierna').tieneCocido).toBe(false);
    expect(semillaCocido('sandwiches')).toEqual({ tieneCocido: false, reservaClave: '' });
    expect(semillaCocido('arroz-pollo')).toEqual({ tieneCocido: false, soloCocido: true, reservaClave: '' });
    expect(validarCocidoConfig('arroz-pollo', { soloCocido: true })).toEqual({ valido: true, tieneCocido: false, soloCocido: true, reservaClave: '' });
    expect(validarCocidoConfig('caldo-pollo', { soloCocido: false })).toEqual({ valido: true, tieneCocido: true, soloCocido: false, reservaClave: '' });
    expect(validarCocidoConfig('pollo-olla', { soloCocido: 'false' })).toMatchObject({ valido: false });
    expect(validarCocidoConfig('panceta', { soloCocido: true })).toMatchObject({ valido: false });
});

test('la pieza de panceta solo gasta cocido', () => {
    const movimientos = [
        { rubro: 'trozo-panceta', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 5, fecha: '2026-11-10T09:00:00-05:00' },
        { rubro: 'trozo-panceta', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 2, fecha: '2026-11-10T09:00:00-05:00' }
    ];
    const venta = { rubro: 'trozo-panceta', nombre: 'Pieza de panceta', cantidad: 3, fecha: '2026-11-10T13:00:00-05:00', detalle: [] };
    const out = atribuirVentas(movimientos, [venta], { 'trozo-panceta': semillaCocido('trozo-panceta') }).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual([
        'trozo-panceta|cocido:3'
    ]);
    expect(cadenaDe('trozo-panceta', { tieneCocido: true, reservaClave: '' })).toEqual([
        { rubro: 'trozo-panceta', tipo: 'cocido' }
    ]);
});

test('el pollo baby con cocido activo solo gasta cocido', () => {
    const movimientos = [
        { rubro: 'pollo-baby', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 1, fecha: '2026-11-10T09:00:00-05:00' },
        { rubro: 'pollo-baby', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 2, fecha: '2026-11-10T09:00:00-05:00' }
    ];
    const venta = { rubro: 'pollo-baby', nombre: 'Pollo Baby', cantidad: 2, fecha: '2026-11-10T13:00:00-05:00', detalle: [] };
    const out = atribuirVentas(movimientos, [venta], { 'pollo-baby': semillaCocido('pollo-baby') }).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual([
        'pollo-baby|cocido:2'
    ]);
    expect(out.some((v) => v.tipoProducto === 'crudo')).toBe(false);
    expect(semillaCocido('pollo-baby').reservaClave).toBe('');
});

test('cerdo pachamanca con cocido activo no toca el crudo', () => {
    const movimientos = [
        { rubro: 'pachamanca-chancho', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 1, fecha: '2026-11-16T12:00:00-05:00' },
        { rubro: 'pachamanca-chancho', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 8, fecha: '2026-11-16T12:00:00-05:00' }
    ];
    const venta = { rubro: 'pachamanca-chancho', nombre: 'Cerdo pachamanca', cantidad: 3, fecha: '2026-11-16T18:00:00-05:00', detalle: [] };
    const out = atribuirVentas(movimientos, [venta], { 'pachamanca-chancho': semillaCocido('pachamanca-chancho') }).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual([
        'pachamanca-chancho|cocido:3'
    ]);
});

test('el pollo saltado resta primero el cocido', () => {
    const bases = { 'salt-pollo|cocido': 3, 'salt-pollo|crudo': 2, 'pechuga-pollo|crudo': 10 };
    expect(vender(2, bases)).toEqual([{ rubro: 'salt-pollo', tipo: 'cocido', cantidad: 2 }]);
    expect(bases['salt-pollo|cocido']).toBe(1);
});

test('con cocido activo el saltado no pasa al crudo ni a la pechuga', () => {
    const bases = { 'salt-pollo|cocido': 1, 'salt-pollo|crudo': 1, 'pechuga-pollo|crudo': 10 };
    expect(vender(4, bases)).toEqual([
        { rubro: 'salt-pollo', tipo: 'cocido', cantidad: 4 }
    ]);
    expect(bases['salt-pollo|cocido']).toBe(-3);
    expect(bases['salt-pollo|crudo']).toBe(1);
    expect(bases['pechuga-pollo|crudo']).toBe(10);
});

test('si el cocido activo no tiene saldo, el faltante queda en el cocido', () => {
    const bases = {};
    expect(vender(1, bases)).toEqual([{ rubro: 'salt-pollo', tipo: 'cocido', cantidad: 1 }]);
    expect(bases['salt-pollo|cocido']).toBe(-1);
    expect(bases['pechuga-pollo|crudo']).toBeUndefined();
});

test('arroz con pollo, olla y caldo solo restan su cocido', () => {
    const bases = { 'arroz-pollo|cocido': 10, 'arroz-pollo|crudo': 10, 'pollo-olla|cocido': 2, 'caldo-pollo|crudo': 3, 'pierna-pollo|crudo': 20 };
    expect(repartirVenta(4, cadenaDe('arroz-pollo', { tieneCocido: true }), bases)).toEqual([
        { rubro: 'arroz-pollo', tipo: 'cocido', cantidad: 4 }
    ]);
    expect(bases['arroz-pollo|cocido']).toBe(6);
    expect(bases['arroz-pollo|crudo']).toBe(10);
    expect(bases['pierna-pollo|crudo']).toBe(20);
    expect(repartirVenta(2, cadenaDe('pollo-olla', { tieneCocido: true }), bases)).toEqual([
        { rubro: 'pollo-olla', tipo: 'cocido', cantidad: 2 }
    ]);
    expect(repartirVenta(1, cadenaDe('caldo-pollo', { tieneCocido: false }), bases)).toEqual([
        { rubro: 'caldo-pollo', tipo: 'cocido', cantidad: 1 }
    ]);
    expect(bases['caldo-pollo|crudo']).toBe(3);
    const movimientos = [
        { rubro: 'arroz-pollo', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 10, fecha: '2026-11-17T08:00:00-05:00' }
    ];
    const venta = { rubro: 'arroz-pollo', nombre: 'Arroz con pollo', cantidad: 4, fecha: '2026-11-17T13:00:00-05:00', detalle: [] };
    const out = atribuirVentas(movimientos, [venta], { 'arroz-pollo': { tieneCocido: true, reservaClave: '' } }).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual(['arroz-pollo|cocido:4']);
});

test('panceta entera conserva el crudo, la tira permite cocción y la pieza usa cocido', () => {
    expect(validarCocidoConfig('panceta', { tieneCocido: true })).toEqual({ valido: true, tieneCocido: false, reservaClave: '' });
    expect(validarCocidoConfig('tira-panceta', { tieneCocido: false, reservaClave: 'filete' })).toEqual({ valido: true, tieneCocido: true, reservaClave: '' });
    expect(cadenaDe('panceta', { tieneCocido: true })).toEqual([{ rubro: 'panceta', tipo: 'crudo' }]);
    expect(cadenaDe('tira-panceta', { tieneCocido: true })).toEqual([{ rubro: 'tira-panceta', tipo: 'cocido' }]);
    expect(cadenaDe('trozo-panceta', { tieneCocido: true })).toEqual([{ rubro: 'trozo-panceta', tipo: 'cocido' }]);
    const movimientos = [
        { rubro: 'panceta', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 4, fecha: '2026-11-10T09:00:00-05:00' },
        { rubro: 'panceta', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 2, fecha: '2026-11-10T09:00:00-05:00' }
    ];
    const venta = { rubro: 'panceta', nombre: 'Panceta', cantidad: 1, fecha: '2026-11-10T13:00:00-05:00', detalle: [] };
    const out = atribuirVentas(movimientos, [venta], { panceta: { tieneCocido: true, reservaClave: '' } }).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual(['panceta|crudo:1']);
});

test('la materia no tiene cocido ni reserva', () => {
    expect(cadenaDe('filete', { tieneCocido: true, reservaClave: 'pechuga-pollo' })).toEqual([{ rubro: 'filete', tipo: 'crudo' }]);
    expect(validarCocidoConfig('filete', { tieneCocido: true })).toEqual({ valido: true, tieneCocido: false, reservaClave: '' });
    expect(validarCocidoConfig('pollada', { tieneCocido: true, reservaClave: 'pollada' }).valido).toBe(false);
});

test('la pollada gasta su cocido y el faltante solo su crudo, no la pierna', () => {
    const bases = { 'pollada|cocido': 1, 'pollada|crudo': 4, 'pierna-pollo|crudo': 5 };
    expect(repartirVenta(3, cadenaDe('pollada', semillaCocido('pollada')), bases)).toEqual([
        { rubro: 'pollada', tipo: 'cocido', cantidad: 1 },
        { rubro: 'pollada', tipo: 'crudo', cantidad: 2 }
    ]);
    expect(bases['pollada|cocido']).toBe(0);
    expect(bases['pollada|crudo']).toBe(2);
    expect(bases['pierna-pollo|crudo']).toBe(5);
});

test('con cocido activo la pollada igual baja a su crudo si el cocido no alcanza', () => {
    const movimientos = [
        { rubro: 'pollada', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 50, fecha: '2026-11-17T08:00:00-05:00' },
        { rubro: 'pierna-pollo', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 10, fecha: '2026-11-17T08:00:00-05:00' }
    ];
    const venta = { rubro: 'pollada', nombre: 'Pollada', cantidad: 32, fecha: '2026-11-17T13:00:00-05:00', detalle: [] };
    const out = atribuirVentas(movimientos, [venta], { pollada: { tieneCocido: true, reservaClave: '' } }).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual(['pollada|crudo:32']);
    expect(out.some((v) => v.rubro === 'pierna-pollo')).toBe(false);
});

test('sin cocido la pollada resta solo su crudo y no la pierna', () => {
    const detalle = [{ nombre: 'Pollada + papa fritas', cantidad: 2, comanda: 'Comanda 4' }];
    const out = atribuirVentas([], [{
        rubro: 'pollada',
        nombre: 'Pollada',
        cantidad: 2,
        fecha: '2026-10-31T12:00:00-05:00',
        detalle
    }]);
    const stock = out.filter((v) => !v.sinSaldo);
    expect(stock.map((v) => [v.rubro, v.tipoProducto, v.cantidad])).toEqual([
        ['pollada', 'crudo', 2]
    ]);
    expect(out.some((v) => v.rubro === 'pierna-pollo')).toBe(false);
    expect(stock[0].detalle).toEqual(detalle);
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
        ['salt-pollo', 'cocido', 1],
        ['salt-pollo', 'cocido', 3]
    ]);
    expect(stock.every((v) => v.usoNombre === 'Cocido')).toBe(true);
    expect(out.some((v) => v.sinSaldo || v.rubro === 'pechuga-pollo')).toBe(false);
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

test('el seco de carnero con cocido activo no toca su crudo ni el carnero', () => {
    const movimientos = [
        { rubro: 'seco-cordero', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 1, fecha: '2026-11-10T09:00:00-05:00' },
        { rubro: 'seco-cordero', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 1, fecha: '2026-11-10T09:00:00-05:00' },
        { rubro: 'carnero', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 1, fecha: '2026-11-10T09:00:00-05:00' },
        { rubro: 'carnero', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 5, fecha: '2026-11-10T09:00:00-05:00' }
    ];
    const venta = { rubro: 'seco-cordero', nombre: 'Seco de carnero', cantidad: 4, fecha: '2026-11-10T13:00:00-05:00', detalle: [] };
    const out = atribuirVentas(movimientos, [venta], { 'seco-cordero': semillaCocido('seco-cordero') }).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual([
        'seco-cordero|cocido:4'
    ]);
    expect(out.some((v) => v.rubro === 'carnero' || v.tipoProducto === 'crudo')).toBe(false);
});

test('el sabor Pollo de pachamanca solo gasta el cocido de su plato', () => {
    const movimientos = [
        { rubro: 'pachamanca-pollo', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 1, fecha: '2026-11-10T09:00:00-05:00' },
        { rubro: 'pachamanca-pollo-pecho', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 2, fecha: '2026-11-10T09:00:00-05:00' },
        { rubro: 'pierna-pollo', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 5, fecha: '2026-11-10T09:00:00-05:00' }
    ];
    const venta = { rubro: 'pachamanca-pollo', nombre: 'Pollo de pachamanca', cantidad: 4, fecha: '2026-11-10T13:00:00-05:00', detalle: [] };
    const out = atribuirVentas(movimientos, [venta], {}).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual([
        'pachamanca-pollo|cocido:4'
    ]);
    expect(out.some((v) => v.rubro === 'pierna-pollo' || v.rubro === 'pachamanca-pollo-pecho')).toBe(false);
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

test('el filete de trucha solo resta su crudo: 44 menos 1 queda 43', () => {
    const movimientos = [
        { rubro: 'filete-trucha', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 44, fecha: '2026-11-17T08:00:00-05:00' }
    ];
    const venta = { rubro: 'filete-trucha', nombre: 'Filete de trucha', cantidad: 1, fecha: '2026-11-17T13:00:00-05:00', detalle: [] };
    const out = atribuirVentas(movimientos, [venta], { 'filete-trucha': { tieneCocido: true, reservaClave: '' } }).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual(['filete-trucha|crudo:1']);
});

test('el cuy solo resta su crudo: 4 menos 0.5 queda 3.5', () => {
    const movimientos = [
        { rubro: 'cuy', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 4, fecha: '2026-11-17T08:00:00-05:00' }
    ];
    const venta = { rubro: 'cuy', nombre: '1/2 cuy', cantidad: 0.5, fecha: '2026-11-17T13:00:00-05:00', detalle: [] };
    const out = atribuirVentas(movimientos, [venta], { cuy: { tieneCocido: true, reservaClave: '' } }).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual(['cuy|crudo:0.5']);
});

test('arroz blanco y arroz verde son cocido y la venta resta ese stock', () => {
    expect(cadenaDe('arroz-blanco', {})).toEqual([{ rubro: 'arroz-blanco', tipo: 'cocido' }]);
    expect(cadenaDe('arroz-verde', { tieneCocido: false })).toEqual([{ rubro: 'arroz-verde', tipo: 'cocido' }]);
    const movimientos = [
        { rubro: 'arroz-blanco', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 16, fecha: '2026-11-17T15:00:00-05:00' },
        { rubro: 'arroz-verde', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 6, fecha: '2026-11-17T15:00:00-05:00' }
    ];
    const ventas = [
        { rubro: 'arroz-blanco', nombre: 'Arroz blanco', cantidad: 5, fecha: '2026-11-17T18:00:00-05:00', detalle: [] },
        { rubro: 'arroz-verde', nombre: 'Arroz verde + Pato', cantidad: 2, fecha: '2026-11-17T18:10:00-05:00', detalle: [] }
    ];
    const out = atribuirVentas(movimientos, ventas, {}).filter((v) => !v.sinSaldo);
    expect(out.map((v) => v.rubro + '|' + v.tipoProducto + ':' + v.cantidad)).toEqual([
        'arroz-blanco|cocido:5',
        'arroz-verde|cocido:2'
    ]);
    const filas = filasDeRubros(movimientos, new Date('2026-11-17T09:00:00.000Z'), new Date('2026-11-18T08:59:59.999Z'));
    const cocido = filas.find((f) => f.rubro === 'arroz-blanco' && f.tipoProducto === 'cocido');
    const crudo = filas.find((f) => f.rubro === 'arroz-blanco' && f.tipoProducto === 'crudo');
    expect(cocido.ingresos).toBe(16);
    expect(crudo.ingresos).toBe(0);
});
