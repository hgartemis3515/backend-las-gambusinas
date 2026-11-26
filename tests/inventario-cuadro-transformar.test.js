const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { armarLibro } = require('../src/utils/inventarioLibro');
const { boundsDiaOperativo } = require('../src/utils/diaOperativoRestaurante');

// El cuadro reparte el saldo disponible entre Stock y las unidades transformadas que quedan.
const html = fs.readFileSync(path.join(__dirname, '../public/inventario.html'), 'utf8');
const code = html.slice(html.indexOf('function inventarioApp()'), html.lastIndexOf('</script>'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const DIA = '2026-11-18';
const fecha = `${DIA}T12:00:00-05:00`;
const input = (v) => ({ value: String(v), dataset: {}, style: { setProperty: () => {} } });

function escenario(iniciales, opciones = {}) {
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    class Event { constructor(type) { this.type = type; } }
    const app = vm.runInNewContext('(' + code.trim() + ')', {
        window: {}, localStorage: storage, sessionStorage: storage, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, Event
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
    app.fechaCierreVista = () => fecha;
    app.rangoVista = () => ({ desde: DIA, hasta: DIA });
    app.rangoPeriodo = app.rangoVista;
    app.rangoPeriodoTransformar = app.rangoVista;
    const clave = (id) => app.claveDeFila[id];
    const guardados = iniciales.map(([id, cantidad, motivo, tipoProducto]) => ({
        rubro: clave(id), cantidad, clase: 'ingreso', tipoProducto: tipoProducto || 'crudo', motivo: motivo || 'Ingreso inicial', fecha: `${DIA}T10:00:00-05:00`
    }));
    const recargar = () => {
        const b = boundsDiaOperativo(DIA);
        const libro = armarLibro({ movimientos: guardados, ventas: [], opciones, desde: b.inicio, hasta: b.fin });
        // Como el servidor al listar: el pase Crudo ↔ Cocido guardado trae también su salida.
        const otro = (t) => (t === 'cocido' ? 'crudo' : 'cocido');
        const visibles = guardados.flatMap((m) => (!m.paseTipo ? [m] : [m, {
            ...m, tipoProducto: otro(m.tipoProducto), cantidad: -m.cantidad, motivo: m.motivo.replace(/^Pasa de (?:crudo|cocido)/, 'Pasa a ' + m.tipoProducto)
        }]));
        app.movimientosPeriodo = plain(visibles.filter((m) => new Date(m.fecha) >= b.inicio && new Date(m.fecha) <= b.fin));
        app.movimientosTurno = app.movimientosPeriodo.slice();
        app.ventasPeriodo = libro.ventas;
        app.aplicarKardex(libro.filas, app.movimientosPeriodo, libro.ventas);
        return libro;
    };
    app.encolarMovimientos = (movs) => guardados.push(...plain(movs).map((m) => ({ ...m, fecha: m.fechaFija || fecha })));
    recargar();
    const formula = (k) => {
        const f = app.formulaTransformar(k);
        return { stock: f.stock, transformado: f.transformado };
    };
    return { app, guardados, recargar, formula, nuevos: () => guardados.slice(iniciales.length) };
}

const octavoBase = [['pierna', 40], ['octavo_pollo', 30, 'Ingreso independiente crudo · pierna']];

describe('Octavo de pollo', () => {
    test('30 de stock + 60 transformados = 90, y queda así en el período', async () => {
        const { app, recargar, formula } = escenario(octavoBase);
        expect(formula('octavo|piernas')).toEqual({ stock: 30, transformado: 0 });
        const el = input(60);
        expect(await app.cuadroFormulaTransformar('octavo|piernas', el)).toBe(true);
        expect(el.value).toBe('60');
        recargar();
        expect(formula('octavo|piernas')).toEqual({ stock: 30, transformado: 60 });
        expect(app.octavosStockCorte('piernas')).toBe(90);
        expect(app.stockCuadro('pierna', 'crudo')).toBe(10);
        expect(app.ingresoDirectoPeriodo('octavo_pollo', 'crudo', 'piernas')).toBe(30);
        expect(formula('octavo|pechugas')).toEqual({ stock: 0, transformado: 0 });
    });

    test('sin salidas, de 60 a 70 transforma 10 más y a 0 devuelve todo', async () => {
        const { app, recargar, formula, nuevos } = escenario(octavoBase);
        await app.cuadroFormulaTransformar('octavo|piernas', input(60));
        recargar();
        const antes = nuevos().length;
        await app.cuadroFormulaTransformar('octavo|piernas', input(70));
        expect(nuevos().slice(antes).find((m) => m.rubro === app.claveDeFila.octavo_pollo)).toMatchObject({ cantidad: 10 });
        recargar();
        expect(formula('octavo|piernas')).toEqual({ stock: 30, transformado: 70 });
        expect(app.stockCuadro('pierna', 'crudo')).toBe(5);
        await app.cuadroFormulaTransformar('octavo|piernas', input(0));
        recargar();
        expect(formula('octavo|piernas')).toEqual({ stock: 30, transformado: 0 });
        expect(app.stockCuadro('pierna', 'crudo')).toBe(40);
    });

    test('el Total es siempre el stock real: lo que sale a un plato baja el Stock', async () => {
        const { app, recargar, formula } = escenario(octavoBase);
        await app.cuadroFormulaTransformar('octavo|piernas', input(60));
        recargar();
        expect(await app.cuadroFormulaTransformar('platoOctavo|arroz_con_pollo|piernas|cocido', input(20))).toBe(true);
        recargar();
        expect(app.octavosStockCorte('piernas')).toBe(70);
        expect(formula('octavo|piernas')).toEqual({ stock: 10, transformado: 60 });
    });

    test.each(['beata', 'rio-lindo', 'eventos', 'personal'])('separar en %s reduce los dos sumandos por corte', async (sector) => {
        const { app, recargar, formula } = escenario([
            ['pechuga', 40], ['pierna', 40],
            ['octavo_pollo', 30, 'Ingreso independiente crudo · pecho'],
            ['octavo_pollo', 42, 'Ingreso independiente crudo · pierna']
        ]);
        await app.cuadroFormulaTransformar('octavo|pechugas', input(60));
        await app.cuadroFormulaTransformar('octavo|piernas', input(60));
        expect(formula('octavo|pechugas')).toEqual({ stock: 30, transformado: 60 });
        expect(formula('octavo|piernas')).toEqual({ stock: 42, transformado: 60 });

        expect(app.fijarOctavoDestino(sector, 'pechugas', 60)).toBe(true);
        expect(app.fijarOctavoDestino(sector, 'piernas', 60)).toBe(true);
        expect(formula('octavo|pechugas')).toEqual({ stock: 0, transformado: 30 });
        expect(formula('octavo|piernas')).toEqual({ stock: 0, transformado: 42 });
        recargar();
        expect(formula('octavo|pechugas')).toEqual({ stock: 0, transformado: 30 });
        expect(formula('octavo|piernas')).toEqual({ stock: 0, transformado: 42 });

        expect(app.fijarOctavoDestino(sector, 'pechugas', 0)).toBe(true);
        recargar();
        expect(formula('octavo|pechugas')).toEqual({ stock: 30, transformado: 60 });
        expect(formula('octavo|piernas')).toEqual({ stock: 0, transformado: 42 });
    });

    test('editar tras separar ajusta solo la diferencia respecto al saldo transformado visible', async () => {
        const { app, recargar, formula } = escenario(octavoBase);
        await app.cuadroFormulaTransformar('octavo|piernas', input(60));
        app.fijarOctavoDestino('beata', 'piernas', 60);
        recargar();

        const el = input(40);
        expect(await app.cuadroFormulaTransformar('octavo|piernas', el)).toBe(true);
        expect(el.value).toBe('40');
        recargar();
        expect(formula('octavo|piernas')).toEqual({ stock: 0, transformado: 40 });
        expect(app.stockCuadro('pierna', 'crudo')).toBe(5);

        expect(await app.cuadroFormulaTransformar('octavo|piernas', input(30))).toBe(true);
        recargar();
        expect(formula('octavo|piernas')).toEqual({ stock: 0, transformado: 30 });
        expect(app.stockCuadro('pierna', 'crudo')).toBe(10);
        expect(app.octavosEnDestino('beata', 'piernas')).toBe(60);
    });

    test('devuelve un saldo impar de octavos sin devolver lo que ya salió al sector', async () => {
        const { app, recargar, formula } = escenario(octavoBase);
        await app.cuadroFormulaTransformar('octavo|piernas', input(60));
        app.fijarOctavoDestino('beata', 'piernas', 61);
        recargar();
        expect(formula('octavo|piernas')).toEqual({ stock: 0, transformado: 29 });

        expect(await app.cuadroFormulaTransformar('octavo|piernas', input(0))).toBe(true);
        recargar();
        expect(formula('octavo|piernas')).toEqual({ stock: 0, transformado: 0 });
        expect(app.stockCuadro('pierna', 'crudo')).toBe(24.5);
        expect(app.octavosEnDestino('beata', 'piernas')).toBe(61);
    });

    test('sin piernas no pasa nada y la caja vuelve a lo transformado', async () => {
        const { app, formula, nuevos } = escenario([['pierna', 2]]);
        const el = input(60);
        expect(await app.cuadroFormulaTransformar('octavo|piernas', el)).toBe(false);
        expect(el.value).toBe('0');
        expect(nuevos()).toHaveLength(0);
        expect(formula('octavo|piernas')).toEqual({ stock: 0, transformado: 0 });
    });

    test('los platos del octavo pasan su crudo desde el octavo y su cocido desde el crudo', async () => {
        const { app, recargar, formula } = escenario([['octavo_pollo', 10, 'Ingreso independiente crudo · pierna']], {
            'arroz-pollo': { soloCocido: false, tieneCocido: true }
        });
        expect(await app.cuadroFormulaTransformar('platoOctavo|arroz_con_pollo|piernas|crudo', input(4))).toBe(true);
        recargar();
        expect(app.octavosStockCorte('piernas')).toBe(6);
        expect(formula('platoOctavo|arroz_con_pollo|piernas|crudo')).toEqual({ stock: 0, transformado: 4 });
        expect(await app.cuadroFormulaTransformar('platoOctavo|arroz_con_pollo|piernas|cocido', input(3))).toBe(true);
        recargar();
        expect(formula('platoOctavo|arroz_con_pollo|piernas|cocido')).toEqual({ stock: 0, transformado: 3 });
        expect(formula('platoOctavo|arroz_con_pollo|piernas|crudo')).toEqual({ stock: 0, transformado: 1 });
        expect(formula('platoOctavo|arroz_con_pollo|pechugas|crudo')).toEqual({ stock: 0, transformado: 0 });
    });

    test.each([
        ['arroz_con_pollo', 'Arroz con pollo'], ['pollo_olla', 'Pollo a la olla'], ['caldo_pollo', 'Caldo de pollo']
    ])('%s usa un cuadro cocido que recibe y devuelve el corte del octavo', async (id, nombre) => {
        const { app, recargar, formula, nuevos } = escenario([
            ['octavo_pollo', 10, 'Ingreso independiente crudo · pierna'],
            [id, 3, 'Ingreso independiente crudo · pierna'],
            [id, 2, 'Ingreso independiente cocido · pierna', 'cocido'],
            [id, 1, 'Ingreso independiente crudo · pecho']
        ]);
        const cocido = `platoOctavo|${id}|piernas|cocido`;
        expect(app.formulaTransformar(`platoOctavo|${id}|piernas|crudo`).fijar).toBeNull();
        expect(formula(cocido)).toEqual({ stock: 5, transformado: 0 });
        expect(await app.cuadroFormulaTransformar(cocido, input(4))).toBe(true);
        expect(app.octavosStockCorte('piernas')).toBe(6);
        expect(nuevos()).toEqual([
            expect.objectContaining({ rubro: 'octavo-pollo', cantidad: -4, tipoProducto: 'crudo', motivo: `Pasa a ${nombre} · pierna` }),
            expect.objectContaining({ rubro: app.claveDeFila[id], cantidad: 4, tipoProducto: 'cocido', motivo: 'Sale de Octavo de pollo · pierna' })
        ]);
        recargar();
        expect(formula(cocido)).toEqual({ stock: 5, transformado: 4 });
        expect(app.stockOctavoPlato(id, 'pechugas', 'cocido')).toBe(1);
        expect(app.platosIngresoOctavo(app.filaReal(id))[0]).toMatchObject({
            soloCocido: true, piernaCrudo: 0, piernaCocido: 9, pechoCrudo: 0, pechoCocido: 1
        });

        expect(await app.cuadroFormulaTransformar(cocido, input(0))).toBe(true);
        recargar();
        expect(formula(cocido)).toEqual({ stock: 5, transformado: 0 });
        expect(app.octavosStockCorte('piernas')).toBe(10);
    });
});

describe('Platos y piezas que salen de otra', () => {
    test('Pecho a la leña con 3: transformar 5 muestra 3 + 5 = 8, no 8 + 0', async () => {
        const { app, recargar, formula } = escenario([['pechuga', 10], ['pollo_lena', 3]]);
        expect(formula('hijo|pechuga|pollo_lena')).toEqual({ stock: 3, transformado: 0 });
        const el = input(5);
        expect(await app.cuadroFormulaTransformar('hijo|pechuga|pollo_lena', el)).toBe(true);
        expect(el.value).toBe('5');
        recargar();
        expect(formula('hijo|pechuga|pollo_lena')).toEqual({ stock: 3, transformado: 5 });
        expect(app.stockCuadro('pollo_lena', 'crudo')).toBe(8);
        expect(app.stockCuadro('pechuga', 'crudo')).toBe(5);
    });

    test('el Ingreso independiente sube el Stock, no Transformar', async () => {
        const { app, recargar, formula } = escenario([['pechuga', 10]]);
        await app.cuadroFormulaTransformar('hijo|pechuga|pollo_lena', input(3));
        expect(app.registrarIngresoDirecto('pollo_lena', 'crudo', input(2))).toBe(true);
        recargar();
        expect(formula('hijo|pechuga|pollo_lena')).toEqual({ stock: 2, transformado: 3 });
        expect(app.stockCuadro('pechuga', 'crudo')).toBe(7);
    });

    test('el cocido pasa desde el crudo y bajarlo a 0 lo devuelve', async () => {
        const { app, recargar, formula } = escenario([['pechuga', 10]]);
        await app.cuadroFormulaTransformar('hijo|pechuga|pollo_lena', input(3));
        recargar();
        expect(await app.cuadroFormulaTransformar('cocido|pollo_lena', input(2))).toBe(true);
        recargar();
        expect(formula('cocido|pollo_lena')).toEqual({ stock: 0, transformado: 2 });
        expect(app.stockCuadro('pollo_lena', 'crudo')).toBe(1);
        expect(await app.cuadroFormulaTransformar('cocido|pollo_lena', input(0))).toBe(true);
        recargar();
        expect(app.stockCuadro('pollo_lena', 'crudo')).toBe(3);
        expect(formula('cocido|pollo_lena')).toEqual({ stock: 0, transformado: 0 });
    });

    test.each([
        ['carne_pachamanca', 'pachamanca-res'],
        ['cerdo_pachamanca', 'pachamanca-chancho'],
        ['carnero_pachamanca', 'pachamanca-cordero']
    ])('el cocido de %s suma y devuelve el macerado sin gastar el cocido que ya tenía', async (id, rubro) => {
        const { app, recargar, formula } = escenario([
            [id, 8], [id, 3, 'Ingreso independiente cocido', 'cocido']
        ], { [rubro]: { soloCocido: false, tieneCocido: true } });
        const clave = `cocido|${id}`;
        expect(formula(clave)).toEqual({ stock: 3, transformado: 0 });
        expect(await app.cuadroFormulaTransformar(clave, input(5))).toBe(true);
        recargar();
        expect(formula(clave)).toEqual({ stock: 3, transformado: 5 });
        expect(app.stockCuadro(id, 'cocido')).toBe(8);
        expect(app.stockCuadro(id, 'crudo')).toBe(3);

        expect(await app.cuadroFormulaTransformar(clave, input(0))).toBe(true);
        recargar();
        expect(formula(clave)).toEqual({ stock: 3, transformado: 0 });
        expect(app.stockCuadro(id, 'crudo')).toBe(8);
    });

    test('Filete: lo escrito son filetes y el pecho baja según su factor', async () => {
        const { app, recargar, formula } = escenario([['pechuga', 10]]);
        const factor = Number(app.config.factorFiletesPorPechuga) || 1;
        expect(await app.cuadroFormulaTransformar('filete', input(4 * factor))).toBe(true);
        recargar();
        expect(app.stockCuadro('pechuga', 'crudo')).toBe(6);
        expect(formula('filete')).toEqual({ stock: 0, transformado: 4 * factor });
    });

    test('Tira de panceta pasa pancetas enteras (1 = 6)', async () => {
        const { app, recargar, formula } = escenario([['panceta', 3]]);
        expect(await app.cuadroFormulaTransformar('tira', input(6))).toBe(true);
        recargar();
        expect(app.stockCuadro('panceta', 'crudo')).toBe(2);
        const el = input(10);
        await app.cuadroFormulaTransformar('tira', el);
        expect(el.value).toBe('12');
        recargar();
        expect(formula('tira')).toEqual({ stock: 0, transformado: 12 });
        expect(app.stockCuadro('tira_panceta', 'crudo')).toBe(12);
        expect(app.stockCuadro('tira_panceta', 'cocido')).toBe(0);
        expect(app.ingresoVisibleTipo(app.filaReal('tira_panceta'), 'crudo')).toBe(0);
    });

    test('deshacer un lote crudo conserva el lote cocido que se registró antes en el mismo período', async () => {
        const { app, recargar, formula } = escenario([
            ['panceta', 3], ['panceta', -1, 'Pasa a tiras'], ['tira_panceta', 6, 'Sale de Panceta', 'cocido']
        ]);
        expect(app.pancetasHoy()).toBe(1);
        expect(formula('tira')).toEqual({ stock: 0, transformado: 0 });
        expect(await app.cuadroFormulaTransformar('tira', input(6))).toBe(true);
        recargar();
        expect(app.pancetasHoy()).toBe(2);
        expect(await app.cuadroFormulaTransformar('tira', input(0))).toBe(true);
        recargar();
        expect(app.pancetasHoy()).toBe(1);
        expect(app.stockCuadro('panceta', 'crudo')).toBe(2);
        expect(app.stockCuadro('tira_panceta', 'crudo')).toBe(0);
        expect(formula('cocido|tira_panceta')).toEqual({ stock: 6, transformado: 0 });
    });

    test('cocinar tiras conserva el cocido anterior y las piezas gastan solo el cocido', async () => {
        const { app, recargar, formula, nuevos } = escenario([
            ['panceta', 3], ['tira_panceta', 2, 'Sale de Panceta', 'cocido']
        ]);
        const cocido = 'cocido|tira_panceta';
        expect(formula(cocido)).toEqual({ stock: 2, transformado: 0 });
        expect(await app.cuadroFormulaTransformar('tira', input(6))).toBe(true);
        recargar();
        expect(await app.cuadroFormulaTransformar(cocido, input(3))).toBe(true);
        expect(nuevos().at(-1)).toMatchObject({ rubro: 'tira-panceta', tipoProducto: 'cocido', paseTipo: true, cantidad: 3 });
        recargar();
        expect(formula(cocido)).toEqual({ stock: 2, transformado: 3 });
        expect(app.stockCuadro('tira_panceta', 'crudo')).toBe(3);
        expect(app.fijarTirasUsadas(1)).toBe(true);
        recargar();
        expect(app.stockCuadro('tira_panceta', 'cocido')).toBe(4);
        expect(app.stockCuadro('tira_panceta', 'crudo')).toBe(3);
        expect(await app.cuadroFormulaTransformar(cocido, input(0))).toBe(true);
        recargar();
        expect(app.stockCuadro('tira_panceta', 'crudo')).toBe(6);
        expect(formula(cocido)).toEqual({ stock: 1, transformado: 0 });
    });

    test('usar tiras descuenta su ingreso total cocido de inmediato y al recargar', () => {
        const { app, recargar } = escenario([['tira_panceta', 6, 'Ingreso independiente cocido', 'cocido']]);
        const tira = app.filaReal('tira_panceta');
        const ingreso = () => app.cifraIngresoTabla(tira, 'ingresoTotal', 'cocido');
        expect(ingreso()).toBe(6);
        expect(app.fijarTirasUsadas(2)).toBe(true);
        expect(ingreso()).toBe(4);
        expect(app.stockCuadro(tira.id, 'cocido')).toBe(4);
        recargar();
        expect(ingreso()).toBe(4);
        expect(app.stockCuadro(tira.id, 'cocido')).toBe(4);
    });

    test('una caja vacía no guarda nada', async () => {
        const { app, nuevos } = escenario([['pechuga', 10]]);
        await app.cuadroFormulaTransformar('hijo|pechuga|pollo_lena', input(2));
        const cuantos = nuevos().length;
        const el = input('');
        expect(await app.cuadroFormulaTransformar('hijo|pechuga|pollo_lena', el)).toBe(false);
        expect(el.value).toBe('2');
        expect(nuevos()).toHaveLength(cuantos);
    });
});

describe('Teclado calculadora', () => {
    // Campo de número falso: el teclado lo lee y, al aplicar, dispara change como el navegador.
    const campo = (dataset, value, alCambiar) => ({
        value: String(value), dataset, step: 'any', min: '0', max: '', inputMode: '', labels: [],
        isConnected: true, matches: () => true, getAttribute: () => 'Campo', setAttribute: () => {},
        style: { setProperty: () => {} },
        dispatchEvent(ev) { if (ev.type === 'change' && alCambiar) this.promesa = alCambiar(this); }
    });
    const conTeclado = (app) => {
        app.$refs = {
            dialogoTecladoTransformar: { open: false, showModal() { this.open = true; }, close() { this.open = false; } },
            valorTecladoTransformar: { value: '', select() {}, focus() {}, setSelectionRange() {} }
        };
        app.sonarVenta = () => {};
    };
    const abrir = (app, el) => app.abrirTecladoTransformar({ defaultPrevented: false, target: el, preventDefault() {} });

    test('en Transformar: Stock que había + lo transformado = Total', async () => {
        const { app, recargar } = escenario([['pechuga', 10], ['pollo_lena', 3]]);
        conTeclado(app);
        const el = campo({ formula: 'hijo|pechuga|pollo_lena' }, 0, (c) => app.cuadroFormulaTransformar('hijo|pechuga|pollo_lena', c));
        abrir(app, el);
        expect(app.tecladoTransformar.formula).toEqual({ tipo: 'Transformar', stock: 3 });
        app.tecladoTransformar.cantidad = '5';
        expect(app.totalTecladoTransformar()).toBe(8);
        app.aplicarTecladoTransformar();
        expect(await el.promesa).toBe(true);
        recargar();
        // Al volver a abrirlo sigue 3 + 5 = 8.
        el.value = '5';
        abrir(app, el);
        expect(app.tecladoTransformar.formula).toEqual({ tipo: 'Transformar', stock: 3 });
        expect(app.tecladoTransformar.cantidad).toBe('5');
        expect(app.totalTecladoTransformar()).toBe(8);
    });

    test('el teclado ajusta un lote de 6 tiras cuando quedan 5 y conserva la tira usada', async () => {
        const { app, recargar, formula } = escenario([['panceta', 3]]);
        await app.cuadroFormulaTransformar('tira', input(6));
        expect(await app.cuadroFormulaTransformar('cocido|tira_panceta', input(1))).toBe(true);
        expect(app.fijarTirasUsadas(1)).toBe(true);
        recargar();
        expect(formula('tira')).toEqual({ stock: 0, transformado: 5 });
        expect(await app.cuadroFormulaTransformar('tira', input(0))).toBe(false);
        expect(app.stockCuadro('panceta', 'crudo')).toBe(2);

        conTeclado(app);
        const el = campo({ formula: 'tira' }, 5, (c) => app.cuadroFormulaTransformar('tira', c));
        el.step = '6';
        abrir(app, el);
        app.pulsarTeclaTransformar('+', { detail: 0 });
        expect(app.totalTecladoTransformar()).toBe(11);
        app.aplicarTecladoTransformar();
        expect(await el.promesa).toBe(true);
        recargar();
        expect(formula('tira')).toEqual({ stock: 0, transformado: 11 });
        expect(app.stockCuadro('panceta', 'crudo')).toBe(1);

        abrir(app, el);
        app.pulsarTeclaTransformar('−', { detail: 0 });
        app.aplicarTecladoTransformar();
        expect(await el.promesa).toBe(true);
        recargar();
        expect(formula('tira')).toEqual({ stock: 0, transformado: 5 });
        expect(app.stockCuadro('panceta', 'crudo')).toBe(2);
        expect(app.tirasUsadasHoy()).toBe(1);
    });

    test('en Ingreso: lo escrito es el ingreso del período y Stock lo que había sin él', () => {
        const { app, recargar } = escenario(octavoBase);
        conTeclado(app);
        const el = campo({ ingreso: 'directo|octavo_pollo|crudo|piernas' }, 30, (c) => app.registrarIngresoDirecto('octavo_pollo', 'crudo', c, 'piernas'));
        abrir(app, el);
        expect(app.tecladoTransformar.formula).toEqual({ tipo: 'Ingreso', stock: 0 });
        app.tecladoTransformar.cantidad = '35';
        expect(app.totalTecladoTransformar()).toBe(35);
        app.aplicarTecladoTransformar();
        expect(el.promesa).toBe(true);
        recargar();
        expect(app.octavosStockCorte('piernas')).toBe(35);
    });

    test('el ingreso directo a un sector y los campos sin fórmula abren el teclado sin cuenta', () => {
        const { app } = escenario([['octavo_pollo', 10, 'Ingreso independiente crudo · pierna']]);
        expect(app.formulaTeclado({ dataset: { ingreso: 'directo|octavo_pollo|crudo|piernas|beata' } })).toBe(null);
        expect(app.formulaTeclado({ dataset: {} })).toBe(null);
        app.tecladoTransformar = { etiqueta: '', cantidad: '5', decimales: true, error: '', formula: null };
        expect(app.totalTecladoTransformar()).toBe(0);
    });
});

describe('HTML', () => {
    const texto = html.replace(/\r\n/g, '\n');
    const transformar = texto.slice(texto.indexOf('PESTAÑA 3: TRANSFORMAR'), texto.indexOf('PESTAÑA: GRÁFICO ESTADÍSTICO'));

    test('el cuadro va donde estaba el cuadro que transformaba; Pecho y Pierna de pollo siguen como antes', () => {
        ['cuadroFilete(', 'cuadroOctavos(', 'cuadroOctavoPlato(', 'cuadroPaseCocido(', 'fijarPancetasSalen(',
            "cuadroHijo('pechuga'", "cuadroHijo('pierna'"]
            .forEach((viejo) => expect(transformar).not.toContain('@change="' + viejo));
        expect(transformar).toContain(`@change="fijarStockConIngreso('pechuga', 'crudo', $event.target)"`);
        expect(transformar).toContain(`@change="fijarStockConIngreso('pierna', 'crudo', $event.target)"`);
        const bloques = transformar.match(/<div class="tf-bloque"[\s\S]*?<\/label>/g);
        expect(bloques.length).toBe(16);
        expect(transformar).toContain('x-for="tipo in tiposDe(filaReal(plato.id))"');
        bloques.forEach((b) => {
            expect(b).toMatch(/>Stock<\/span>[\s\S]*>\+<\/span>[\s\S]*>Transformar<\/span>/);
            expect(b).toMatch(/min="0" :value="ft\.transformado"/);
            expect(b).toMatch(/@change="cuadroFormulaTransformar\([^\n]+\)\.finally\(\(\) => \{ monto = null; \}\)"/);
            expect(b).not.toMatch(/kg|porciones/);
        });
        expect(transformar).toContain('fijarIngresoArrozCuadro(d.campo, $event.target.value)');
    });

    test('el grupo Pachamanca usa la fórmula de cocido para cada corte y conserva el campo de macerado', () => {
        const pachamanca = transformar.slice(transformar.indexOf('id="trans-pachamanca"'));
        const inicioCocido = pachamanca.indexOf('x-if="tienePaseCocido(corteId)"');
        expect(pachamanca.slice(0, inicioCocido)).toContain(`@change="cuadroPachamanca(corteId, 'crudo', $event.target)"`);
        expect(pachamanca.slice(inicioCocido)).toContain(`claveFormula: 'cocido|' + corteId`);
        expect(pachamanca.slice(inicioCocido)).toContain(':data-formula="claveFormula"');
    });

    test('cada Ingreso y cada Transformar llevan su marca para el teclado', () => {
        const ingresos = transformar.match(/<input[^>]*@change="registrarIngreso(?:Directo|ArrozCuadro)\([^>]*>/g);
        expect(ingresos.length).toBeGreaterThan(30);
        ingresos.forEach((i) => expect(i).toContain(':data-ingreso="'));
        const modal = texto.slice(texto.indexOf('<dialog class="teclado-transformar"'), texto.indexOf('</dialog>', texto.indexOf('<dialog class="teclado-transformar"')));
        expect(modal).toMatch(/>Stock<\/span>[\s\S]*>\+<\/span>[\s\S]*x-ref="valorTecladoTransformar"[\s\S]*>=<\/span>[\s\S]*>Total<\/span>/);
        expect(modal).toContain('totalTecladoTransformar()');
    });
});
