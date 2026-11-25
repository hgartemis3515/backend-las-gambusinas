const { armarLibro } = require('../src/utils/inventarioLibro');
const { boundsDiaOperativo } = require('../src/utils/diaOperativoRestaurante');
const { repartirDetalle, registrosDeVenta, perfilRubro } = require('../src/utils/inventarioCascadaVenta');

const hora = (ymd, h) => `${ymd}T${h}:00-05:00`;
const mov = (rubro, clase, cantidad, fecha, motivo, tipoProducto = 'crudo') => ({
    rubro, clase, cantidad, fecha, tipoProducto, motivo: motivo || (clase === 'ingreso' ? 'Ingreso crudo' : clase)
});
const venta = (rubro, cantidad, fecha, nombre) => ({ rubro, cantidad, fecha, nombre: nombre || rubro, motivo: 'Venta (reportes)', detalle: [] });

function dia(ymd, movimientos, ventas, extra) {
    const b = boundsDiaOperativo(ymd);
    return armarLibro({ movimientos, ventas: ventas || [], desde: b.inicio, hasta: b.fin, ...(extra || {}) });
}

function fila(libro, rubro, tipo = 'crudo') {
    return libro.filas.find((f) => f.rubro === rubro && f.tipoProducto === tipo);
}

test('Sandwich arrastra el stock al cocido y descuenta ahí las comandas y ventas manuales', () => {
    const rubro = 'sandwiches';
    const movs = [
        mov(rubro, 'inventario', 0, hora('2026-11-10', '09:00'), 'Puesta en cero'),
        mov(rubro, 'inventario', 0, hora('2026-11-10', '09:00'), 'Puesta en cero', 'cocido'),
        mov(rubro, 'ingreso', 6, hora('2026-11-10', '10:00')),
        mov(rubro, 'ingreso', 4, hora('2026-11-10', '10:01'), 'Ingreso cocido', 'cocido'),
        { ...mov(rubro, 'ingreso', 2, hora('2026-11-10', '11:00'), 'Pasa de crudo Sandwich', 'cocido'), paseTipo: true },
        mov(rubro, 'ingreso', 5, hora('2026-11-11', '10:00'), 'Ingreso independiente cocido', 'cocido'),
        mov(rubro, 'egreso', 2, hora('2026-11-11', '14:00'), 'Venta manual', 'cocido')
    ];
    const libro = dia('2026-11-11', movs, [venta(rubro, 3, hora('2026-11-11', '13:00'))], {
        opciones: { [rubro]: { tieneCocido: true, reservaClave: 'pechuga-pollo' } }
    });
    expect(fila(libro, rubro)).toMatchObject({ saldoInicial: 0, ingresoBruto: 0, venta: 0, queda: 0 });
    expect(fila(libro, rubro, 'cocido')).toMatchObject({ saldoInicial: 10, ingresoBruto: 5, venta: 3, egreso: 2, queda: 10 });
    expect(libro.ventas).toEqual([expect.objectContaining({ rubro, tipoProducto: 'cocido', cantidad: 3 })]);
});

test('el saldo anterior de hoy es lo que quedó ayer', () => {
    const movs = [mov('bisteck', 'ingreso', 10, hora('2026-11-10', '10:00'))];
    const ventas = [venta('bisteck', 3, hora('2026-11-10', '13:00'))];
    const ayer = fila(dia('2026-11-10', movs, ventas), 'bisteck');
    const hoy = fila(dia('2026-11-11', movs, ventas), 'bisteck');
    expect(ayer).toMatchObject({ saldoInicial: 0, ingresoBruto: 10, total: 10, venta: 3, queda: 7 });
    expect(hoy).toMatchObject({ saldoInicial: 7, cierreAnterior: 7, ajusteApertura: 0, queda: 7 });
});

test('un faltante no se arrastra aunque hayan pasado varios días', () => {
    // Antes solo se miraba un día atrás: el 12 abría con 10, pero el 13 volvía a perder el faltante viejo.
    const movs = [
        mov('delicias', 'ingreso', 5, hora('2026-11-10', '10:00')),
        mov('delicias', 'ingreso', 10, hora('2026-11-12', '10:00'))
    ];
    const ventas = [venta('delicias', 8, hora('2026-11-10', '13:00')), venta('delicias', 3, hora('2026-11-13', '13:00'))];
    expect(fila(dia('2026-11-10', movs, ventas), 'delicias')).toMatchObject({ queda: 0, sinTope: -3 });
    expect(fila(dia('2026-11-11', movs, ventas), 'delicias')).toMatchObject({ saldoInicial: 0, queda: 0 });
    expect(fila(dia('2026-11-12', movs, ventas), 'delicias')).toMatchObject({ saldoInicial: 0, total: 10, queda: 10 });
    expect(fila(dia('2026-11-13', movs, ventas), 'delicias')).toMatchObject({ saldoInicial: 10, venta: 3, queda: 7 });
    expect(fila(dia('2026-11-14', movs, ventas), 'delicias')).toMatchObject({ saldoInicial: 7, queda: 7 });
});

test('ingreso total es saldo anterior más ingreso; la corrección solo mueve Queda', () => {
    const movs = [
        mov('lomo-fino', 'ingreso', 4, hora('2026-11-10', '10:00')),
        mov('lomo-fino', 'ingreso', 6, hora('2026-11-11', '10:00')),
        mov('lomo-fino', 'regulacion', -2, hora('2026-11-11', '12:00'), 'Ajuste de stock')
    ];
    const f = fila(dia('2026-11-11', movs), 'lomo-fino');
    expect(f).toMatchObject({ saldoInicial: 4, ingresoBruto: 6, total: 10, regulacion: -2, queda: 8 });
});

test('después de un conteo, lo que se vende sigue restando', () => {
    const movs = [
        mov('cuy', 'ingreso', 20, hora('2026-11-10', '09:00')),
        mov('cuy', 'inventario', 12, hora('2026-11-10', '15:00'), 'Conteo crudo')
    ];
    const ventas = [venta('cuy', 2, hora('2026-11-10', '12:00')), venta('cuy', 3, hora('2026-11-10', '18:00'))];
    const f = fila(dia('2026-11-10', movs, ventas), 'cuy');
    expect(f).toMatchObject({ conteo: 12, tieneConteo: true, difConteo: -6, ajuste: -6, venta: 5, queda: 9 });
    expect(fila(dia('2026-11-11', movs, ventas), 'cuy').saldoInicial).toBe(9);
});

test('una puesta en cero deja el stock en 0 y no se ve como conteo', () => {
    const movs = [
        mov('yuca', 'ingreso', 9, hora('2026-11-10', '09:00')),
        mov('yuca', 'inventario', 0, hora('2026-11-10', '20:00'), 'Puesta en cero')
    ];
    expect(fila(dia('2026-11-10', movs), 'yuca')).toMatchObject({ queda: 0, tieneConteo: false, conteo: null });
});

test('la fórmula de cada fila llega exactamente a Queda', () => {
    const movs = [
        mov('pechuga-pollo', 'ingreso', 30, hora('2026-11-10', '09:00')),
        mov('pechuga-pollo', 'ingreso', -10, hora('2026-11-10', '10:00'), 'Pasa a Filete de pollo'),
        mov('filete', 'ingreso', 10, hora('2026-11-10', '10:00'), 'Sale de Pecho de Pollo'),
        mov('pechuga-pollo', 'egreso', 2, hora('2026-11-10', '11:00'), 'Venta manual'),
        mov('pechuga-pollo', 'regulacion', 1, hora('2026-11-10', '12:00'), 'Ajuste de stock')
    ];
    const f = fila(dia('2026-11-10', movs, [venta('filete', 4, hora('2026-11-10', '13:00'))]), 'pechuga-pollo');
    expect(f).toMatchObject({ ingresoBruto: 30, transformacion: 10, egreso: 2, regulacion: 1, queda: 19 });
    expect(f.saldoInicial + f.ingresoBruto - f.egreso - f.venta + f.cubierta - f.transformacion + f.regulacion + f.ajuste).toBe(f.sinTope);
});

test('la descarga a personal, beata, evento y rio lindo no entra al ingreso', () => {
    const ymd = '2026-11-24';
    const movs = [
        mov('octavo-pollo', 'ingreso', 10, hora(ymd, '08:00'), 'Ingreso inicial · pecho'),
        mov('octavo-pollo', 'ingreso', 4, hora(ymd, '08:30'), 'Ingreso independiente crudo · pecho'),
        mov('octavo-pollo', 'ingreso', 26, hora(ymd, '09:00'), 'Ingreso independiente crudo · Sector Personal · pecho'),
        mov('octavo-pollo', 'regulacion', -26, hora(ymd, '09:00'), 'Separado · Personal · pecho'),
        mov('octavo-pollo', 'ingreso', 20, hora(ymd, '10:00'), 'Ingreso independiente crudo · Sector Beata · pierna'),
        mov('octavo-pollo', 'regulacion', -20, hora(ymd, '10:00'), 'Separado · Beata · pierna'),
        mov('octavo-pollo', 'ingreso', 30, hora(ymd, '11:00'), 'Ingreso independiente crudo · Sector Evento · pecho'),
        mov('octavo-pollo', 'regulacion', -30, hora(ymd, '11:00'), 'Separado · Evento · pecho'),
        mov('octavo-pollo', 'ingreso', 50, hora(ymd, '12:00'), 'Ingreso independiente crudo · Sector Rio Lindo · pierna'),
        mov('octavo-pollo', 'regulacion', -50, hora(ymd, '12:00'), 'Separado · Rio Lindo · pierna')
    ];
    const f = fila(dia(ymd, movs), 'octavo-pollo');
    expect(f).toMatchObject({ ingresoBruto: 14, regulacion: 0, queda: 14, sinTope: 14 });
    expect(f.saldoInicial + f.ingresoBruto - f.egreso - f.venta + f.cubierta - f.transformacion + f.regulacion + f.ajuste).toBe(f.sinTope);
});

test('en un rango de varios días la fórmula también cierra, con el faltante como ajuste', () => {
    const movs = [mov('trucha', 'ingreso', 2, hora('2026-11-10', '09:00')), mov('trucha', 'ingreso', 5, hora('2026-11-11', '09:00'))];
    const ventas = [venta('trucha', 4, hora('2026-11-10', '12:00'))];
    const libro = armarLibro({
        movimientos: movs,
        ventas,
        desde: boundsDiaOperativo('2026-11-10').inicio,
        hasta: boundsDiaOperativo('2026-11-11').fin
    });
    const f = fila(libro, 'trucha');
    expect(f).toMatchObject({ saldoInicial: 0, ingresoBruto: 7, venta: 4, ajuste: 2, queda: 5 });
    expect(f.saldoInicial + f.ingresoBruto - f.venta + f.ajuste).toBe(f.queda);
});

test('un ajuste de apertura se ve en el saldo anterior y dice cuánto quedó ayer', () => {
    const movs = [
        mov('helados', 'ingreso', 8, hora('2026-11-10', '09:00')),
        mov('helados', 'ingreso', -3, hora('2026-11-11', '10:00'), 'Ajuste apertura')
    ];
    expect(fila(dia('2026-11-11', movs), 'helados')).toMatchObject({ cierreAnterior: 8, ajusteApertura: -3, saldoInicial: 5, queda: 5 });
});

test('un «Saldo anterior» antiguo que tapaba un negativo no crea stock', () => {
    const movs = [
        mov('hotdog', 'ingreso', 2, hora('2026-11-10', '09:00')),
        mov('hotdog', 'ingreso', 6, hora('2026-11-12', '03:59'), 'Saldo anterior')
    ];
    const ventas = [venta('hotdog', 8, hora('2026-11-10', '12:00'))];
    expect(fila(dia('2026-11-11', movs, ventas), 'hotdog').queda).toBe(0);
    expect(fila(dia('2026-11-12', movs, ventas), 'hotdog')).toMatchObject({ saldoInicial: 0, queda: 0 });
});

test('un ajuste de apertura nuevo sí suma aunque antes haya faltado stock', () => {
    const movs = [
        mov('hotdog', 'ingreso', 1, hora('2026-11-10', '09:00')),
        mov('hotdog', 'ingreso', 4, hora('2026-11-12', '04:00'), 'Ajuste apertura')
    ];
    const ventas = [venta('hotdog', 3, hora('2026-11-10', '12:00'))];
    expect(fila(dia('2026-11-12', movs, ventas), 'hotdog')).toMatchObject({ saldoInicial: 4, ajusteApertura: 4, queda: 4 });
});

test('un producto sin cocido tiene un solo stock aunque lleguen movimientos de cocido', () => {
    const movs = [
        mov('chicharron-chancho', 'ingreso', 5, hora('2026-11-10', '09:00')),
        mov('chicharron-chancho', 'ingreso', 2, hora('2026-11-10', '10:00'), 'Ingreso cocido', 'cocido')
    ];
    expect(perfilRubro('chicharron-chancho')).toEqual({ tieneCocido: false, soloCocido: false });
    const libro = dia('2026-11-10', movs, [venta('chicharron-chancho', 1, hora('2026-11-10', '12:00'))]);
    expect(fila(libro, 'chicharron-chancho', 'crudo')).toMatchObject({ ingresoBruto: 7, venta: 1, queda: 6 });
    expect(fila(libro, 'chicharron-chancho', 'cocido')).toMatchObject({ ingresoBruto: 0, queda: 0 });
});

test('la venta usa el cocido y lo que falta sale del crudo, sin repetir el plato', () => {
    const op = { pollada: { tieneCocido: true, reservaClave: '' } };
    const movs = [
        mov('pollada', 'ingreso', 1, hora('2026-11-10', '09:00'), 'Ingreso cocido', 'cocido'),
        mov('pollada', 'ingreso', 5, hora('2026-11-10', '09:00'))
    ];
    const v = {
        ...venta('pollada', 2, hora('2026-11-10', '12:00'), 'Pollada'),
        detalle: [{ nombre: 'Pollada', cantidad: 2, platos: 2, factor: 1, comanda: 'Comanda 42', comandaId: 'c42' }]
    };
    const libro = dia('2026-11-10', movs, [v], { opciones: op });
    expect(fila(libro, 'pollada', 'cocido')).toMatchObject({ venta: 1, queda: 0 });
    expect(fila(libro, 'pollada', 'crudo')).toMatchObject({ venta: 1, queda: 4 });
    expect(libro.ventas.map((x) => x.detalle.reduce((a, d) => a + d.platos, 0))).toEqual([1, 1]);
});

test('una venta con dos platos partida en dos no repite el primero', () => {
    const detalle = [
        { nombre: 'Plato A', cantidad: 1, platos: 1, factor: 1 },
        { nombre: 'Plato B', cantidad: 1, platos: 1, factor: 1 }
    ];
    const [uno, dos] = repartirDetalle(detalle, [1, 1]);
    expect(uno.map((d) => d.nombre)).toEqual(['Plato A']);
    expect(dos.map((d) => d.nombre)).toEqual(['Plato B']);
    const recs = registrosDeVenta(
        { rubro: 'x', nombre: 'x', cantidad: 2, fecha: hora('2026-11-10', '12:00'), detalle },
        { tieneCocido: true },
        [{ rubro: 'x', tipo: 'cocido', cantidad: 1 }, { rubro: 'x', tipo: 'crudo', cantidad: 1 }]
    );
    expect(recs.map((r) => r.detalle[0].nombre)).toEqual(['Plato A', 'Plato B']);
});

test('filete de la carta y filete junior restan el filete crudo', () => {
    const movs = [mov('filete', 'ingreso', 10, hora('2026-11-10', '09:00'))];
    const ventas = [
        venta('filete-pollo', 2, hora('2026-11-10', '12:00'), 'Filete de pollo'),
        venta('filete-junior', 0.5, hora('2026-11-10', '12:30'), 'Filete junior')
    ];
    expect(fila(dia('2026-11-10', movs, ventas), 'filete')).toMatchObject({ queda: 7.5 });
});

test('la alerta usa lo que queda de verdad', () => {
    const movs = [mov('cuy', 'ingreso', 6, hora('2026-11-10', '09:00'))];
    const b = boundsDiaOperativo('2026-11-10');
    const libro = armarLibro({
        movimientos: movs,
        ventas: [venta('cuy', 4, hora('2026-11-10', '12:00'))],
        umbrales: { cuy: { crudo: 2, cocido: 0 } },
        desde: b.fin,
        hasta: b.fin
    });
    expect(fila(libro, 'cuy')).toMatchObject({ queda: 2, umbral: 2, critico: true });
});

test('el kardex de un día pasado no cambia con lo que pasó después', () => {
    const movs = [mov('cuy', 'ingreso', 6, hora('2026-11-10', '09:00')), mov('cuy', 'ingreso', 50, hora('2026-11-12', '09:00'))];
    expect(fila(dia('2026-11-10', movs), 'cuy').queda).toBe(6);
});

describe('cortes del octavo de pollo', () => {
    const marcas = [
        mov('octavo-pollo', 'ingreso', 30, hora('2026-11-10', '10:00'), 'Viene de Pecho de Pollo · pecho'),
        mov('octavo-pollo', 'ingreso', 100, hora('2026-11-10', '10:01'), 'Viene de Pierna de Pollo · pierna'),
        mov('octavo-pollo', 'egreso', 40, hora('2026-11-10', '12:00'), 'Venta manual · pierna')
    ];

    test('el saldo anterior de cada corte es lo que quedó ayer', () => {
        const ayer = fila(dia('2026-11-10', marcas), 'octavo-pollo');
        expect(ayer.cortes).toEqual({ inicial: { pierna: 0, pecho: 0 }, queda: { pierna: 60, pecho: 30 } });
        const hoy = fila(dia('2026-11-11', marcas), 'octavo-pollo');
        expect(hoy.saldoInicial).toBe(90);
        expect(hoy.cortes).toEqual({ inicial: { pierna: 60, pecho: 30 }, queda: { pierna: 60, pecho: 30 } });
    });

    test('la nota de reparto no duplica los cortes ni cambia el saldo', () => {
        const notas = [
            mov('octavo-pollo', 'ingreso', 30, hora('2026-11-11', '04:00'), 'Saldo anterior · pecho'),
            mov('octavo-pollo', 'ingreso', 60, hora('2026-11-11', '04:00'), 'Saldo anterior · pierna'),
            mov('octavo-pollo', 'ingreso', -90, hora('2026-11-11', '04:00'), 'Saldo anterior · sin separar')
        ];
        const hoy = fila(dia('2026-11-11', marcas.concat(notas)), 'octavo-pollo');
        expect(hoy).toMatchObject({ saldoInicial: 90, ajusteApertura: 0, queda: 90 });
        expect(hoy.cortes.inicial).toEqual({ pierna: 60, pecho: 30 });
    });

    test('la nota de reparto no se pierde aunque haya un faltante antiguo', () => {
        const movs = [
            mov('octavo-pollo', 'egreso', 5, hora('2026-11-09', '12:00'), 'Venta manual'),
            ...marcas,
            mov('octavo-pollo', 'ingreso', 30, hora('2026-11-11', '04:00'), 'Saldo anterior · pecho'),
            mov('octavo-pollo', 'ingreso', 60, hora('2026-11-11', '04:00'), 'Saldo anterior · pierna'),
            mov('octavo-pollo', 'ingreso', -90, hora('2026-11-11', '04:00'), 'Saldo anterior · sin separar')
        ];
        expect(fila(dia('2026-11-11', movs), 'octavo-pollo').queda).toBe(90);
    });

    test('los cortes no superan lo que de verdad quedó al cerrar', () => {
        const hoy = fila(dia('2026-11-11', marcas, [venta('octavo-pollo', 45, hora('2026-11-10', '13:00'))]), 'octavo-pollo');
        expect(hoy.saldoInicial).toBe(45);
        expect(hoy.cortes.inicial).toEqual({ pierna: 30, pecho: 15 });
    });

    test('solo el octavo lleva cortes', () => {
        expect(fila(dia('2026-11-11', marcas), 'bisteck').cortes).toBeUndefined();
    });
});
