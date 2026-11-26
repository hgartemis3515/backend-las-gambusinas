const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { armarLibro } = require('../src/utils/inventarioLibro');
const { boundsDiaOperativo } = require('../src/utils/diaOperativoRestaurante');

const html = fs.readFileSync(path.join(__dirname, '../public/inventario.html'), 'utf8');
const code = html.slice(html.indexOf('function inventarioApp()'), html.lastIndexOf('</script>'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const DIA = '2026-11-18';
const fecha = `${DIA}T12:00:00-05:00`;
const input = (v) => ({ value: String(v), dataset: {}, style: { setProperty: () => {} } });

function escenario(iniciales, window = {}, opciones = {}) {
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const app = vm.runInNewContext('(' + code.trim() + ')', {
        window, localStorage: storage, sessionStorage: storage, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0
    })();
    app.$nextTick = (fn) => fn && fn();
    app.restaurarEjemploDespiece(true);
    app.vaciarNumeros();
    app.aplicarOpcionesCocido(Object.entries(opciones).map(([clave, opcion]) => ({ clave, ...opcion })));
    app.pulseRowTotal = () => {};
    app.productoBloqueado = () => false;
    app.activeTab = 'transformar';
    const ymdReal = app.ymdOperativo.bind(app);
    app.ymdOperativo = (f) => (f ? ymdReal(f) : DIA);
    app.fechaHoy = () => DIA;
    app.rangoVista = () => ({ desde: DIA, hasta: DIA });
    app.rangoPeriodo = app.rangoVista;
    app.rangoPeriodoTransformar = app.rangoVista;
    const guardados = iniciales.map(([rubro, cantidad, motivo, tipoProducto, fechaInicial]) => ({
        rubro, cantidad, clase: 'ingreso', tipoProducto: tipoProducto || 'crudo', motivo: motivo || 'Ingreso inicial', fecha: fechaInicial || `${DIA}T10:00:00-05:00`
    }));
    const recargar = () => {
        const b = boundsDiaOperativo(DIA);
        const libro = armarLibro({ movimientos: guardados, ventas: [], opciones, desde: b.inicio, hasta: b.fin });
        app.movimientosPeriodo = plain(guardados.filter((m) => new Date(m.fecha) >= b.inicio && new Date(m.fecha) <= b.fin));
        app._movimientosRangoKardex = app.queryRango(app.rangoVista());
        app.movimientosTurno = app.movimientosPeriodo.slice();
        app.ventasPeriodo = libro.ventas;
        app.aplicarKardex(libro.filas, app.movimientosPeriodo, libro.ventas);
        return libro;
    };
    app.encolarMovimientos = (movs) => guardados.push(...plain(movs).map((m) => ({ ...m, fecha })));
    recargar();
    const nuevos = () => guardados.slice(iniciales.length);
    return { app, guardados, recargar, nuevos };
}

const base = [['pechuga-pollo', 10], ['pierna-pollo', 10]];

test('el historial de salida de Pecho conserva sus pases por destino y descuenta la devolución', () => {
    const { app, nuevos } = escenario([
        ['pechuga-pollo', 120, 'Ingreso inicial'],
        ['pechuga-pollo', 20, 'Sale de Pollo fresco'],
        ['pechuga-pollo', -9, 'Ajuste de stock crudo'],
        ['pechuga-pollo', -60, 'Pasa a Filete de pollo', 'crudo', `${DIA}T11:00:00-05:00`],
        ['pechuga-pollo', -10, 'Pasa a Filete de pollo', 'crudo', `${DIA}T11:30:00-05:00`],
        ['pechuga-pollo', -30, 'Pasa a Pecho a la Leña', 'crudo', `${DIA}T12:00:00-05:00`],
        ['pechuga-pollo', 4, 'Pasa a Filete de pollo', 'crudo', `${DIA}T13:00:00-05:00`],
        ['filete', -3, 'Pasa a Filete de pollo']
    ]);
    const saldo = app.stockCuadro('pechuga', 'crudo');
    const salida = app.resumenSalidaProducto('pechuga');

    expect(salida).toMatchObject({ id: 'pechuga', total: 96 });
    expect(app.cantidadSalidaTransformar(salida.total)).toBe('−96');
    expect(salida.grupos.map(({ destino, total, movimientos }) => [destino, total, movimientos.map((m) => m.cantidad)]))
        .toEqual([['Filete de pollo', 66, [-4, 10, 60]], ['Pecho a la Leña', 30, [30]]]);
    expect(app.resumenSalidaProducto('filete')).toBeNull();
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(saldo);
    expect(nuevos()).toHaveLength(0);
});

test('el historial usa el día o turno de Transformar y espera los movimientos del período elegido', () => {
    const ayer = '2026-11-17';
    const turno = {
        dia: { desde: `${DIA}T04:00:00-05:00`, hasta: `${DIA}T16:59:59.999-05:00` },
        noche: { desde: `${DIA}T17:00:00-05:00`, hasta: '2026-11-19T03:59:59.999-05:00' }
    };
    const { app, guardados } = escenario([
        ['pechuga-pollo', -8, 'Pasa a Filete de pollo', 'crudo', `${ayer}T14:00:00-05:00`],
        ['pechuga-pollo', -5, 'Pasa a Filete de pollo', 'crudo', `${DIA}T16:59:59.999-05:00`],
        ['pechuga-pollo', -3, 'Pasa a Pecho a la Leña', 'crudo', `${DIA}T17:00:00-05:00`],
        ['pechuga-pollo', -1, 'Pasa a Pecho a la Leña', 'crudo', '2026-11-19T03:59:59.999-05:00']
    ], {
        TurnosDiaNoche: {
            esSegmento: (periodo) => Boolean(turno[periodo]),
            rangoDe: (periodo) => turno[periodo],
            addDaysYMD: (ymd) => new Date(Date.parse(ymd) + 86400000).toISOString().slice(0, 10)
        }
    });
    app.periodo = 'ayer';
    app.rangoPeriodoTransformar = () => {
        const dia = app.periodoTransformar === 'ayer' ? ayer : DIA;
        return { desde: dia, hasta: dia };
    };

    app.periodoTransformar = 'dia';
    expect(app.resumenSalidaProducto('pechuga')).toMatchObject({ total: 5 });
    app.periodoTransformar = 'noche';
    expect(app.resumenSalidaProducto('pechuga')).toMatchObject({ total: 4 });
    app.periodoTransformar = 'ayer';
    expect(app.resumenSalidaProducto('pechuga')).toBeNull();

    app.movimientosPeriodo = plain(guardados);
    app._movimientosRangoKardex = app.queryRango(app.rangoPeriodoTransformar());
    expect(app.resumenSalidaProducto('pechuga')).toMatchObject({ total: 8 });
});

test('el historial cuenta una sola salida por cocción y omite pases anulados', () => {
    const { app } = escenario([['pollo-lena', 20], ['pollo-lena', 10, 'Ingreso cocido', 'cocido']]);
    const pase = (paseId, tipoProducto, cantidad, motivo, atributos = {}) => ({
        rubro: 'pollo-lena', clase: 'ingreso', fecha, paseId, paseDestino: 'cocido', tipoProducto, cantidad, motivo, ...atributos
    });
    app.movimientosPeriodo = app.movimientosPeriodo.concat([
        pase('vigente', 'crudo', -5, 'Pasa a cocido Pecho a la Leña'),
        pase('vigente', 'cocido', 5, 'Pasa de crudo Pecho a la Leña'),
        pase('anulado', 'crudo', -3, 'Pasa a cocido Pecho a la Leña', { paseRevertido: true }),
        pase('anulado', 'cocido', 3, 'Pasa de crudo Pecho a la Leña', { paseRevertido: true }),
        pase(undefined, 'crudo', 3, 'Pasa de cocido Pecho a la Leña', { reviertePase: 'anulado' }),
        pase(undefined, 'cocido', -3, 'Pasa a crudo Pecho a la Leña', { reviertePase: 'anulado' }),
        pase(undefined, 'crudo', -2, 'Cocido desde crudo Pecho a la Leña')
    ]);

    const salida = app.resumenSalidaProducto('pollo_lena');
    expect(salida).toMatchObject({ total: 7 });
    expect(salida.grupos).toMatchObject([{ destino: 'Cocido', origen: 'Crudo', total: 7 }]);
    expect(salida.grupos[0].movimientos.map((m) => m.cantidad)).toEqual([5, 2]);
});

test('subir el crudo de Pecho a la leña resta Pecho de pollo y no crea un ingreso', async () => {
    const { app, recargar, nuevos } = escenario(base);
    const el = input(1);
    expect(await app.cuadroHijo('pechuga', 'pollo_lena', 'crudo', el)).toBe(true);
    expect(el.value).toBe('1');
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(9);
    expect(nuevos().some((m) => /independiente/.test(m.motivo))).toBe(false);
    const libro = recargar();
    expect(app.stockCuadro('pollo_lena', 'crudo')).toBe(1);
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(9);
    const pecho = libro.filas.find((f) => f.rubro === 'pechuga-pollo' && f.tipoProducto === 'crudo');
    expect(pecho).toMatchObject({ transformacion: 1, queda: 9 });
});

test.each([['pechugas', 'pechuga'], ['piernas', 'pierna']])('cada plato de %s resta su pieza de origen', async (corte, padre) => {
    const { app, recargar } = escenario(base);
    const platos = app.aderezosDeCorte(corte);
    expect(platos.length).toBeGreaterThan(0);
    for (const ad of platos) expect(await app.cuadroHijo(padre, ad.id, 'crudo', input(1))).toBe(true);
    recargar();
    expect(app.stockCuadro(padre, 'crudo')).toBe(10 - platos.length);
    platos.forEach((ad) => {
        const tipo = app.filaReal(ad.id).soloCocido ? 'cocido' : 'crudo';
        expect(app.stockCuadro(ad.id, tipo)).toBe(1);
    });
});

test('el transformado de Pecho incluye el sandwich aunque el pase haya quedado solo en el destino', () => {
    const { app } = escenario([
        ['pechuga-pollo', 22, 'Ingreso inicial'],
        ['pechuga-pollo', -20, 'Pasa a Filete de pollo'],
        ['filete', 20, 'Sale de Pecho de Pollo'],
        ['sandwiches', 2, 'Sale de Pecho de Pollo', 'cocido']
    ]);
    const pecho = app.filaReal('pechuga');
    expect(app.valorTipo(pecho, 'ingreso', 'crudo')).toBe(22);
    expect(app.valorTipo(pecho, 'transformacion', 'crudo')).toBe(22);
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(0);
    const salida = app.resumenSalidaProducto('pechuga');
    expect(salida.total).toBe(22);
    expect(salida.grupos.map((g) => [g.destino, g.total])).toEqual(expect.arrayContaining([['Sandwich', 2]]));
});

test('un pase de filete ya anotado en el pecho no se vuelve a sumar', () => {
    const { app } = escenario([
        ['pechuga-pollo', 10, 'Ingreso inicial'],
        ['pechuga-pollo', -4, 'Pasa a Filete de pollo'],
        ['filete', 4, 'Sale de Pecho de Pollo']
    ]);
    const pecho = app.filaReal('pechuga');
    expect(app.valorTipo(pecho, 'transformacion', 'crudo')).toBe(4);
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(6);
});

test('transformar 10 pollos o patos deja esos 10 en 0 si la opción de Tabla está marcada', () => {
    const { app } = escenario([
        ['pollo-origen', 10, 'Ingreso inicial'],
        ['pechuga-pollo', 20, 'Sale de Pollo fresco'],
        ['pierna-pollo', 20, 'Sale de Pollo fresco'],
        ['pato', 10, 'Ingreso inicial'],
        ['pechuga-pato', 20, 'Sale de Pato fresco'],
        ['pierna-pato', 20, 'Sale de Pato fresco']
    ]);
    expect(app.frescoTransformadoEnCero).toBe(true);
    expect(app.stockCuadro('pollo_fresco', 'crudo')).toBe(0);
    expect(app.valorTipo(app.filaReal('pollo_fresco'), 'transformacion', 'crudo')).toBe(10);
    expect(app.stockCuadro('pato_fresco', 'crudo')).toBe(0);
    expect(app.valorTipo(app.filaReal('pato_fresco'), 'transformacion', 'crudo')).toBe(10);

    app.setFrescoTransformadoEnCero(false);
    expect(app.stockCuadro('pollo_fresco', 'crudo')).toBe(10);
    expect(app.stockCuadro('pato_fresco', 'crudo')).toBe(10);
    expect(app.valorTipo(app.filaReal('pollo_fresco'), 'transformacion', 'crudo')).toBe(0);
});

test('transformar Pecho de Pollo en Sandwich alimenta la única caja de cocido', async () => {
    const { app, recargar, nuevos } = escenario([['pechuga-pollo', 10], ['sandwiches', 2, 'Sale de Pecho de Pollo']]);
    const clave = 'hijo|pechuga|sandwich';
    expect(app.formulaTransformar(clave)).toMatchObject({ stock: 0, transformado: 2 });
    expect(await app.formulaTransformar(clave).fijar(1)).toBe(true);
    expect(nuevos()).toEqual(expect.arrayContaining([
        expect.objectContaining({ rubro: 'sandwiches', tipoProducto: 'cocido', cantidad: 1 })
    ]));
    recargar();
    expect(app.formulaTransformar(clave)).toMatchObject({ stock: 0, transformado: 3 });
    expect(app.stockCuadro('sandwich', 'crudo')).toBe(0);
    expect(app.stockCuadro('sandwich', 'cocido')).toBe(3);
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(7);
});

test('bajar el cuadro devuelve la pieza a su origen', async () => {
    const { app, recargar } = escenario(base);
    await app.cuadroHijo('pechuga', 'pollo_lena', 'crudo', input(3));
    await app.cuadroHijo('pechuga', 'pollo_lena', 'crudo', input(1));
    recargar();
    expect(app.stockCuadro('pollo_lena', 'crudo')).toBe(1);
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(9);
});

test('sin stock en el origen no pasa nada y la caja vuelve al stock real', async () => {
    const { app, nuevos } = escenario([['pechuga-pollo', 1]]);
    const el = input(5);
    expect(await app.cuadroHijo('pechuga', 'pollo_lena', 'crudo', el)).toBe(false);
    expect(el.value).toBe('0');
    expect(nuevos()).toHaveLength(0);
    expect(app.transformWarning).toMatch(/Pecho/);
});

test('una caja vacía no cambia nada', async () => {
    const { app, nuevos } = escenario(base);
    await app.cuadroHijo('pechuga', 'pollo_lena', 'crudo', input(2));
    const cuantos = nuevos().length;
    const el = input('');
    expect(await app.cuadroHijo('pechuga', 'pollo_lena', 'crudo', el)).toBe(false);
    expect(el.value).toBe('2');
    expect(nuevos()).toHaveLength(cuantos);
});

test('el crudo pasa a cocido dentro del mismo plato, sin tocar la pieza', async () => {
    const { app, recargar } = escenario(base);
    await app.cuadroHijo('pechuga', 'pollo_lena', 'crudo', input(2));
    expect(await app.cuadroHijo('pechuga', 'pollo_lena', 'cocido', input(1))).toBe(true);
    recargar();
    expect(app.stockCuadro('pollo_lena', 'crudo')).toBe(1);
    expect(app.stockCuadro('pollo_lena', 'cocido')).toBe(1);
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(8);
});

test('Filete resta Pecho según su factor, y cada plato resta Filete según lo que come', async () => {
    const { app, recargar } = escenario(base);
    const factor = Number(app.config.factorFiletesPorPechuga) || 1;
    await app.cuadroFilete(input(factor * 2));
    recargar();
    expect(app.stockCuadro('filete', 'crudo')).toBe(factor * 2);
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(8);
    app.platosDelFilete = () => [{ id: 'milanesa', nombre: 'Milanesa', cantidad: 2 }];
    expect(await app.cuadroPlatoFilete('milanesa', input(1))).toBe(true);
    recargar();
    expect(app.stockCuadro('filete', 'crudo')).toBe(factor * 2 - 2);
    expect(app.crudoVisibleTotal('milanesa')).toBe(1);
});

test('los octavos restan su pieza, y platos y sectores restan el octavo de ese corte', async () => {
    const { app, recargar } = escenario(base);
    expect(await app.cuadroOctavos('piernas', input(6))).toBe(true);
    recargar();
    expect(app.octavosStockCorte('piernas')).toBe(6);
    expect(app.stockCuadro('pierna', 'crudo')).toBe(7);
    expect(await app.cuadroOctavoPlato('arroz_con_pollo', 'piernas', 'cocido', input(2))).toBe(true);
    const libro = recargar();
    expect(app.stockOctavoPlato('arroz_con_pollo', 'piernas', 'cocido')).toBe(2);
    expect(app.octavosStockCorte('piernas')).toBe(4);
    expect(libro.filas.find((f) => f.rubro === 'octavo-pollo' && f.tipoProducto === 'crudo').cortes.queda.pierna).toBe(4);
    expect(app.origenIngresoDe(app.filaReal('arroz_con_pollo')).transformado).toBe(2);
    expect(await app.cuadroOctavoDestino('beata', 'piernas', input(1))).toBe(true);
    recargar();
    expect(app.octavosEnDestino('beata', 'piernas')).toBe(1);
    expect(app.octavosStockCorte('piernas')).toBe(3);
});

test.each([
    ['caldo_pollo', 'caldo-pollo'],
    ['pollo_olla', 'pollo-olla'],
    ['arroz_con_pollo', 'arroz-pollo']
])('%s mueve crudo y cocido del mismo corte, incluso con saldo de ayer', async (id, rubro) => {
    const ayer = '2026-11-17T11:00:00-05:00';
    const { app, recargar, nuevos } = escenario([
        [rubro, 5, 'Ingreso independiente crudo · pecho', 'crudo', ayer],
        [rubro, 3, 'Ingreso independiente crudo · pierna', 'crudo', ayer]
    ], {}, { [rubro]: { soloCocido: false, tieneCocido: true } });
    const crudo = (corte) => app.stockOctavoPlato(id, corte, 'crudo');
    const cocido = (corte) => app.stockOctavoPlato(id, corte, 'cocido');
    const mover = (corte, objetivo) => app.cuadroOctavoPlato(id, corte, 'cocido', input(objetivo));
    expect(app.movimientosPeriodo).toHaveLength(0);
    expect([crudo('pechugas'), crudo('piernas')]).toEqual([5, 3]);

    expect(await mover('pechugas', 3)).toBe(true);
    expect([crudo('pechugas'), cocido('pechugas'), crudo('piernas')]).toEqual([2, 3, 3]);
    recargar();
    expect(await mover('pechugas', 4)).toBe(true);
    expect([crudo('pechugas'), cocido('pechugas'), crudo('piernas')]).toEqual([1, 4, 3]);
    expect(await mover('pechugas', 6)).toBe(false);
    expect(await mover('piernas', 2)).toBe(true);
    expect(await mover('pechugas', 1)).toBe(true);
    const libro = recargar();
    expect([crudo('pechugas'), crudo('piernas'), cocido('pechugas'), cocido('piernas')]).toEqual([4, 1, 1, 2]);
    expect(libro.filas.filter((f) => f.rubro === rubro).map((f) => [f.tipoProducto, f.queda])).toEqual([['crudo', 5], ['cocido', 3]]);
    expect(nuevos()).toHaveLength(4);
    expect(nuevos().every((m) => m.paseTipo && m.cantidad > 0 && m.rubro === rubro && / · (pecho|pierna)$/.test(m.motivo))).toBe(true);
});

test('el crudo sin marca sigue disponible al lado de las entradas marcadas de pecho', async () => {
    const { app, recargar } = escenario([
        ['caldo-pollo', 3],
        ['caldo-pollo', 2, 'Ingreso independiente crudo · pecho']
    ], {}, { 'caldo-pollo': { soloCocido: false, tieneCocido: true } });
    expect(await app.cuadroOctavoPlato('caldo_pollo', 'piernas', 'cocido', input(3))).toBe(true);
    recargar();
    expect(app.stockOctavoPlato('caldo_pollo', 'pechugas', 'crudo')).toBe(2);
    expect(app.stockOctavoPlato('caldo_pollo', 'piernas', 'crudo')).toBe(0);
    expect(app.stockOctavoPlato('caldo_pollo', 'piernas', 'cocido')).toBe(3);
});

test('Pollo pachamanca resta Pierna también desde su tarjeta de Pachamancas', async () => {
    const { app, recargar } = escenario(base);
    await app.cuadroPachamanca('pollo_pachamanca', 'crudo', input(2));
    recargar();
    expect(app.stockCuadro('pierna', 'crudo')).toBe(8);
});

test('el icono de Ingreso sigue siendo independiente: no resta la pieza', () => {
    const { app, recargar } = escenario(base);
    expect(app.registrarIngresoDirecto('pollo_lena', 'crudo', input(3))).toBe(true);
    recargar();
    expect(app.stockCuadro('pollo_lena', 'crudo')).toBe(3);
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(10);
});

test('en el mapa de pollo solo Pollo fresco, Pecho y Pierna guardan su stock sin origen que restar', () => {
    const texto = html.replace(/\r\n/g, '\n');
    const ini = texto.indexOf('1. MAPA SEMÁNTICO HORIZONTAL — FAMILIA POLLO FRESCO');
    const fin = texto.indexOf('MAPAS DEL EDITOR: PATO FRESCO', ini);
    const usos = texto.slice(ini, fin).match(/@change="fijarStockConIngreso\([^"]+"/g);
    expect(usos.map((u) => u.match(/\('([a-z_]+)'/)[1])).toEqual(['pollo_fresco', 'pechuga', 'pierna']);
    expect(texto.slice(ini, fin)).not.toContain("formulaTransformar('pollo|");
});

describe.each([['pollo_baby', 'pollo-baby'], ['seco_carnero', 'seco-cordero']])('cuadro de cocido de %s', (id, rubro) => {
    test('subir gasta crudo, bajar lo devuelve y el total no cambia', async () => {
        const { app, recargar, nuevos } = escenario([[rubro, 10]]);
        const el = input(4);
        expect(await app.cuadroPaseCocido(id, el)).toBe(true);
        expect(el.value).toBe('4');
        expect(app.stockCuadro(id, 'crudo')).toBe(6);
        expect(nuevos().some((m) => /independiente/.test(m.motivo))).toBe(false);
        recargar();
        expect(app.stockCuadro(id, 'crudo')).toBe(6);
        expect(app.stockCuadro(id, 'cocido')).toBe(4);
        await app.cuadroPaseCocido(id, input(1));
        recargar();
        expect(app.stockCuadro(id, 'crudo')).toBe(9);
        expect(app.stockCuadro(id, 'cocido')).toBe(1);
    });

    test('sin crudo suficiente no pasa nada y la caja vuelve al stock real', async () => {
        const { app, nuevos } = escenario([[rubro, 2]]);
        const el = input(5);
        expect(await app.cuadroPaseCocido(id, el)).toBe(false);
        expect(el.value).toBe('0');
        expect(nuevos()).toHaveLength(0);
    });

    test('el icono de Ingreso de cocido sigue sin gastar crudo', () => {
        const { app, recargar } = escenario([[rubro, 10]]);
        expect(app.registrarIngresoDirecto(id, 'cocido', input(3))).toBe(true);
        recargar();
        expect(app.stockCuadro(id, 'crudo')).toBe(10);
        expect(app.stockCuadro(id, 'cocido')).toBe(3);
    });
});

describe.each([['pechuga_pato', 'pechuga-pato'], ['pierna_pato', 'pierna-pato']])('cuadro de cocido de %s en el mapa de pato', (id, rubro) => {
    const conCocido = () => {
        const e = escenario([[rubro, 20]]);
        e.app.aplicarOpcionesCocido([{ clave: 'pechuga-pato', tieneCocido: true }, { clave: 'pierna-pato', tieneCocido: true }]);
        e.recargar();
        return e;
    };

    test('el cuadro cocido del mapa de pato pasa desde crudo', () => {
        const texto = html.replace(/\r\n/g, '\n');
        const ini = texto.indexOf('MAPAS DEL EDITOR: PATO FRESCO');
        const fin = texto.indexOf('<!-- RAMA DE PLATOS', ini);
        expect(texto.slice(ini, fin)).toContain(`cuadroFormulaTransformar('cocido|' + idDeClave(rama.corte.clave), $event.target)`);
    });

    test('20 crudos y 4 a cocido dejan 16 crudos y 4 cocidos', async () => {
        const { app, recargar, nuevos } = conCocido();
        expect(app.tienePaseCocido(id)).toBe(true);
        const el = input(4);
        expect(await app.cuadroPaseCocido(id, el)).toBe(true);
        expect(el.value).toBe('4');
        expect(app.stockCuadro(id, 'crudo')).toBe(16);
        expect(nuevos().some((m) => /independiente/.test(m.motivo))).toBe(false);
        recargar();
        expect(app.stockCuadro(id, 'crudo')).toBe(16);
        expect(app.stockCuadro(id, 'cocido')).toBe(4);
    });
});

test('los cuadros de Transformar llevan el botón DM junto al Kardex y abren la descarga manual', () => {
    const texto = html.replace(/\r\n/g, '\n');
    const ini = texto.indexOf('<template x-ref="accesosCuadroStock">');
    const plantilla = texto.slice(ini, texto.indexOf('</template>', ini));
    const kardex = plantilla.indexOf('btn-kardex-transformar');
    const dm = plantilla.indexOf('btn-dm-cuadro');
    expect(kardex).toBeGreaterThan(-1);
    expect(dm).toBeGreaterThan(kardex);
    expect(dm).toBeLessThan(plantilla.indexOf('btn-ir-inventario'));
    expect(plantilla).toContain('abrirVentaManual(filaReal(productoCuadro) || filaReal(familiaCuadro))');
    const { app } = escenario(base);
    app.abrirVentaManual(app.filaReal('pollo_lena'));
    expect(app.ventaManualAbierta).toBe(true);
    expect(app.ventaManualFila.id).toBe('pollo_lena');
});
