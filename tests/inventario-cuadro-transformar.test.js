const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { armarLibro } = require('../src/utils/inventarioLibro');
const { boundsDiaOperativo } = require('../src/utils/diaOperativoRestaurante');

// Cuadro «Stock + Transformar = Total» de Transformar: Stock es el stock real del producto y
// Transformar es lo que se pasa ahora desde su origen. Al guardar, Transformar vuelve a 0.
const html = fs.readFileSync(path.join(__dirname, '../public/inventario.html'), 'utf8');
const code = html.slice(html.indexOf('function inventarioApp()'), html.lastIndexOf('</script>'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const DIA = '2026-11-18';
const fecha = `${DIA}T12:00:00-05:00`;
const input = (v) => ({ value: String(v), dataset: {}, style: { setProperty: () => {} } });

function escenario(iniciales) {
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    class Event { constructor(type) { this.type = type; } }
    const app = vm.runInNewContext('(' + code.trim() + ')', {
        window: {}, localStorage: storage, sessionStorage: storage, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, Event
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
        const libro = armarLibro({ movimientos: guardados, ventas: [], desde: b.inicio, hasta: b.fin });
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
    test('30 de stock + 60 transformados = 90: el Stock pasa a 90 y Transformar vuelve a 0', async () => {
        const { app, recargar, formula } = escenario(octavoBase);
        expect(formula('octavo|piernas')).toEqual({ stock: 30, transformado: 0 });
        const el = input(60);
        expect(await app.cuadroFormulaTransformar('octavo|piernas', el)).toBe(true);
        expect(el.value).toBe('0');
        recargar();
        expect(formula('octavo|piernas')).toEqual({ stock: 90, transformado: 60 });
        expect(app.octavosStockCorte('piernas')).toBe(90);
        expect(app.stockCuadro('pierna', 'crudo')).toBe(10);
        expect(app.ingresoDirectoPeriodo('octavo_pollo', 'crudo', 'piernas')).toBe(30);
        expect(formula('octavo|pechugas')).toEqual({ stock: 0, transformado: 0 });
    });

    test('lo escrito se suma a lo de hoy y un negativo lo devuelve, sin pasar de lo transformado', async () => {
        const { app, recargar, formula, nuevos } = escenario(octavoBase);
        await app.cuadroFormulaTransformar('octavo|piernas', input(60));
        recargar();
        const antes = nuevos().length;
        await app.cuadroFormulaTransformar('octavo|piernas', input(10));
        expect(nuevos().slice(antes).find((m) => m.rubro === app.claveDeFila.octavo_pollo)).toMatchObject({ cantidad: 10 });
        recargar();
        expect(formula('octavo|piernas')).toEqual({ stock: 100, transformado: 70 });
        expect(app.stockCuadro('pierna', 'crudo')).toBe(5);
        expect(await app.cuadroFormulaTransformar('octavo|piernas', input(-80))).toBe(false);
        expect(app.transformWarning).toMatch(/70/);
        expect(await app.cuadroFormulaTransformar('octavo|piernas', input(-70))).toBe(true);
        recargar();
        expect(formula('octavo|piernas')).toEqual({ stock: 30, transformado: 0 });
        expect(app.stockCuadro('pierna', 'crudo')).toBe(40);
    });

    test('el Stock es el stock real: lo que sale a un plato lo baja', async () => {
        const { app, recargar, formula } = escenario(octavoBase);
        await app.cuadroFormulaTransformar('octavo|piernas', input(60));
        recargar();
        expect(await app.cuadroFormulaTransformar('platoOctavo|arroz_con_pollo|piernas|crudo', input(20))).toBe(true);
        recargar();
        expect(app.octavosStockCorte('piernas')).toBe(70);
        expect(formula('octavo|piernas')).toEqual({ stock: 70, transformado: 60 });
    });

    test('sin piernas no pasa nada y la caja vuelve a 0', async () => {
        const { app, formula, nuevos } = escenario([['pierna', 2]]);
        const el = input(60);
        expect(await app.cuadroFormulaTransformar('octavo|piernas', el)).toBe(false);
        expect(el.value).toBe('0');
        expect(nuevos()).toHaveLength(0);
        expect(formula('octavo|piernas')).toEqual({ stock: 0, transformado: 0 });
    });

    test('los platos del octavo pasan su crudo desde el octavo y su cocido desde el crudo', async () => {
        const { app, recargar, formula } = escenario([['octavo_pollo', 10, 'Ingreso independiente crudo · pierna']]);
        expect(await app.cuadroFormulaTransformar('platoOctavo|arroz_con_pollo|piernas|crudo', input(4))).toBe(true);
        recargar();
        expect(app.octavosStockCorte('piernas')).toBe(6);
        expect(formula('platoOctavo|arroz_con_pollo|piernas|crudo')).toEqual({ stock: 4, transformado: 4 });
        expect(await app.cuadroFormulaTransformar('platoOctavo|arroz_con_pollo|piernas|cocido', input(3))).toBe(true);
        recargar();
        expect(formula('platoOctavo|arroz_con_pollo|piernas|cocido')).toEqual({ stock: 3, transformado: 3 });
        expect(formula('platoOctavo|arroz_con_pollo|piernas|crudo')).toEqual({ stock: 1, transformado: 4 });
        expect(formula('platoOctavo|arroz_con_pollo|pechugas|crudo')).toEqual({ stock: 0, transformado: 0 });
    });
});

describe('Piezas y platos que salen de otra', () => {
    test('Pierna de pollo: 57 y salen 20 piernas a octavos, el Stock dice 37 como el stock real', async () => {
        const { app, recargar, formula } = escenario([['pierna', 57]]);
        expect(await app.cuadroFormulaTransformar('octavo|piernas', input(40))).toBe(true);
        recargar();
        expect(app.stockCuadro('pierna', 'crudo')).toBe(37);
        expect(formula('pollo|pierna')).toEqual({ stock: 37, transformado: 0 });
    });

    test('Pecho de pollo usa el Transformar del pollo fresco: cada pollo da pecho y pierna', async () => {
        const { app, recargar, formula } = escenario([['pollo_fresco', 5], ['pechuga', 3]]);
        const fp = Number(app.config.factorPechugasPorFresco) || 2;
        const fl = Number(app.config.factorPiernasPorFresco) || 2;
        expect(await app.cuadroFormulaTransformar('pollo|pechuga', input(2 * fp))).toBe(true);
        recargar();
        expect(app.stockCuadro('pollo_fresco', 'crudo')).toBe(3);
        expect(formula('pollo|pechuga')).toEqual({ stock: 3 + 2 * fp, transformado: 2 * fp });
        expect(formula('pollo|pierna')).toEqual({ stock: 2 * fl, transformado: 2 * fl });
    });

    test('Pecho a la leña: Transformar resta pecho y el Ingreso independiente no', async () => {
        const { app, recargar, formula } = escenario([['pechuga', 10]]);
        expect(await app.cuadroFormulaTransformar('hijo|pechuga|pollo_lena', input(3))).toBe(true);
        recargar();
        expect(app.stockCuadro('pechuga', 'crudo')).toBe(7);
        expect(formula('hijo|pechuga|pollo_lena')).toEqual({ stock: 3, transformado: 3 });
        expect(app.registrarIngresoDirecto('pollo_lena', 'crudo', input(2))).toBe(true);
        recargar();
        expect(formula('hijo|pechuga|pollo_lena')).toEqual({ stock: 5, transformado: 3 });
        expect(app.stockCuadro('pechuga', 'crudo')).toBe(7);
    });

    test('el cocido pasa desde el crudo y con un negativo vuelve', async () => {
        const { app, recargar, formula } = escenario([['pechuga', 10]]);
        await app.cuadroFormulaTransformar('hijo|pechuga|pollo_lena', input(3));
        recargar();
        expect(await app.cuadroFormulaTransformar('cocido|pollo_lena', input(2))).toBe(true);
        recargar();
        expect(formula('cocido|pollo_lena')).toEqual({ stock: 2, transformado: 2 });
        expect(formula('hijo|pechuga|pollo_lena')).toEqual({ stock: 1, transformado: 3 });
        expect(await app.cuadroFormulaTransformar('cocido|pollo_lena', input(-2))).toBe(true);
        recargar();
        expect(app.stockCuadro('pollo_lena', 'crudo')).toBe(3);
        expect(formula('cocido|pollo_lena')).toEqual({ stock: 0, transformado: 0 });
    });

    test('Filete: lo escrito son filetes y el pecho baja según su factor', async () => {
        const { app, recargar, formula } = escenario([['pechuga', 10]]);
        const factor = Number(app.config.factorFiletesPorPechuga) || 1;
        expect(await app.cuadroFormulaTransformar('filete', input(4 * factor))).toBe(true);
        recargar();
        expect(app.stockCuadro('pechuga', 'crudo')).toBe(6);
        expect(formula('filete')).toEqual({ stock: 4 * factor, transformado: 4 * factor });
    });

    test('Tira de panceta pasa pancetas enteras (1 = 6)', async () => {
        const { app, recargar, formula } = escenario([['panceta', 3]]);
        expect(await app.cuadroFormulaTransformar('tira', input(6))).toBe(true);
        recargar();
        expect(app.stockCuadro('panceta', 'crudo')).toBe(2);
        expect(formula('tira')).toEqual({ stock: 6, transformado: 6 });
        await app.cuadroFormulaTransformar('tira', input(10));
        recargar();
        expect(app.pancetasHoy()).toBe(3);
        expect(formula('tira')).toEqual({ stock: 18, transformado: 18 });
    });

    test('una caja vacía no guarda nada', async () => {
        const { app, nuevos } = escenario([['pechuga', 10]]);
        await app.cuadroFormulaTransformar('hijo|pechuga|pollo_lena', input(2));
        const cuantos = nuevos().length;
        const el = input('');
        expect(await app.cuadroFormulaTransformar('hijo|pechuga|pollo_lena', el)).toBe(false);
        expect(el.value).toBe('0');
        expect(nuevos()).toHaveLength(cuantos);
    });
});

describe('Teclado calculadora', () => {
    // Campo de número falso: el teclado lo lee y, al aplicar, dispara change como el navegador.
    const campo = (dataset, value, alCambiar) => ({
        value: String(value), dataset, step: 'any', min: '', max: '', inputMode: '', labels: [],
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

    test('en Transformar: Stock real + lo que se escribe = Total, y al aplicar se transforma eso', async () => {
        const { app, recargar } = escenario(octavoBase);
        conTeclado(app);
        const el = campo({ formula: 'octavo|piernas' }, 0, (c) => app.cuadroFormulaTransformar('octavo|piernas', c));
        abrir(app, el);
        expect(app.tecladoTransformar.formula).toMatchObject({ tipo: 'Transformar', stock: 30, ya: 0, min: 0 });
        expect(app.tecladoTransformar.cantidad).toBe('0');
        app.tecladoTransformar.cantidad = '60';
        expect(app.totalTecladoTransformar()).toBe(90);
        app.aplicarTecladoTransformar();
        expect(await el.promesa).toBe(true);
        recargar();
        expect(app.octavosStockCorte('piernas')).toBe(90);
        // Al volver a abrirlo, Stock ya es 90 y se puede quitar hasta 60.
        abrir(app, el);
        expect(app.tecladoTransformar.formula).toMatchObject({ stock: 90, ya: 60, min: -60 });
        app.tecladoTransformar.cantidad = '-61';
        app.aplicarTecladoTransformar();
        expect(app.tecladoTransformar.error).toMatch(/60/);
        app.tecladoTransformar.cantidad = '-10';
        expect(app.totalTecladoTransformar()).toBe(80);
        app.aplicarTecladoTransformar();
        expect(await el.promesa).toBe(true);
        recargar();
        expect(app.octavosStockCorte('piernas')).toBe(80);
    });

    test('en Ingreso: el monto es el ingreso y se suma a lo ya ingresado en el período', () => {
        const { app, recargar } = escenario(octavoBase);
        conTeclado(app);
        const el = campo({ ingreso: 'directo|octavo_pollo|crudo|piernas' }, 30, (c) => app.registrarIngresoDirecto('octavo_pollo', 'crudo', c, 'piernas'));
        abrir(app, el);
        expect(app.tecladoTransformar.formula).toMatchObject({ tipo: 'Ingreso', stock: 30, ya: 30, min: -30, absoluto: true });
        app.tecladoTransformar.cantidad = '5';
        expect(app.totalTecladoTransformar()).toBe(35);
        app.aplicarTecladoTransformar();
        expect(el.value).toBe('35');
        expect(el.promesa).toBe(true);
        recargar();
        expect(app.ingresoDirectoPeriodo('octavo_pollo', 'crudo', 'piernas')).toBe(35);
        expect(app.octavosStockCorte('piernas')).toBe(35);
    });

    test('los sectores del octavo y los demás campos abren el teclado sin cuenta', () => {
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

    test('el cuadro va donde estaba el cuadro de stock que transformaba', () => {
        ['cuadroFilete(', 'cuadroOctavos(', 'cuadroOctavoPlato(', 'cuadroPaseCocido(', 'fijarPancetasSalen(',
            "cuadroHijo('pechuga'", "cuadroHijo('pierna'", "fijarStockConIngreso('pechuga'", "fijarStockConIngreso('pierna'"]
            .forEach((viejo) => expect(transformar).not.toContain('@change="' + viejo));
        const bloques = transformar.match(/<div class="tf-bloque"[\s\S]*?<\/label>/g);
        expect(bloques.length).toBe(18);
        bloques.forEach((b) => {
            expect(b).toMatch(/>Stock<\/span>[\s\S]*>\+<\/span>[\s\S]*>Transformar<\/span>/);
            expect(b).toMatch(/:data-formula="[^"]+" @input="monto = [^"]+" @change="monto = 0; cuadroFormulaTransformar\(/);
            expect(b).not.toMatch(/kg|porciones/);
        });
        expect(transformar).toContain("formulaTransformar('octavo|pechugas')");
        expect(transformar).toContain("formulaTransformar('octavo|piernas')");
        // El ícono de Ingreso sigue en cada tarjeta y el arroz blanco conserva su fórmula.
        expect(transformar).toContain('fijarIngresoArrozCuadro(d.campo, $event.target.value)');
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
