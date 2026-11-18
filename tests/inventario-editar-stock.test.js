const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '../public/inventario.html'), 'utf8');
const factoryCode = html.slice(html.indexOf('function inventarioApp()'), html.lastIndexOf('</script>'));

function escenario({ movimientos = [], saldos = {}, producidos = {} } = {}) {
    const crearApp = vm.runInNewContext('(' + factoryCode.trim() + ')', { window: {}, setTimeout, clearTimeout });
    const app = crearApp();
    const definiciones = [
        { id: 'octavo_pollo', nombre: 'Octavo de pollo', tieneCocido: false },
        { id: 'arroz_con_pollo', nombre: 'Arroz con pollo', tieneCocido: true },
        { id: 'pollo_olla', nombre: 'Pollo a la olla', tieneCocido: true },
        { id: 'caldo_pollo', nombre: 'Caldo de pollo', tieneCocido: false },
        { id: 'arroz', nombre: 'Arroz', tieneCocido: true }
    ];
    let filas;
    const guardados = movimientos.map((m) => ({ ...m }));
    const recargar = () => {
        filas = definiciones.map((row) => ({ ...row, ...(saldos[row.id] || {}) }));
        for (const m of guardados) {
            const row = filas.find((f) => f.id === m.rubro);
            const campo = app.campoTipo(m.clase === 'egreso' ? 'venta' : (m.clase === 'regulacion' ? 'correccion' : 'ingreso'), m.tipoProducto);
            row[campo] = (Number(row[campo]) || 0) + (m.clase === 'egreso' ? Math.abs(m.cantidad) : m.cantidad);
        }
        app.movimientosPeriodo = guardados.map((m) => ({ ...m }));
        app.movimientosTurno = app.movimientosPeriodo.slice();
    };
    app.filaReal = (id) => filas.find((row) => row.id === id);
    app.claveDeFila = Object.fromEntries(definiciones.map((row) => [row.id, row.id]));
    app.filasTransformacionDe = (row) => row.id === 'octavo_pollo' ? filas.filter((f) => app.esPlatoOctavoEditar(f.id)) : [];
    app.octavosDe = (corte) => producidos[corte] || 0;
    app.paso = jest.fn(async (rubro, tipoProducto, cantidad, motivo, clase) => {
        guardados.push({ rubro, tipoProducto, cantidad, motivo, clase });
    });
    app.cargarKardex = jest.fn(async () => recargar());
    app.pulseRowTotal = jest.fn();
    app.anotarHistorial = jest.fn();
    recargar();
    return { app, guardados };
}

const ingreso = (rubro, tipoProducto, cantidad, corte) => ({ rubro, tipoProducto, cantidad, clase: 'ingreso', motivo: 'Ingreso ' + tipoProducto + (corte ? ' · ' + corte : '') });

test.each(['arroz_con_pollo', 'pollo_olla', 'caldo_pollo'])('el lápiz de %s abre pierna y pecho también desde la tabla', (id) => {
    const { app } = escenario({ movimientos: [ingreso(id, 'crudo', 3, 'pecho'), ingreso(id, 'crudo', 7, 'pierna')] });
    for (const desdeTabla of [false, true]) {
        if (desdeTabla) app.abrirEditarStockFila(app.filaReal(id));
        else app.abrirEditarStock(id);
        expect(app.editarStock.cortes).toBe(true);
        expect(app.editarStock.lineas[0]).toMatchObject({ porCorte: true, pecho: { crudo: 3 }, pierna: { crudo: 7 } });
        expect(app.stockEditarAntes()).toBe(10);
    }
});

test('un conteo redistribuye stock antiguo y guarda ambos estados por corte sin mover piezas', async () => {
    const { app, guardados } = escenario({ saldos: { arroz_con_pollo: { saldoAnterior: 10, saldoAnteriorCocido: 4 } } });
    app.abrirEditarStock('arroz-pollo');
    const linea = app.editarStock.lineas[0];
    linea.pecho = { crudo: 3, cocido: 2 };
    linea.pierna = { crudo: 8, cocido: 4 };
    app.editarStock.motivo = 'Conteo de pecho y pierna';
    expect(app.stockEditarNuevo()).toBe(17);
    expect(await app.guardarModalStock()).toBe(true);
    expect(app.stockCuadro('arroz_con_pollo', 'crudo')).toBe(11);
    expect(app.stockCuadro('arroz_con_pollo', 'cocido')).toBe(6);
    expect(app.stockOctavoPlato('arroz_con_pollo', 'pechugas', 'crudo')).toBe(3);
    expect(app.stockOctavoPlato('arroz_con_pollo', 'piernas', 'crudo')).toBe(8);
    expect(app.stockOctavoPlato('arroz_con_pollo', 'pechugas', 'cocido')).toBe(2);
    expect(app.stockOctavoPlato('arroz_con_pollo', 'piernas', 'cocido')).toBe(4);
    expect(guardados.every((m) => m.rubro === 'arroz_con_pollo')).toBe(true);
    app.abrirEditarStock('arroz_con_pollo');
    const antes = app.paso.mock.calls.length;
    await app.guardarModalStock();
    expect(app.paso).toHaveBeenCalledTimes(antes);
});

test('un conteo conserva la distribución exacta después de ventas sin marca', async () => {
    const { app } = escenario({ movimientos: [
        ingreso('pollo_olla', 'crudo', 8, 'pecho'),
        ingreso('pollo_olla', 'crudo', 8, 'pierna'),
        { rubro: 'pollo_olla', tipoProducto: 'crudo', cantidad: 6, clase: 'egreso', motivo: 'Venta' }
    ] });
    app.abrirEditarStock('pollo_olla');
    expect(app.editarStock.lineas[0].pecho.crudo).toBe(5);
    app.editarStock.lineas[0].pecho.crudo = 2;
    app.editarStock.lineas[0].pierna.crudo = 7;
    await app.guardarModalStock();
    expect(app.stockCuadro('pollo_olla', 'crudo')).toBe(9);
    expect(app.stockOctavoPlato('pollo_olla', 'pechugas', 'crudo')).toBe(2);
    expect(app.stockOctavoPlato('pollo_olla', 'piernas', 'crudo')).toBe(7);
});

test('el conteo de Octavo y sus platos respeta todos los cortes después de recargar', async () => {
    const { app } = escenario({ saldos: { octavo_pollo: { saldoAnterior: 10 } } });
    app.abrirEditarOctavo(true);
    app.editarStock.pecho = 4;
    app.editarStock.pierna = 6;
    app.editarStock.lineas.find((linea) => linea.id === 'arroz_con_pollo').pecho.crudo = 3;
    await app.guardarModalStock();
    expect(app.stockCuadro('octavo_pollo', 'crudo')).toBe(10);
    expect(app.octavosStockCorte('pechugas')).toBe(4);
    expect(app.octavosStockCorte('piernas')).toBe(6);
    expect(app.stockOctavoPlato('arroz_con_pollo', 'pechugas', 'crudo')).toBe(3);
});

test('el conteo de Octavo puede aumentar pecho por encima de la producción desde piezas', async () => {
    const { app } = escenario({ saldos: { octavo_pollo: { saldoAnterior: 20 } }, producidos: { pechugas: 20 } });
    app.abrirEditarOctavo();
    app.editarStock.pecho = 22;
    app.editarStock.pierna = 0;
    await app.guardarModalStock();
    expect(app.stockCuadro('octavo_pollo', 'crudo')).toBe(22);
    expect(app.octavosStockCorte('pechugas')).toBe(22);
    expect(app.octavosStockCorte('piernas')).toBe(0);
});

test('validar todas las líneas evita guardar parcialmente un formulario inválido', async () => {
    const { app } = escenario();
    app.abrirEditarOctavo(true);
    app.editarStock.pecho = 5;
    app.editarStock.lineas[0].pecho.crudo = 3;
    app.editarStock.lineas[1].pierna.crudo = -1;
    expect(await app.guardarModalStock()).toBe(false);
    expect(app.paso).not.toHaveBeenCalled();
    expect(app.stockCuadro('octavo_pollo', 'crudo')).toBe(0);
    expect(app.editarStock.abierto).toBe(true);
    expect(app.editarStock.error).toBeTruthy();
});

test('un error de persistencia mantiene el modal abierto y permite reintentar', async () => {
    const { app } = escenario();
    app.abrirEditarStock('caldo_pollo');
    app.editarStock.lineas[0].pecho.crudo = 5;
    app.paso.mockRejectedValueOnce(new Error('Servidor no disponible'));
    expect(await app.guardarModalStock()).toBe(false);
    expect(app.editarStock).toMatchObject({ abierto: true, guardando: false, error: 'Servidor no disponible' });
    expect(app.stockCuadro('caldo_pollo', 'crudo')).toBe(0);
    expect(await app.guardarModalStock()).toBe(true);
    expect(app.stockOctavoPlato('caldo_pollo', 'pechugas', 'crudo')).toBe(5);
});

test('el modal simple conserva crudo/cocido y el motivo al persistir', async () => {
    const { app, guardados } = escenario({ saldos: { arroz: { saldoAnterior: 4, saldoAnteriorCocido: 2 } } });
    app.abrirEditarStockFila(app.filaReal('arroz'));
    expect(app.editarStock.cortes).toBe(false);
    expect(app.stockEditarAntes()).toBe(6);
    app.editarStock.crudo = 7;
    app.editarStock.cocido = 5;
    app.editarStock.motivo = 'Conteo de cámara';
    expect(app.stockEditarNuevo()).toBe(12);
    await app.guardarModalStock();
    expect(app.stockCuadro('arroz', 'crudo')).toBe(7);
    expect(app.stockCuadro('arroz', 'cocido')).toBe(5);
    expect(guardados.every((m) => m.motivo.includes('Conteo de cámara'))).toBe(true);
});

test('guardar cero corrige un saldo negativo aunque los cuadros lo mostraran en cero', async () => {
    const { app } = escenario({ movimientos: [{ rubro: 'caldo_pollo', tipoProducto: 'crudo', cantidad: 3, clase: 'egreso', motivo: 'Venta' }] });
    app.abrirEditarStock('caldo_pollo');
    expect(app.editarStock.lineas[0].pierna.crudo).toBe(0);
    await app.guardarModalStock();
    expect(app.calcSaldoTipo(app.filaReal('caldo_pollo'), 'crudo')).toBe(0);
});

test('el grupo de tabla guarda sus líneas simples y las líneas por corte juntas', async () => {
    const { app } = escenario({ saldos: { arroz: { saldoAnterior: 2 } } });
    app.filasTransformacionDe = (row) => row.id === 'arroz' ? [app.filaReal('pollo_olla')] : [];
    app.abrirEditarStockFila(app.filaReal('arroz'));
    expect(app.editarStock.grupo).toBe(true);
    app.editarStock.lineas[0].crudo = 4;
    app.editarStock.lineas[1].pecho.crudo = 3;
    app.editarStock.lineas[1].pierna.cocido = 6;
    expect(app.totalEditar()).toBe(13);
    await app.guardarModalStock();
    expect(app.stockCuadro('arroz', 'crudo')).toBe(4);
    expect(app.stockOctavoPlato('pollo_olla', 'pechugas', 'crudo')).toBe(3);
    expect(app.stockOctavoPlato('pollo_olla', 'piernas', 'cocido')).toBe(6);
});

test('un motivo de 200 caracteres conserva las marcas dentro del límite del modelo', async () => {
    const { app, guardados } = escenario({ saldos: { arroz_con_pollo: { saldoAnterior: 100, saldoAnteriorCocido: 80 } } });
    app.abrirEditarStock('arroz_con_pollo');
    const linea = app.editarStock.lineas[0];
    linea.pecho = { crudo: 3, cocido: 2 };
    linea.pierna = { crudo: 4, cocido: 5 };
    app.editarStock.motivo = 'Conteo de pecho y pierna '.repeat(10).slice(0, 200);
    expect(app.editarStock.motivo).toHaveLength(200);
    expect(await app.guardarModalStock()).toBe(true);
    expect(guardados.every((m) => m.motivo.length <= 200)).toBe(true);
    expect(guardados.every((m) => m.clase === 'regulacion' && m.motivo.startsWith('Ajuste de stock'))).toBe(true);
    for (const tipo of ['crudo', 'cocido']) {
        expect(guardados.filter((m) => m.tipoProducto === tipo).map((m) => m.motivo.split(' · ').pop())).toEqual(['pecho', 'pierna', 'sin separar']);
    }
    expect(app.stockOctavoPlato('arroz_con_pollo', 'pechugas', 'crudo')).toBe(3);
    expect(app.stockOctavoPlato('arroz_con_pollo', 'piernas', 'crudo')).toBe(4);
    expect(app.stockOctavoPlato('arroz_con_pollo', 'pechugas', 'cocido')).toBe(2);
    expect(app.stockOctavoPlato('arroz_con_pollo', 'piernas', 'cocido')).toBe(5);
});

test('30 pechos y 100 piernas se quedan enteros aunque el stock total sea otro', () => {
    const { app } = escenario({
        saldos: { octavo_pollo: { saldoAnterior: 180 } },
        movimientos: [
            ingreso('octavo_pollo', 'crudo', 30, 'pecho'),
            ingreso('octavo_pollo', 'crudo', 100, 'pierna')
        ]
    });
    expect(app.octavosStockCorte('pechugas')).toBe(30);
    expect(app.octavosStockCorte('piernas')).toBe(100);
});

test('pasar 10 piernas a arroz con pollo las saca del octavo y no duplica el corte', () => {
    const { app } = escenario({
        saldos: { octavo_pollo: { saldoAnterior: 130 } },
        movimientos: [
            ingreso('octavo_pollo', 'crudo', 30, 'pecho'),
            ingreso('octavo_pollo', 'crudo', 100, 'pierna'),
            ingreso('octavo_pollo', 'crudo', -130, 'sin separar')
        ]
    });
    expect(app.fijarOctavoPlato('arroz_con_pollo', 'piernas', 'crudo', 10)).toBe(true);
    expect(app.octavosStockCorte('pechugas')).toBe(30);
    expect(app.octavosStockCorte('piernas')).toBe(90);
    expect(app.stockOctavoPlato('arroz_con_pollo', 'piernas', 'crudo')).toBe(10);
    expect(app.stockOctavoPlato('arroz_con_pollo', 'pechugas', 'crudo')).toBe(0);
    expect(app.stockCuadro('octavo_pollo', 'crudo')).toBe(120);
    expect(app.fijarOctavoPlato('arroz_con_pollo', 'piernas', 'crudo', 10)).toBe(false);
    expect(app.octavosStockCorte('piernas')).toBe(90);
});

test('en la noche se ven los 30 pechos y 100 piernas anotados al empezar el día', () => {
    const { app } = escenario({ saldos: { octavo_pollo: { saldoAnterior: 130 } } });
    app.periodo = 'noche';
    app.movimientosPeriodo = [];
    app.movimientosOctavoDia = [
        ingreso('octavo_pollo', 'crudo', 30, 'pecho'),
        ingreso('octavo_pollo', 'crudo', 100, 'pierna'),
        ingreso('octavo_pollo', 'crudo', -130, 'sin separar')
    ];
    expect(app.octavosStockCorte('pechugas')).toBe(30);
    expect(app.octavosStockCorte('piernas')).toBe(100);
    expect(app.totalOctavosLibres()).toBe(130);
    expect(app.stockCuadro('octavo_pollo', 'crudo')).toBe(130);
});

test('en la noche una pierna que sale se resta del reparto de la mañana', () => {
    const { app } = escenario({ saldos: { octavo_pollo: { saldoAnterior: 130 } } });
    app.periodo = 'noche';
    app.movimientosPeriodo = [];
    app.movimientosOctavoDia = [
        ingreso('octavo_pollo', 'crudo', 30, 'pecho'),
        ingreso('octavo_pollo', 'crudo', 100, 'pierna'),
        ingreso('octavo_pollo', 'crudo', -130, 'sin separar')
    ];
    expect(app.fijarOctavoPlato('arroz_con_pollo', 'piernas', 'crudo', 10)).toBe(true);
    expect(app.octavosStockCorte('pechugas')).toBe(30);
    expect(app.octavosStockCorte('piernas')).toBe(90);
    expect(app.stockCuadro('octavo_pollo', 'crudo')).toBe(120);
});

test('la noche no duplica el reparto si la mañana ya tiene pecho y pierna', async () => {
    const { app } = escenario({ saldos: { octavo_pollo: { saldoAnterior: 130 } } });
    app.periodo = 'noche';
    app.movimientosOctavoDia = [
        ingreso('octavo_pollo', 'crudo', 30, 'pecho'),
        ingreso('octavo_pollo', 'crudo', 100, 'pierna'),
        ingreso('octavo_pollo', 'crudo', -130, 'sin separar')
    ];
    app.api = jest.fn();
    await app.asegurarRepartoOctavo();
    expect(app.paso).not.toHaveBeenCalled();
    expect(app.api).not.toHaveBeenCalled();
    expect(app.octavosStockCorte('pechugas')).toBe(30);
    expect(app.octavosStockCorte('piernas')).toBe(100);
});

test('la noche anota el reparto de ayer a las 04:00 del día operativo', async () => {
    const { app, guardados } = escenario({ saldos: { octavo_pollo: { saldoAnterior: 130 } } });
    app.periodo = 'noche';
    app.movimientosPeriodo = [];
    app.movimientosOctavoDia = [];
    app.fechaHoy = () => '2026-11-17';
    app.api = jest.fn(async () => ({
        movimientos: [
            ingreso('octavo_pollo', 'crudo', 30, 'pecho'),
            ingreso('octavo_pollo', 'crudo', 100, 'pierna')
        ]
    }));
    const fechas = [];
    app.paso = jest.fn(async (rubro, tipoProducto, cantidad, motivo, clase, nombre, fecha) => {
        fechas.push(fecha);
        guardados.push({ rubro, tipoProducto, cantidad, motivo, clase });
    });
    await app.asegurarRepartoOctavo();
    expect(fechas).toEqual([
        '2026-11-17T04:00:01-05:00',
        '2026-11-17T04:00:01-05:00',
        '2026-11-17T04:00:01-05:00'
    ]);
    expect(guardados.map((m) => [m.cantidad, m.motivo.split(' · ').pop()])).toEqual([
        [30, 'pecho'],
        [100, 'pierna'],
        [-130, 'sin separar']
    ]);
});

test('separar en Personal no entra a ventas hasta pulsar Descarga, y solo baja octavo', async () => {
    const { app } = escenario({
        movimientos: [ingreso('octavo_pollo', 'crudo', 20, 'pierna'), ingreso('octavo_pollo', 'crudo', 10, 'pecho')]
    });
    const octavo = app.filaReal('octavo_pollo');
    expect(app.fijarOctavoDestino('personal', 'piernas', 5)).toBe(true);
    expect(app.octavosEnDestino('personal', 'piernas')).toBe(5);
    expect(app.octavosSeparadosSector('personal')).toBe(5);
    expect(Number(octavo.venta) || 0).toBe(0);
    expect(app.ventaComandasCocido(octavo)).toBe(0);
    expect(app.ventaEnRojo(octavo)).toBe(false);
    expect(app.movimientosPeriodo.some((m) => String(m.motivo || '').indexOf('Venta manual') === 0)).toBe(false);

    expect(app.descargarSectorOctavo(app.destinosOctavoExtra().find((d) => d.id === 'personal'))).toBe(true);
    expect(app.octavosSeparadosSector('personal')).toBe(0);
    expect(app.octavosEnDestino('personal', 'piernas')).toBe(5);
    expect(Number(octavo.venta) || 0).toBe(5);
    expect(app.ventaComandasCocido(octavo)).toBe(5);
    expect(app.ventaEnRojo(octavo)).toBe(false);
    const ventas = app.movimientosPeriodo.filter((m) => m.clase === 'egreso');
    expect(ventas.length).toBe(1);
    expect(ventas[0].rubro).toBe('octavo_pollo');
    expect(ventas[0].motivo).toBe('Venta manual · Personal · pierna');
    await app._colaTransformar;
});

test('una descarga manual ya hecha sigue en rojo y una separación nueva no la aumenta', () => {
    const { app } = escenario({
        movimientos: [
            ingreso('octavo_pollo', 'crudo', 100, 'pierna'),
            { rubro: 'octavo_pollo', tipoProducto: 'crudo', cantidad: 80, clase: 'egreso', motivo: 'Venta manual · Personal · pierna' }
        ]
    });
    const octavo = app.filaReal('octavo_pollo');
    expect(app.octavosEnDestino('personal', 'piernas')).toBe(80);
    expect(app.ventaComandasCocido(octavo)).toBe(80);
    expect(app.ventaEnRojo(octavo)).toBe(false);
    expect(app.fijarOctavoDestino('personal', 'piernas', 81)).toBe(true);
    expect(Number(octavo.venta) || 0).toBe(80);
    expect(app.octavosSeparadosSector('personal')).toBe(1);
    expect(app.ventaEnRojo({ id: 'pierna', nombre: 'Pierna de pollo', venta: 1 })).toBe(true);
    expect(app.ventaEnRojo({ id: 'helados', nombre: 'Helados', venta: 80 })).toBe(true);
    expect(app.ventaEnRojo({ id: 'helados', nombre: 'Helados', ingreso: 100, venta: 1 })).toBe(false);
    expect(app.ventaEnRojo({ id: 'arroz', nombre: 'Arroz', tieneCocido: true, ingresoCocido: 10, ventaCocido: 1 })).toBe(false);
});

test('el saldo de pieza de panceta es el que se editó y no suma el chancho', () => {
    const window = {};
    const crearApp = vm.runInNewContext('(' + factoryCode.trim() + ')', { window: window, setTimeout, clearTimeout });
    const app = crearApp();
    const pieza = { id: 'trozo_panceta', nombre: 'Pieza de panceta', soloCocido: true, tieneCocido: false, saldoAnterior: 0, saldoAnteriorCocido: 11, ingresoCocido: 22, ventaCocido: 22 };
    const bbq = { id: 'chancho_lena_bbq', nombre: 'Chancho a la leña BBQ', tieneCocido: false, saldoAnterior: 9 };
    app.filaReal = (id) => (id === 'trozo_panceta' ? pieza : (id === 'chancho_lena_bbq' ? bbq : null));
    app.platosDirectosDe = (id) => (id === 'trozo_panceta' ? [{ id: 'chancho_lena_bbq', plato: true }] : []);
    expect(app.saldoColumna(pieza)).toBe(11);
    expect(app.saldoRealColumna(pieza)).toBe(11);
    expect(app.ingresoTotalColumna(pieza)).toBe(33);
    app.periodo = 'noche';
    app.fechaHoy = () => '2026-11-17';
    app.ymdOperativo = () => '2026-11-17';
    window.TurnosDiaNoche = { esSegmento: (id) => id === 'noche' || id === 'dia', rangoDe: () => ({ desde: '2026-11-17T22:44:57.000Z', hasta: '2026-11-18T08:59:59.000Z' }) };
    expect(app.rangoDe('noche')).toEqual({ desde: '2026-11-17', hasta: '2026-11-17' });
    expect(app.fechaSaldoAnterior()).toBe('2026-11-17T04:00:00-05:00');
});

test('el saldo anterior de pieza de panceta no suma el stock de sus platos', () => {
    const crearApp = vm.runInNewContext('(' + factoryCode.trim() + ')', { window: {}, setTimeout, clearTimeout });
    const app = crearApp();
    const pieza = { id: 'trozo_panceta', nombre: 'Pieza de panceta', soloCocido: true, tieneCocido: false, saldoAnterior: 0, saldoAnteriorCocido: 11 };
    const bbq = { id: 'chancho_lena_bbq', nombre: 'Chancho a la leña BBQ', tieneCocido: false, saldoAnterior: 9, ingreso: 4 };
    app.filasTransformacionDe = (row) => row.id === 'trozo_panceta' ? [bbq] : [];
    expect(app.saldoAnteriorColumna(pieza)).toBe(11);
    expect(app.saldoAnteriorColumnaTipo(pieza, 'cocido')).toBe(11);
});
