const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { armarLibro } = require('../src/utils/inventarioLibro');
const { boundsDiaOperativo } = require('../src/utils/diaOperativoRestaurante');
const html = fs.readFileSync(path.join(__dirname, '../public/inventario.html'), 'utf8');
const code = html.slice(html.indexOf('function inventarioApp()'), html.lastIndexOf('</script>'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const mov = (rubro, cantidad, fecha, tipoProducto = 'crudo', motivo = 'Ingreso inicial') => ({ rubro, cantidad, fecha, tipoProducto, motivo, clase: 'ingreso' });
function escenario(movimientos = [], ventas = [], dia = '2026-11-18') {
    const storage = { getItem: () => null };
    const factory = vm.runInNewContext('(' + code.trim() + ')', { window: {}, localStorage: storage, sessionStorage: storage, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0 });
    const app = factory();
    app.$nextTick = (f) => f && f();
    app.restaurarEjemploDespiece(true); app.vaciarNumeros(); app.aplicarOpcionesCocido([]);
    app.rangoVista = () => ({ desde: dia, hasta: dia });
    app.fechaHoy = () => dia;
    app.filasTransformacionDe = () => [];
    app.pulseRowTotal = jest.fn(); app.anotarHistorial = jest.fn();
    const guardados = plain(movimientos);
    const recargar = () => {
        const b = boundsDiaOperativo(dia);
        const libro = armarLibro({ movimientos: guardados, ventas, desde: b.inicio, hasta: b.fin });
        app.movimientosPeriodo = guardados.filter((m) => new Date(m.fecha) >= b.inicio && new Date(m.fecha) <= b.fin);
        app.movimientosTurno = app.movimientosPeriodo.slice();
        app.aplicarKardex(libro.filas, app.movimientosPeriodo, libro.ventas);
        return libro;
    };
    app.paso = jest.fn(async (rubro, tipoProducto, cantidad, motivo, clase, nombre, fecha) => {
        guardados.push({ rubro, tipoProducto, cantidad, motivo, clase, nombre, fecha });
    });
    app.cargarKardex = jest.fn(async () => recargar());
    recargar();
    return { app, guardados, recargar };
}
const ayer = '2026-11-17T12:00:00-05:00';
const hoy = '2026-11-18T12:00:00-05:00';
const apertura = '2026-11-18T04:00:00-05:00';

test.each([false, true])('lapiz desde tabla=%s establece saldo anterior y total sin crear ingresos del periodo', async (tabla) => {
    const { app, guardados, recargar } = escenario([mov('filete', 127, ayer), mov('filete', 1, hoy, 'crudo', 'Ingreso independiente crudo'), mov('pechuga-pollo', 40, ayer)]);
    const row = app.filaReal('filete');
    const otros = plain(app.rows.filter((r) => r.id !== 'filete'));
    if (tabla) {
        app.abrirEditarStockFila(row);
        app.cambiarModoEditarStock('stock');
    } else app.abrirEditarStock('filete');
    expect(app.editarStock.crudo).toBe(128);
    app.editarStock.crudo = 100;
    expect(app.redondear3(app.stockEditarNuevo() - app.stockEditarAntes())).toBe(-28);
    expect(await app.guardarModalStock()).toBe(true);
    expect(row.saldoAnterior).toBe(99);
    expect(row.ingreso).toBe(1);
    expect(app.calcIngresoTotal(row)).toBe(100);
    expect(row.correccion).toBe(0);
    expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(1);
    expect(plain(app.rows.filter((r) => r.id !== 'filete'))).toEqual(otros);
    expect(guardados[3]).toMatchObject({ motivo: 'Ajuste apertura · Editar stock', fecha: apertura, cantidad: -28 });
    recargar();
    expect(row.saldoAnterior).toBe(99);
    expect(app.stockCuadro('filete', 'crudo')).toBe(100);
});

test('el lápiz de Inventario Tabla abre en Saldo anterior; el de Transformar en Stock restante', () => {
    const { app } = escenario([mov('filete', 20, ayer), mov('filete', 5, hoy), mov('pechuga-pollo', 40, ayer)]);
    app.abrirEditarStockFila(app.filaReal('filete'));
    expect(app.editarStock.modo).toBe('apertura');
    expect(app.editarStock.crudo).toBe(20);
    app.abrirEditarStockFila(app.filaReal('pechuga'));
    expect(app.editarStock.modo).toBe('apertura');
    app.abrirEditarStockFila(app.filaReal('octavo_pollo'));
    expect(app.editarStock).toMatchObject({ octavo: true, modo: 'apertura' });
    app.abrirEditarStock('filete');
    expect(app.editarStock.modo).toBeUndefined();
});

test.each([false, true])('edita directamente el saldo anterior desde tabla=%s con ingresos y ventas', async (tabla) => {
    const ventas = [{ rubro: 'filete', cantidad: 3, fecha: hoy, tipoProducto: 'crudo' }];
    const { app, recargar } = escenario([mov('filete', 20, ayer), mov('filete', 5, hoy)], ventas);
    if (tabla) app.abrirEditarStockFila(app.filaReal('filete')); else app.abrirEditarStock('filete');
    app.cambiarModoEditarStock('apertura');
    expect(app.editarStock.crudo).toBe(20);
    app.editarStock.crudo = 12;
    expect(await app.guardarModalStock()).toBe(true);
    recargar();
    expect(app.filaReal('filete')).toMatchObject({ saldoAnterior: 12, ingreso: 5, venta: 3 });
    expect(app.stockCuadro('filete', 'crudo')).toBe(14);
});

test('editar saldo anterior de octavos conserva el ingreso de pecho del día', async () => {
    const { app, recargar } = escenario([
        mov('octavo-pollo', 30, ayer, 'crudo', 'Ingreso · pecho'),
        mov('octavo-pollo', 100, ayer, 'crudo', 'Ingreso · pierna'),
        mov('octavo-pollo', 2, hoy, 'crudo', 'Ingreso · pecho')
    ]);
    app.abrirEditarOctavo();
    app.cambiarModoEditarStock('apertura');
    expect(app.editarStock).toMatchObject({ pecho: 30, pierna: 100 });
    app.editarStock.pecho = 60;
    expect(await app.guardarModalStock()).toBe(true);
    recargar();
    expect(app.filaReal('octavo_pollo')).toMatchObject({ saldoAnterior: 160, ingreso: 2 });
    expect(app.octavosStockCorte('pechugas')).toBe(62);
    expect(app.octavosStockCorte('piernas')).toBe(100);
});

test('ventas y transformaciones conservan sus cantidades al cambiar la apertura', async () => {
    const transf = [mov('filete', -4, hoy, 'crudo', 'Pasa a milanesa'), mov('milanesa', 4, hoy, 'crudo', 'Viene de filete')];
    const ventas = [{ rubro: 'filete', cantidad: 3, fecha: hoy, tipoProducto: 'crudo' }];
    const { app, recargar } = escenario([mov('filete', 20, ayer), mov('filete', 5, hoy), ...transf], ventas);
    const row = app.filaReal('filete');
    app.abrirEditarStock('filete');
    expect(app.editarStock.crudo).toBe(18);
    app.editarStock.crudo = 30;
    await app.guardarModalStock(); recargar();
    expect(row).toMatchObject({ saldoAnterior: 32, ingreso: 5, venta: 3, transformacion: 4, correccion: 0 });
    expect(app.calcIngresoTotal(row)).toBe(37);
    expect(app.stockCuadro('filete', 'crudo')).toBe(30);
});

test('subir bajar guardar igual y poner cero son ediciones absolutas', async () => {
    const { app } = escenario([mov('filete', 10, ayer), mov('filete', 2, hoy)]);
    for (const n of [30, 5, 0]) {
        app.abrirEditarStock('filete'); app.editarStock.crudo = n;
        await app.guardarModalStock();
        expect(app.stockCuadro('filete', 'crudo')).toBe(n);
        expect(app.filaReal('filete').ingreso).toBe(2);
        app.abrirEditarStock('filete'); const antes = app.paso.mock.calls.length;
        await app.guardarModalStock();
        expect(app.paso).toHaveBeenCalledTimes(antes);
    }
});

test('crudo y cocido se editan separados sin cocinar ni consumir otras filas', async () => {
    const { app } = escenario([mov('pollo-baby', 10, ayer), mov('pollo-baby', 4, ayer, 'cocido'), mov('pollo-baby', 2, hoy, 'cocido')]);
    app.abrirEditarStock('pollo_baby');
    expect(app.editarStock).toMatchObject({ crudo: 10, cocido: 6 });
    app.editarStock.crudo = 7; app.editarStock.cocido = 9;
    await app.guardarModalStock();
    expect(app.filaReal('pollo_baby')).toMatchObject({ saldoAnterior: 7, saldoAnteriorCocido: 7, ingresoCocido: 2, correccion: 0, correccionCocido: 0 });
    expect(app.stockCuadro('pollo_baby', 'crudo')).toBe(7);
    expect(app.stockCuadro('pollo_baby', 'cocido')).toBe(9);
});

test('solo cocido establece su apertura cocida', async () => {
    const { app } = escenario([mov('trozo-panceta', 5, ayer, 'cocido'), mov('trozo-panceta', 2, hoy, 'cocido')]);
    app.abrirEditarStock('trozo_panceta');
    expect(app.editarStock.cocido).toBe(7);
    app.editarStock.cocido = 12;
    await app.guardarModalStock();
    expect(app.filaReal('trozo_panceta')).toMatchObject({ saldoAnteriorCocido: 10, ingresoCocido: 2, saldoAnterior: 0 });
    expect(app.stockCuadro('trozo_panceta', 'cocido')).toBe(12);
    expect(app.stockCuadro('tira_panceta', 'cocido')).toBe(0);
});

test('platos por corte conservan apertura pecho y pierna al reabrir y repetir', async () => {
    const { app, recargar } = escenario([mov('pollo-olla', 3, apertura, 'crudo', 'Ajuste apertura · pecho'), mov('pollo-olla', 7, apertura, 'crudo', 'Ajuste apertura · pierna'), mov('pollo-olla', 2, hoy)]);
    app.abrirEditarStock('pollo_olla');
    expect(app.editarStock.lineas[0]).toMatchObject({ pecho: { crudo: 3 }, pierna: { crudo: 7 } });
    app.editarStock.lineas[0].pecho.crudo = 4; app.editarStock.lineas[0].pierna.crudo = 5;
    await app.guardarModalStock(); recargar();
    expect(app.filaReal('pollo_olla')).toMatchObject({ saldoAnterior: 9, ingreso: 2, correccion: 0 });
    app.abrirEditarStock('pollo_olla');
    expect(app.editarStock.lineas[0]).toMatchObject({ pecho: { crudo: 4 }, pierna: { crudo: 5 } });
    const escritos = app.paso.mock.calls.length; await app.guardarModalStock();
    expect(app.paso).toHaveBeenCalledTimes(escritos);
});

test('octavo edita apertura de pecho y pierna sin pasar piezas', async () => {
    const { app, recargar } = escenario([mov('octavo-pollo', 30, ayer, 'crudo', 'Ingreso · pecho'), mov('octavo-pollo', 100, ayer, 'crudo', 'Ingreso · pierna'), mov('octavo-pollo', 2, hoy, 'crudo', 'Ingreso · pecho')]);
    app.abrirEditarOctavo();
    expect(app.editarStock).toMatchObject({ pecho: 32, pierna: 100 });
    app.editarStock.pecho = 60; app.editarStock.pierna = 100;
    await app.guardarModalStock(); recargar();
    expect(app.octavosStockCorte('pechugas')).toBe(60);
    expect(app.octavosStockCorte('piernas')).toBe(100);
    expect(app.stockCuadro('octavo_pollo', 'crudo')).toBe(160);
    expect(app.filaReal('octavo_pollo').ingreso).toBe(2);
    app.abrirEditarOctavo();
    expect(app.editarStock).toMatchObject({ pecho: 60, pierna: 100 });
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(0);
});

test('escribir 60 en pecho de octavo queda en 60 y no se parte ni se suma otra vez', async () => {
    const nota = escenario([mov('octavo-pollo', 30, apertura, 'crudo', 'Saldo anterior · pecho')]);
    nota.app.abrirEditarOctavo();
    expect(nota.app.editarStock.pecho).toBe(30);
    nota.app.editarStock.pecho = 60;
    expect(await nota.app.guardarModalStock()).toBe(true);
    nota.recargar();
    expect(nota.app.octavosStockCorte('pechugas')).toBe(60);
    expect(nota.app.stockCuadro('octavo_pollo', 'crudo')).toBe(60);
    nota.app.abrirEditarOctavo();
    expect(nota.app.editarStock.pecho).toBe(60);

    const junto = escenario([
        mov('octavo-pollo', 30, apertura, 'crudo', 'Saldo anterior · pecho'),
        Object.assign(mov('octavo-pollo', 30, hoy, 'crudo', 'Ajuste de stock · pecho'), { clase: 'regulacion' })
    ]);
    junto.app.abrirEditarOctavo();
    expect(junto.app.editarStock.pecho).toBe(60);
    junto.app.editarStock.pecho = 60;
    expect(await junto.app.guardarModalStock()).toBe(true);
    junto.recargar();
    expect(junto.app.octavosStockCorte('pechugas')).toBe(60);
    expect(junto.app.stockCuadro('octavo_pollo', 'crudo')).toBe(60);
    expect(junto.app.calcIngresoTotal(junto.app.filaReal('octavo_pollo'))).toBe(60);
});

test('filete: el lapiz no vuelve a restar un ajuste que ya dejo el stock en 80.5', async () => {
    const { app, guardados, recargar } = escenario([
        mov('filete', 127, ayer),
        Object.assign(mov('filete', -46.5, hoy, 'crudo', 'Ajuste de stock'), { clase: 'regulacion' })
    ]);
    app.abrirEditarStock('filete');
    expect(app.editarStock.crudo).toBe(80.5);
    app.editarStock.crudo = 80.5;
    const antes = app.paso.mock.calls.length;
    expect(await app.guardarModalStock()).toBe(true);
    expect(app.paso).toHaveBeenCalledTimes(antes);
    recargar();
    expect(app.saldoRealColumna(app.filaReal('filete'))).toBe(80.5);
    expect(guardados.filter((m) => m.cantidad === -46.5)).toHaveLength(1);
});

test('grupo de tabla guarda apertura de padre y platos en el mismo modal', async () => {
    const { app } = escenario([mov('arroz', 4, ayer), mov('pollo-olla', 2, ayer)]);
    app.filasTransformacionDe = (r) => r.id === 'arroz' ? [app.filaReal('pollo_olla')] : [];
    app.abrirEditarStockFila(app.filaReal('arroz'));
    app.editarStock.lineas[0].crudo = 8;
    app.editarStock.lineas[1].pecho.crudo = 3; app.editarStock.lineas[1].pierna.crudo = 4;
    expect(await app.guardarModalStock()).toBe(true);
    expect(app.filaReal('arroz').saldoAnterior).toBe(8);
    expect(app.filaReal('pollo_olla').saldoAnterior).toBe(7);
});

test('validacion de todas las lineas impide una escritura parcial', async () => {
    const { app } = escenario();
    app.abrirEditarStock('pollo_olla');
    app.editarStock.lineas[0].pecho.crudo = 5; app.editarStock.lineas[0].pierna.crudo = -1;
    expect(await app.guardarModalStock()).toBe(false);
    expect(app.paso).not.toHaveBeenCalled(); expect(app.editarStock.abierto).toBe(true);
});

test('un error mantiene el modal abierto y permite reintentar', async () => {
    const { app } = escenario([mov('filete', 10, ayer)]);
    app.abrirEditarStock('filete'); app.editarStock.crudo = 12;
    app.paso.mockRejectedValueOnce(new Error('Sin conexion'));
    expect(await app.guardarModalStock()).toBe(false);
    expect(app.editarStock).toMatchObject({ abierto: true, guardando: false, error: 'Sin conexion' });
    expect(await app.guardarModalStock()).toBe(true);
    expect(app.filaReal('filete').saldoAnterior).toBe(12);
});

test('el ajuste historico se fecha al inicio del dia seleccionado incluso con rangoISO', async () => {
    const { app, guardados } = escenario([mov('filete', 10, '2026-11-15T12:00:00-05:00')], [], '2026-11-16');
    app.rangoVista = () => ({ desde: '2026-11-17T01:00:00.000Z', hasta: '2026-11-17T08:59:59.999Z' });
    app.abrirEditarStock('filete'); app.editarStock.crudo = 7;
    await app.guardarModalStock();
    expect(guardados[1].fecha).toBe('2026-11-16T04:00:00-05:00');
    expect(app.filaReal('filete').saldoAnterior).toBe(7);
});

test('texto largo conserva las marcas de corte y el limite del modelo', async () => {
    const { app, guardados } = escenario();
    app.abrirEditarStock('pollo_olla'); app.editarStock.lineas[0].pecho.crudo = 3; app.editarStock.lineas[0].pierna.crudo = 4;
    app.editarStock.motivo = 'Texto con pecho y pierna '.repeat(12);
    await app.guardarModalStock();
    expect(guardados.every((m) => m.motivo.length <= 200 && m.motivo.startsWith('Ajuste apertura'))).toBe(true);
    app.abrirEditarStock('pollo_olla');
    expect(app.editarStock.lineas[0]).toMatchObject({ pecho: { crudo: 3 }, pierna: { crudo: 4 } });
});
