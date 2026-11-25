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

function escenario(iniciales) {
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const app = vm.runInNewContext('(' + code.trim() + ')', {
        window: {}, localStorage: storage, sessionStorage: storage, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0
    })();
    app.$nextTick = (fn) => fn && fn();
    app.restaurarEjemploDespiece(true);
    app.vaciarNumeros();
    app.aplicarOpcionesCocido([]);
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
        const libro = armarLibro({ movimientos: guardados, ventas: [], desde: b.inicio, hasta: b.fin });
        app.movimientosPeriodo = plain(guardados.filter((m) => new Date(m.fecha) >= b.inicio && new Date(m.fecha) <= b.fin));
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
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(9);
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
    expect(await app.cuadroOctavoPlato('arroz_con_pollo', 'piernas', 'crudo', input(2))).toBe(true);
    const libro = recargar();
    expect(app.stockOctavoPlato('arroz_con_pollo', 'piernas', 'crudo')).toBe(2);
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
    ]);
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
    ]);
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
