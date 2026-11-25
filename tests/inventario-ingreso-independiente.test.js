const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { armarLibro } = require('../src/utils/inventarioLibro');
const { boundsDiaOperativo } = require('../src/utils/diaOperativoRestaurante');
const html = fs.readFileSync(path.join(__dirname, '../public/inventario.html'), 'utf8');
const code = html.slice(html.indexOf('function inventarioApp()'), html.lastIndexOf('</script>'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const fechaIngreso = '2026-11-18T12:00:00-05:00';
const input = (v) => ({ value: String(v), dataset: {}, style: { setProperty: jest.fn() } });
function escenario(iniciales = []) {
    const storage = { getItem: () => null };
    const crear = vm.runInNewContext('(' + code.trim() + ')', { window: {}, localStorage: storage, sessionStorage: storage, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0 });
    const app = crear();
    app.$nextTick = (fn) => fn && fn();
    app.restaurarEjemploDespiece(true); app.vaciarNumeros(); app.aplicarOpcionesCocido([]);
    app.pulseRowTotal = jest.fn(); app.productoBloqueado = () => false; app.activeTab = 'transformar';
    let dia = '2026-11-18';
    const ymdReal = app.ymdOperativo.bind(app);
    app.ymdOperativo = (f) => f ? ymdReal(f) : '2026-11-18'; app.fechaHoy = () => '2026-11-18';
    app.rangoVista = () => ({ desde: dia, hasta: dia }); app.rangoPeriodo = app.rangoVista; app.rangoPeriodoTransformar = app.rangoVista;
    app.fechaCierreVista = () => dia === '2026-11-18' ? fechaIngreso : app.diaOffset(dia, 1) + 'T03:59:00-05:00';
    const guardados = iniciales.map((m) => ({ clase: 'ingreso', fecha: '2026-11-18T10:00:00-05:00', tipoProducto: 'crudo', motivo: 'Ingreso inicial', ...m }));
    const recargar = (otroDia = dia) => {
        dia = otroDia;
        const b = boundsDiaOperativo(dia);
        const libro = armarLibro({ movimientos: guardados, ventas: [], desde: b.inicio, hasta: b.fin });
        app.movimientosPeriodo = plain(guardados.filter((m) => new Date(m.fecha) >= b.inicio && new Date(m.fecha) <= b.fin));
        app.movimientosTurno = app.movimientosPeriodo.slice(); app.ventasPeriodo = libro.ventas;
        app.aplicarKardex(libro.filas, app.movimientosPeriodo, libro.ventas);
        return libro;
    };
    app.encolarMovimientos = jest.fn((movs) => guardados.push(...plain(movs).map((m) => ({ ...m, fecha: m.fechaFija || m.fecha || fechaIngreso }))));
    recargar(); return { app, guardados, recargar };
}

test('el ingreso único de Sandwich permite ajustar lo ingresado antes como crudo', () => {
    const { app, guardados, recargar } = escenario([
        { rubro: 'sandwiches', cantidad: 3, motivo: 'Ingreso independiente crudo' },
        { rubro: 'sandwiches', cantidad: 2, motivo: 'Ingreso independiente cocido', tipoProducto: 'cocido' }
    ]);
    expect(app.ingresoDirectoPeriodo('sandwich', 'cocido')).toBe(5);
    expect(app.registrarIngresoDirecto('sandwich', 'cocido', input('7'))).toBe(true);
    expect(guardados[2]).toMatchObject({ rubro: 'sandwiches', tipoProducto: 'cocido', cantidad: 2, motivo: 'Ingreso independiente cocido' });
    recargar();
    expect(app.ingresoDirectoPeriodo('sandwich', 'cocido')).toBe(7);
    expect(app.stockCuadro('sandwich', 'cocido')).toBe(7);
    expect(app.stockCuadro('sandwich', 'crudo')).toBe(0);
});

test('base 127 no se precarga como ingreso; entrada 1 permanece visible y en la tabla tras recargar', () => {
    const { app, guardados, recargar } = escenario([{ rubro: 'filete', cantidad: 127 }, { rubro: 'pechuga-pollo', cantidad: 40 }]);
    const otros = plain(app.rows.filter((r) => r.id !== 'filete'));
    expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(0);
    const el = input('1');
    expect(app.registrarIngresoDirecto('filete', 'crudo', el)).toBe(true);
    expect(el.value).toBe('1'); expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(1);
    expect(app.stockCuadro('filete', 'crudo')).toBe(128);
    expect(plain(app.rows.filter((r) => r.id !== 'filete'))).toEqual(otros);
    expect(guardados[2]).toMatchObject({ clase: 'ingreso', cantidad: 1, rubro: 'filete' });
    const libro = recargar();
    expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(1); expect(app.stockCuadro('filete', 'crudo')).toBe(128);
    expect(app.getRow('filete').ingreso).toBe(128);
    expect(libro.filas.find((f) => f.rubro === 'filete' && f.tipoProducto === 'crudo').ingresoBruto).toBe(128);
    expect(app.getRow('filete').transformacion).toBe(0);
});

test('1 a 2 edita el total, reenviar 2 no duplica y 2 a 0 restaura la base', () => {
    const { app, guardados, recargar } = escenario([{ rubro: 'filete', cantidad: 127 }]); const el = input('1');
    app.registrarIngresoDirecto('filete', 'crudo', el); expect(app.registrarIngresoDirecto('filete', 'crudo', el)).toBe(false);
    el.value = '2'; app.registrarIngresoDirecto('filete', 'crudo', el);
    expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(2); expect(app.stockCuadro('filete', 'crudo')).toBe(129);
    expect(guardados.slice(1).map((m) => m.cantidad)).toEqual([1, 1]);
    el.value = '0'; expect(app.registrarIngresoDirecto('filete', 'crudo', el)).toBe(true);
    expect(guardados[3]).toMatchObject({ clase: 'ingreso', cantidad: -2 }); recargar();
    expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(0); expect(app.stockCuadro('filete', 'crudo')).toBe(127);
    expect(app.getRow('filete').ingreso).toBe(127);
});

test('el modal de Pecho reduce y quita su ingreso sin reducir el saldo que ya existía', () => {
    const { app, guardados, recargar } = escenario([
        { rubro: 'pechuga-pollo', cantidad: 20 },
        { rubro: 'pechuga-pollo', cantidad: 8, motivo: 'Ingreso independiente crudo' },
        { rubro: 'sandwiches', cantidad: 3 }
    ]);
    app.activeTab = 'tabla';
    const otros = plain(app.rows.filter((r) => r.id !== 'pechuga'));
    const abrir = () => {
        app.abrirIngresoGrupo(app.filaReal('pechuga'));
        return app.ingresoGrupo.lineas[0].cuadros[0];
    };

    let cuadro = abrir();
    expect(cuadro.ya).toBe(8);
    // Al abrir, el cuadro muestra lo ya ingresado y no hay cambios.
    expect(cuadro.valor).toBe('8');
    expect(app.hayCambiosIngresoGrupo()).toBe(false);
    cuadro.valor = '5';
    expect(app.stockPrevistoIngresoGrupo()).toBe(app.ingresoGrupo.stockAntes - 3);
    expect(app.guardarIngresoGrupo()).toBe(true);
    recargar();
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(25);

    cuadro = abrir();
    expect(cuadro.ya).toBe(5);
    expect(cuadro.valor).toBe('5');
    cuadro.valor = '0';
    expect(app.guardarIngresoGrupo()).toBe(true);
    recargar();
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(20);
    expect(app.ingresoDirectoPeriodo('pechuga', 'crudo')).toBe(0);
    expect(plain(app.rows.filter((r) => r.id !== 'pechuga'))).toEqual(otros);
    expect(guardados.slice(3).map(({ rubro, clase, tipoProducto, cantidad, motivo }) => ({ rubro, clase, tipoProducto, cantidad, motivo }))).toEqual(
        [-3, -5].map((cantidad) => ({ rubro: 'pechuga-pollo', clase: 'ingreso', tipoProducto: 'crudo', cantidad, motivo: 'Ingreso independiente crudo' }))
    );
});

test('30 cocidos de Pecho pachamanca se ven al reabrir el modal y 0 los revierte', () => {
    const { app, recargar } = escenario([{ rubro: 'pechuga-pollo', cantidad: 20 }]);
    app.activeTab = 'tabla';
    const fila = () => app.filaReal('pecho_pachamanca');
    const abrir = () => {
        app.abrirIngresoGrupo(app.filaReal('pechuga'));
        const linea = app.ingresoGrupo.lineas.find((l) => l.id === 'pecho_pachamanca');
        return linea.cuadros.find((c) => c.tipo === 'cocido');
    };
    expect(fila().tieneCocido).toBe(true);
    const antes = app.calcSaldoTipo(fila(), 'cocido');
    let cuadro = abrir();
    expect(cuadro.valor).toBe('0');
    cuadro.valor = '30';
    expect(app.guardarIngresoGrupo()).toBe(true);
    expect(app.calcSaldoTipo(fila(), 'cocido')).toBe(antes + 30);
    recargar();
    cuadro = abrir();
    expect(cuadro.ya).toBe(30);
    expect(cuadro.valor).toBe('30');
    expect(app.hayCambiosIngresoGrupo()).toBe(false);
    cuadro.valor = '0';
    expect(app.guardarIngresoGrupo()).toBe(true);
    recargar();
    expect(app.calcSaldoTipo(fila(), 'cocido')).toBe(antes);
    expect(abrir().valor).toBe('0');
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(20);
});

test('los cambios de ingreso en dos productos pueden sumar cero y guardarse igual', () => {
    const { app, guardados } = escenario([{ rubro: 'pechuga-pollo', cantidad: 4, motivo: 'Ingreso independiente crudo' }]);
    app.activeTab = 'tabla';
    app.abrirIngresoGrupo(app.filaReal('pechuga'));
    const [principal, otro] = app.ingresoGrupo.lineas;
    principal.cuadros[0].valor = '-1';
    otro.cuadros[0].valor = '2';
    expect(app.guardarIngresoGrupo()).toBe(false);
    expect(guardados).toHaveLength(1);
    principal.cuadros[0].valor = '2';
    expect(app.totalIngresoGrupo()).toBe(0);
    expect(app.hayCambiosIngresoGrupo()).toBe(true);
    expect(app.guardarIngresoGrupo()).toBe(true);
    expect(guardados.slice(1).map((m) => m.cantidad)).toEqual([-2, 2]);
});

test('stock 128 a 127 elimina ingreso 1 sin devolver filetes a pechuga', () => {
    const { app, guardados, recargar } = escenario([{ rubro: 'filete', cantidad: 127 }, { rubro: 'pechuga-pollo', cantidad: 40 }]);
    app.registrarIngresoDirecto('filete', 'crudo', input('1')); const otros = plain(app.rows.filter((r) => r.id !== 'filete'));
    expect(app.fijarStockConIngreso('filete', 'crudo', input('127'))).toBe(true);
    expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(0); expect(app.stockCuadro('filete', 'crudo')).toBe(127);
    expect(plain(app.rows.filter((r) => r.id !== 'filete'))).toEqual(otros);
    expect(guardados.slice(2).map((m) => [m.clase, m.cantidad])).toEqual([['ingreso', 1], ['ingreso', -1]]);
    recargar(); expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(0); expect(app.stockCuadro('filete', 'crudo')).toBe(127); expect(app.stockCuadro('pechuga', 'crudo')).toBe(40);
});

test('subir stock 127 a 129 crea ingreso 2 que se refleja en columna Ingreso', () => {
    const { app, recargar } = escenario([{ rubro: 'filete', cantidad: 127 }]);
    expect(app.fijarStockConIngreso('filete', 'crudo', input('129'))).toBe(true);
    expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(2); expect(app.getRow('filete').ingreso).toBe(129);
    recargar(); expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(2); expect(app.stockCuadro('filete', 'crudo')).toBe(129);
});

test('bajar stock bajo base elimina ingreso y la resta sale en ventas, no como correccion', () => {
    const { app, guardados, recargar } = escenario([{ rubro: 'filete', cantidad: 127 }]); app.registrarIngresoDirecto('filete', 'crudo', input('2'));
    expect(app.fijarStockConIngreso('filete', 'crudo', input('125'))).toBe(true);
    expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(0); expect(app.stockCuadro('filete', 'crudo')).toBe(125);
    expect(app.getRow('filete').ingreso).toBe(127); expect(app.getRow('filete').correccion).toBe(0); expect(app.getRow('filete').venta).toBe(2);
    expect(guardados.slice(2).filter((m) => m.clase === 'ingreso').reduce((s, m) => s + m.cantidad, 0)).toBe(-2);
    expect(guardados.slice(2).filter((m) => m.clase === 'regulacion')).toEqual([]);
    expect(guardados.slice(2).find((m) => m.clase === 'egreso')).toMatchObject({ cantidad: 2, motivo: 'Venta manual · baja de stock' });
    recargar(); expect(app.stockCuadro('filete', 'crudo')).toBe(125); expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(0);
    expect(app.getRow('filete').correccion).toBe(0); expect(app.getRow('filete').venta).toBe(2);
    app.abrirVentaFila(app.filaReal('filete'));
    expect(app.ventaInfo.lineas.filter((l) => l.manual).reduce((s, l) => s + l.cantidad, 0)).toBe(2);
});

test('al cambiar periodo el ingreso corresponde a ese periodo y al regresar se reconstruye', () => {
    const { app, recargar } = escenario([{ rubro: 'filete', cantidad: 127 }]); app.registrarIngresoDirecto('filete', 'crudo', input('1'));
    recargar('2026-11-19'); expect(app.stockCuadro('filete', 'crudo')).toBe(128); expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(0);
    recargar('2026-11-18'); expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(1); expect(app.stockCuadro('filete', 'crudo')).toBe(128);
});

test('guardar ingreso invalida caches de tabla y Transformar', () => {
    const { app } = escenario([{ rubro: 'filete', cantidad: 127 }]); app._cacheKardex = { tabla: { q: 'viejo' }, transformar: { q: 'viejo' } };
    app.registrarIngresoDirecto('filete', 'crudo', input('1')); expect(app._cacheKardex.tabla).toBeFalsy(); expect(app._cacheKardex.transformar).toBeFalsy();
});

test.each([['2026-11-17', '2026-11-18T03:59:00-05:00'], ['2026-11-18', undefined]])('sin helper de fecha se conserva el periodo %s', (hasta, fechaEsperada) => {
    const { app, guardados } = escenario([{ rubro: 'filete', cantidad: 127 }]); app.fechaCierreVista = undefined; app.rangoVista = undefined; app.rangoPeriodo = () => ({ desde: hasta, hasta });
    expect(app.registrarIngresoDirecto('filete', 'crudo', input('10'))).toBe(true); expect(guardados[1].fechaFija).toBe(fechaEsperada); expect(app.stockCuadro('filete', 'crudo')).toBe(137);
});

test('pollo fresco recibe ingreso sin despiece automatico', () => {
    const { app, recargar } = escenario([{ rubro: 'pollo-origen', cantidad: 2 }]); const antes = plain(app.rows.filter((r) => r.id !== 'pollo_fresco'));
    app.registrarIngresoDirecto('pollo_fresco', 'crudo', input('3')); expect(app.stockCuadro('pollo_fresco', 'crudo')).toBe(5); expect(app.ingresoDirectoPeriodo('pollo_fresco', 'crudo')).toBe(3);
    expect(plain(app.rows.filter((r) => r.id !== 'pollo_fresco'))).toEqual(antes); recargar(); expect(app.stockCuadro('pollo_fresco', 'crudo')).toBe(5); expect(app.stockCuadro('pechuga', 'crudo')).toBe(0);
});

test('editar y deshacer cocido no consume ni devuelve crudo', () => {
    const { app, recargar } = escenario([{ rubro: 'pollo-baby', cantidad: 7 }, { rubro: 'pollo-baby', tipoProducto: 'cocido', cantidad: 2 }]);
    app.registrarIngresoDirecto('pollo_baby', 'cocido', input('4')); expect(app.stockCuadro('pollo_baby', 'cocido')).toBe(6); expect(app.stockCuadro('pollo_baby', 'crudo')).toBe(7);
    app.registrarIngresoDirecto('pollo_baby', 'cocido', input('0')); recargar(); expect(app.stockCuadro('pollo_baby', 'cocido')).toBe(2); expect(app.stockCuadro('pollo_baby', 'crudo')).toBe(7); expect(app.ingresoDirectoPeriodo('pollo_baby', 'cocido')).toBe(0);
});

test.each([['arroz_blanco', 'arroz-blanco'], ['arroz_verde', 'arroz-verde'], ['tira_panceta', 'tira-panceta'], ['trozo_panceta', 'trozo-panceta']])('%s permite revertir ingreso sin gastar materia prima', (id, rubro) => {
    const { app, guardados, recargar } = escenario([{ rubro: 'arroz', cantidad: 50 }, { rubro: 'panceta', cantidad: 20 }]); const otros = plain(app.rows.filter((r) => r.id !== id));
    app.registrarIngresoDirecto(id, 'crudo', input('8')); expect(app.stockCuadro(id, 'cocido')).toBe(8); expect(app.ingresoDirectoPeriodo(id, 'cocido')).toBe(8);
    expect(guardados[2]).toMatchObject({ rubro, clase: 'ingreso', tipoProducto: 'cocido', cantidad: 8 }); expect(plain(app.rows.filter((r) => r.id !== id))).toEqual(otros);
    app.registrarIngresoDirecto(id, 'cocido', input('0')); recargar(); expect(app.stockCuadro(id, 'cocido')).toBe(0); expect(app.ingresoDirectoPeriodo(id, 'cocido')).toBe(0); expect(app.stockCuadro('arroz', 'crudo')).toBe(50); expect(app.stockCuadro('panceta', 'crudo')).toBe(20);
});

test.each([['arroz_beata', 'arroz-beata'], ['arroz_rio_lindo', 'arroz-rio-lindo']])('%s edita ingreso sin descarga ni ventas', (id, rubro) => {
    const { app, guardados, recargar } = escenario([{ rubro: 'arroz', cantidad: 50 }]); const tipo = app.tipoArrozDestino({ id });
    app.registrarIngresoDirecto(id, tipo, input('2.5')); recargar(); expect(app.ingresoDirectoPeriodo(id, tipo)).toBe(2.5); expect(guardados[1]).toMatchObject({ rubro, clase: 'ingreso', cantidad: 2.5 });
    app.registrarIngresoDirecto(id, tipo, input('0')); recargar(); expect(app.stockCuadro(id, tipo)).toBe(0); expect(app.stockCuadro('arroz', 'crudo')).toBe(50); expect(app.kgDescargaArroz({ id })).toBe(0);
});

test.each([
    ['arrozVerde', 'arroz-verde', 0.833, 7.167],
    ['arrozBlanco', 'arroz-blanco', 0.625, 7.375]
])('%s conserva cinco porciones en Transformar y en la hoja', (campo, rubro, kg, restante) => {
    const { app, guardados, recargar } = escenario([{ rubro: 'arroz', cantidad: 8 }]);
    app.encolarMovimientos.mockImplementation((movs) => guardados.push(...plain(movs).map((m) => ({ ...m, fecha: fechaIngreso }))));
    const destino = app.destinosArroz().find((d) => d.campo === campo);

    expect(app.fijarIngresoArrozPorciones(campo, '5')).toBe(true);
    expect(app.ingresoTransformaArroz(destino)).toBe(5);
    expect(app.totalPorcionesArroz(destino)).toBe(5);
    expect(guardados.slice(1)).toEqual([
        expect.objectContaining({ rubro: 'arroz', cantidad: -kg }),
        expect.objectContaining({ rubro, tipoProducto: 'cocido', cantidad: 5 })
    ]);

    const libro = recargar();
    expect(app.ingresoTransformaArroz(destino)).toBe(5);
    expect(app.stockCuadro('arroz', 'crudo')).toBe(restante);
    expect(app.saldoPorcionesArroz(destino)).toBe(5);
    const desglose = app.construirDetalleTransformacion(app.filaReal('arroz'));
    expect(desglose.destinos.find((d) => d.id === destino.id)).toMatchObject({ usadoDelOrigen: kg, generado: 5 });
    expect(libro.filas.find((f) => f.rubro === rubro && f.tipoProducto === 'cocido')).toMatchObject({ ingresoBruto: 5, queda: 5 });
    expect(app.fijarIngresoArrozPorciones(campo, '5')).toBe(false);

    expect(app.fijarIngresoArrozPorciones(campo, '0')).toBe(true);
    recargar();
    expect(app.stockCuadro('arroz', 'crudo')).toBe(8);
    expect(app.saldoPorcionesArroz(destino)).toBe(0);
});

describe('arroz blanco y verde se llenan en kg en Transformar', () => {
    const preparar = (iniciales = [{ rubro: 'arroz', cantidad: 8 }]) => {
        const e = escenario(iniciales);
        e.app.encolarMovimientos.mockImplementation((movs) => e.guardados.push(...plain(movs).map((m) => ({ ...m, fecha: m.fechaFija || fechaIngreso }))));
        return e;
    };

    test.each([['arrozBlanco', 8], ['arrozVerde', 6]])('Transformar %s: 1 kg son %i porciones y gasta 1 kg de crudo', (campo, factor) => {
        const { app, recargar } = preparar();
        const d = app.destinosArroz().find((x) => x.campo === campo);
        expect(app.fijarIngresoArrozKg(campo, '1')).toBe(true);
        recargar();
        expect(app.kgDeArroz(d, app.ingresoTransformaArroz(d))).toBe(1);
        expect(app.ingresoTransformaArroz(d)).toBe(factor);
        expect(app.textoPorcionesArroz(d, app.ingresoTransformaArroz(d))).toBe(factor + ' p');
        expect(app.stockCuadro('arroz', 'crudo')).toBe(7);
        expect(app.fijarIngresoArrozKg(campo, '1')).toBe(false);
        expect(app.fijarIngresoArrozKg(campo, '0')).toBe(true);
        recargar();
        expect(app.stockCuadro('arroz', 'crudo')).toBe(8);
        expect(app.saldoPorcionesArroz(d)).toBe(0);
    });

    test('el stock anterior y el ingreso independiente se escriben en kg y se guardan en porciones', () => {
        const { app, guardados, recargar } = preparar();
        const verde = app.destinosArroz().find((x) => x.campo === 'arrozVerde');
        expect(app.fijarStockAnteriorArrozKg(verde, '0.5')).toBe(true);
        recargar();
        expect(app.stockAnteriorArroz(verde)).toBe(3);
        expect(app.kgDeArroz(verde, app.stockAnteriorArroz(verde))).toBe(0.5);
        expect(app.fijarStockAnteriorArrozKg(verde, '0.5')).toBe(false);
        const el = input('2');
        expect(app.registrarIngresoArrozKg(verde, el)).toBe(true);
        expect(el.value).toBe('2');
        recargar();
        expect(app.ingresoDirectoPeriodo('arroz_verde', 'cocido')).toBe(12);
        expect(guardados[guardados.length - 1]).toMatchObject({ rubro: 'arroz-verde', cantidad: 12, motivo: 'Ingreso independiente cocido' });
        expect(app.stockCuadro('arroz', 'crudo')).toBe(8);
        expect(app.registrarIngresoArrozKg(verde, input('0'))).toBe(true);
        recargar();
        expect(app.ingresoDirectoPeriodo('arroz_verde', 'cocido')).toBe(0);
    });

    test('el HTML muestra kg arriba y porciones abajo, y kg en el stock del arroz crudo', () => {
        const texto = html.replace(/\r\n/g, '\n');
        const ini = texto.indexOf('MAPA SEMÁNTICO HORIZONTAL: ARROZ CRUDO');
        const bloque = texto.slice(ini, texto.indexOf('1. MAPA SEMÁNTICO HORIZONTAL — FAMILIA POLLO FRESCO', ini));
        const formula = bloque.slice(bloque.indexOf('class="arroz-formula"'), bloque.indexOf('class="caja-stock" x-show="!esArrozPorcion(d)"'));
        expect(formula).not.toContain('<span class="arroz-unidad">p</span>');
        expect(formula.match(/<span class="arroz-unidad" x-text="unidadCuadroArroz\(\)"><\/span>/g)).toHaveLength(5);
        expect(formula.match(/textoBajoCuadroArroz\(/g)).toHaveLength(5);
        expect(formula).toContain('fijarIngresoArrozCuadro(d.campo, $event.target.value)');
        expect(formula).toContain('fijarStockAnteriorArrozCuadro(d, $event.target.value)');
        expect(bloque).toContain('registrarIngresoArrozCuadro(d, $event.target)');
        expect(bloque).toMatch(/aria-label="Stock actual de arroz crudo en kg"[^>]*>\s*<span class="arroz-unidad caja-stock-unidad">kg<\/span>/);
        const config = texto.slice(texto.indexOf('<h3 class="sec-title text-sm">Cuadros de Transformar</h3>'));
        expect(config.slice(0, config.indexOf('</div>'))).toMatch(/:checked="arrozEnKg" @change="setArrozEnKg\(\$event\.target\.checked\)"[\s\S]*De porciones a kg/);
    });

    test('"De porciones a kg" sin marcar vuelve a llenar en porciones, como antes', () => {
        const { app, recargar } = preparar();
        const blanco = app.destinosArroz().find((x) => x.campo === 'arrozBlanco');
        expect(app.arrozEnKg).toBe(true);
        expect(app.unidadCuadroArroz()).toBe('kg');
        app.setArrozEnKg(false);
        expect(app.unidadCuadroArroz()).toBe('p');
        expect(app.fijarIngresoArrozCuadro('arrozBlanco', '4')).toBe(true);
        recargar();
        expect(app.ingresoTransformaArroz(blanco)).toBe(4);
        expect(app.valorCuadroArroz(blanco, app.ingresoTransformaArroz(blanco))).toBe(4);
        expect(app.textoBajoCuadroArroz(blanco, 4)).toBe('0.5 kg');
        expect(app.stockCuadro('arroz', 'crudo')).toBe(7.5);
        expect(app.registrarIngresoArrozCuadro(blanco, input('3'))).toBe(true);
        recargar();
        expect(app.ingresoDirectoPeriodo('arroz_blanco', 'cocido')).toBe(3);
        app.setArrozEnKg(true);
        expect(app.valorCuadroArroz(blanco, app.ingresoTransformaArroz(blanco))).toBe(0.5);
        expect(app.textoBajoCuadroArroz(blanco, 4)).toBe('4 p');
        expect(app.fijarIngresoArrozCuadro('arrozBlanco', '1')).toBe(true);
        recargar();
        expect(app.ingresoTransformaArroz(blanco)).toBe(8);
        expect(app.stockCuadro('arroz', 'crudo')).toBe(7);
    });

    test('la casilla se guarda en el equipo', () => {
        const guardado = {};
        const storage = { getItem: (k) => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = String(v); }, removeItem: (k) => { delete guardado[k]; } };
        const crear = () => vm.runInNewContext('(' + code.trim() + ')', { window: {}, localStorage: storage, sessionStorage: storage, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0 })();
        const app = crear();
        app.cargarVistaTablaLocal();
        expect(app.arrozEnKg).toBe(true);
        app.setArrozEnKg(false);
        expect(guardado['inventario-transformar-arroz-kg']).toBe('0');
        const otra = crear();
        otra.cargarVistaTablaLocal();
        expect(otra.arrozEnKg).toBe(false);
    });
});

test('reescribir cinco porciones corrige 4.998 sin volver a consumir arroz crudo', () => {
    const { app, guardados, recargar } = escenario([
        { rubro: 'arroz', cantidad: 8 },
        { rubro: 'arroz', cantidad: -0.833, motivo: 'Pasa a Arroz verde + Pato' },
        { rubro: 'arroz-verde', tipoProducto: 'cocido', cantidad: 4.998, motivo: 'Sale de Arroz crudo' }
    ]);
    app.encolarMovimientos.mockImplementation((movs) => guardados.push(...plain(movs).map((m) => ({ ...m, fecha: fechaIngreso }))));
    const destino = app.destinosArroz().find((d) => d.campo === 'arrozVerde');
    expect(app.fijarIngresoArrozPorciones(destino.campo, '5')).toBe(true);
    expect(guardados.slice(3)).toEqual([
        expect.objectContaining({ rubro: 'arroz-verde', cantidad: 0.002 })
    ]);
    recargar();
    expect(app.stockCuadro('arroz', 'crudo')).toBe(7.167);
    expect(app.saldoPorcionesArroz(destino)).toBe(5);
});

test('octavos conservan ingresos independientes por corte al editar y recargar', () => {
    const { app, recargar } = escenario(); app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('3'), 'pechugas'); app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('4'), 'piernas');
    expect(app.ingresoDirectoPeriodo('octavo_pollo', 'crudo', 'pechugas')).toBe(3); expect(app.ingresoDirectoPeriodo('octavo_pollo', 'crudo', 'piernas')).toBe(4);
    app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('0'), 'pechugas'); recargar(); expect(app.octavosStockCorte('pechugas')).toBe(0); expect(app.octavosStockCorte('piernas')).toBe(4); expect(app.stockCuadro('pechuga', 'crudo')).toBe(0);
});

test('editar stock por corte elimina su ingreso sin alterar corte contrario', () => {
    const { app, recargar } = escenario([{ rubro: 'octavo-pollo', cantidad: 5, motivo: 'Ingreso inicial · pecho' }, { rubro: 'octavo-pollo', cantidad: 7, motivo: 'Ingreso inicial · pierna' }]);
    app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('1'), 'pechugas'); app.fijarStockConIngreso('octavo_pollo', 'crudo', input('5'), 'pechugas'); recargar();
    expect(app.ingresoDirectoPeriodo('octavo_pollo', 'crudo', 'pechugas')).toBe(0); expect(app.octavosStockCorte('pechugas')).toBe(5); expect(app.octavosStockCorte('piernas')).toBe(7);
});

test('plato por corte puede revertir cocido sin consumir octavo ni crudo', () => {
    const { app, recargar } = escenario([{ rubro: 'octavo-pollo', cantidad: 5, motivo: 'Ingreso inicial · pecho' }]); app.registrarIngresoDirecto('arroz_con_pollo', 'cocido', input('4'), 'pechugas');
    expect(app.stockOctavoPlato('arroz_con_pollo', 'pechugas', 'cocido')).toBe(4); app.registrarIngresoDirecto('arroz_con_pollo', 'cocido', input('0'), 'pechugas'); recargar();
    expect(app.stockOctavoPlato('arroz_con_pollo', 'pechugas', 'cocido')).toBe(0); expect(app.stockCuadro('octavo_pollo', 'crudo')).toBe(5); expect(app.stockCuadro('arroz_con_pollo', 'crudo')).toBe(0);
});

test('la descarga de personal, beata, evento y rio lindo no entra en el ingreso', () => {
    const { app, recargar } = escenario([{ rubro: 'octavo-pollo', cantidad: 10, motivo: 'Ingreso inicial · pecho' }]);
    expect(app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('26'), 'pechugas', 'personal')).toBe(true);
    expect(app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('20'), 'piernas', 'beata')).toBe(true);
    expect(app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('30'), 'pechugas', 'eventos')).toBe(true);
    expect(app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('50'), 'piernas', 'rio-lindo')).toBe(true);
    expect(app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('4'), 'pechugas')).toBe(true);
    expect(app.cifraIngresoTabla(app.filaReal('octavo_pollo'), 'ingresoTotal')).toBe(14);
    const libro = recargar();
    const fila = libro.filas.find((f) => f.rubro === 'octavo-pollo' && f.tipoProducto === 'crudo');
    expect(fila).toMatchObject({ ingresoBruto: 14, regulacion: 0, queda: 14, sinTope: 14 });
    expect(fila.saldoInicial + fila.ingresoBruto - fila.egreso - fila.venta + fila.cubierta - fila.transformacion + fila.regulacion + fila.ajuste).toBe(fila.sinTope);
    const octavo = app.filaReal('octavo_pollo');
    expect(app.ingresoAnotadoTipo(octavo, 'crudo')).toBe(14);
    expect(app.cifraIngresoTabla(octavo, 'ingreso')).toBe(14);
    expect(app.cifraIngresoTabla(octavo, 'ingresoTotal')).toBe(14);
    expect(app.ingresoDirectoPeriodo('octavo_pollo', 'crudo', 'pechugas', 'personal')).toBe(26);
    expect(app.ingresoDirectoPeriodo('octavo_pollo', 'crudo', 'piernas', 'beata')).toBe(20);
    expect(app.ingresoDirectoPeriodo('octavo_pollo', 'crudo', 'pechugas', 'eventos')).toBe(30);
    expect(app.ingresoDirectoPeriodo('octavo_pollo', 'crudo', 'piernas', 'rio-lindo')).toBe(50);
    expect(app.octavosEnDestino('personal', 'pechugas')).toBe(26);
    expect(app.octavosEnDestino('beata', 'piernas')).toBe(20);
    expect(app.octavosStockCorte('pechugas')).toBe(14);
    expect(app.stockCuadro('octavo_pollo', 'crudo')).toBe(14);
    const origen = app.origenIngresoDe(octavo);
    expect(origen.anotado).toBe(14);
    expect(origen.lineas.filter((l) => l.sector).map((l) => l.texto)).toEqual(expect.arrayContaining([
        'Ingreso directo de 26 octavos de pecho a Personal', 'Ingreso directo de 20 octavos de pierna a Beata',
        'Ingreso directo de 30 octavos de pecho a Evento', 'Ingreso directo de 50 octavos de pierna a Río Lindo'
    ]));
    expect(app.ingresoMarcadoOctavo(octavo, 'pechugas')).toBe(14);
    expect(app.ingresoMarcadoOctavo(octavo, 'piernas')).toBe(0);
    expect(app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('0'), 'pechugas', 'personal')).toBe(true);
    recargar();
    expect(app.ingresoAnotadoTipo(app.filaReal('octavo_pollo'), 'crudo')).toBe(14);
    expect(app.stockCuadro('octavo_pollo', 'crudo')).toBe(14);
    expect(app.octavosEnDestino('personal', 'pechugas')).toBe(0);
});

test('sectores editan total propio sin consumir libre ni afectar otro sector o ventas', () => {
    const { app, guardados, recargar } = escenario([{ rubro: 'octavo-pollo', cantidad: 5, motivo: 'Ingreso inicial · pecho' }]);
    app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('1'), 'pechugas', 'beata'); app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('3'), 'pechugas', 'beata'); app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('2'), 'pechugas', 'personal');
    expect(app.ingresoDirectoPeriodo('octavo_pollo', 'crudo', 'pechugas', 'beata')).toBe(3); expect(app.ingresoDirectoPeriodo('octavo_pollo', 'crudo', 'pechugas', 'personal')).toBe(2); expect(app.octavosEnDestino('beata', 'pechugas')).toBe(3);
    expect(guardados.slice(1).filter((m) => m.clase === 'ingreso').map((m) => m.cantidad)).toEqual([1, 2, 2]); expect(guardados[1].motivo).toMatch(/ · Sector Beata · pecho$/);
    app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('0'), 'pechugas', 'beata'); recargar(); expect(app.octavosEnDestino('beata', 'pechugas')).toBe(0); expect(app.octavosEnDestino('personal', 'pechugas')).toBe(2); expect(app.octavosStockCorte('pechugas')).toBe(5); expect(app.stockCuadro('octavo_pollo', 'crudo')).toBe(5); expect(guardados.some((m) => m.clase === 'egreso')).toBe(false);
});

test('editar stock de sector elimina su ingreso del periodo sin consumir libres', () => {
    const { app, recargar } = escenario([{ rubro: 'octavo-pollo', cantidad: 5, motivo: 'Ingreso inicial · pecho' }]); app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('1'), 'pechugas', 'beata');
    expect(app.fijarStockConIngreso('octavo_pollo', 'crudo', input('0'), 'pechugas', 'beata')).toBe(true); recargar(); expect(app.ingresoDirectoPeriodo('octavo_pollo', 'crudo', 'pechugas', 'beata')).toBe(0); expect(app.octavosEnDestino('beata', 'pechugas')).toBe(0); expect(app.octavosStockCorte('pechugas')).toBe(5);
});

test('legacy de sector ambiguo no se atribuye ni se elimina por inferencia', () => {
    // La version anterior omitio sector en el motivo del ingreso. No puede adjudicarse con certeza.
    const { app, guardados, recargar } = escenario([{ rubro: 'octavo-pollo', cantidad: 5, motivo: 'Ingreso inicial · pecho' }, { rubro: 'octavo-pollo', cantidad: 3, motivo: 'Ingreso independiente crudo · pecho' }, { rubro: 'octavo-pollo', clase: 'regulacion', cantidad: -3, motivo: 'Separado · Beata · pecho' }]);
    const legacy = plain(guardados); expect(app.ingresoDirectoPeriodo('octavo_pollo', 'crudo', 'pechugas', 'beata')).toBe(0); expect(app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('0'), 'pechugas', 'beata')).toBe(false); expect(plain(guardados)).toEqual(legacy);
    app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('1'), 'pechugas', 'beata'); app.registrarIngresoDirecto('octavo_pollo', 'crudo', input('0'), 'pechugas', 'beata'); recargar(); expect(app.octavosEnDestino('beata', 'pechugas')).toBe(3); expect(plain(guardados.slice(0, 3))).toEqual(legacy);
});

test.each(['', '-1', 'NaN', 'Infinity'])('valor invalido %j no altera filas ni escribe', (v) => {
    const { app, guardados } = escenario([{ rubro: 'filete', cantidad: 127 }]); const antes = plain(app.rows); expect(app.registrarIngresoDirecto('filete', 'crudo', input(v))).toBe(false); expect(plain(app.rows)).toEqual(antes); expect(guardados).toHaveLength(1); expect(app.encolarMovimientos).not.toHaveBeenCalled();
});

test('0 sin ingreso previo no resta stock de base', () => {
    const { app, guardados } = escenario([{ rubro: 'filete', cantidad: 127 }]); expect(app.registrarIngresoDirecto('filete', 'crudo', input('0'))).toBe(false); expect(app.stockCuadro('filete', 'crudo')).toBe(127); expect(guardados).toHaveLength(1);
});

test('producto desconocido, bloqueado o campo ausente no escribe', () => {
    const { app } = escenario(); expect(app.registrarIngresoDirecto('producto-inexistente', 'crudo', input('5'))).toBe(false); expect(app.registrarIngresoDirecto('filete', 'crudo', null)).toBe(false); app.productoBloqueado = () => true; expect(app.registrarIngresoDirecto('filete', 'crudo', input('5'))).toBe(false); expect(app.encolarMovimientos).not.toHaveBeenCalled();
});

test('fecha historica se conserva en persistencia y sin fecha fija se usa la del servidor', () => {
    const { app } = escenario(); app.registrarIngresoDirecto('filete', 'crudo', input('2')); expect(app.encolarMovimientos.mock.calls[0][0][0].fechaFija).toBe(fechaIngreso); app.fechaCierreVista = () => undefined; app.registrarIngresoDirecto('filete', 'crudo', input('3')); expect(app.encolarMovimientos.mock.calls[1][0][0].fechaFija).toBeUndefined();
});

test('vaciar un ingreso existente equivale a ponerlo en cero', () => {
    const { app, recargar } = escenario([{ rubro: 'filete', cantidad: 127 }]);
    app.registrarIngresoDirecto('filete', 'crudo', input('1'));
    expect(app.registrarIngresoDirecto('filete', 'crudo', input(''))).toBe(true);
    recargar();
    expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(0);
    expect(app.stockCuadro('filete', 'crudo')).toBe(127);
});

test('un ingreso en turno cerrado permanece dentro de ese turno', () => {
    const { app, guardados } = escenario();
    app.rangoIngresoDirecto = () => ({ desde: '2020-01-01T09:00:00.000Z', hasta: '2020-01-01T18:00:00.000Z' });
    app.fechaCierreVista = () => undefined;
    expect(app.registrarIngresoDirecto('filete', 'crudo', input('1'))).toBe(true);
    expect(guardados[0].fechaFija).toBe('2020-01-01T17:59:59.999Z');
    expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(1);
    expect(app.registrarIngresoDirecto('filete', 'crudo', input('0'))).toBe(true);
    expect(app.ingresoDirectoPeriodo('filete', 'crudo')).toBe(0);
});
