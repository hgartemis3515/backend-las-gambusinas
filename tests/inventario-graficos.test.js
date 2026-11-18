const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { armarLibro } = require('../src/utils/inventarioLibro');
const { boundsDiaOperativo } = require('../src/utils/diaOperativoRestaurante');

const html = fs.readFileSync(path.join(__dirname, '../public/inventario.html'), 'utf8');
const code = html.slice(html.indexOf('function inventarioApp()'), html.lastIndexOf('</script>'));
const plain = (v) => JSON.parse(JSON.stringify(v));

function crearApp(globals = {}) {
    const storage = { getItem: () => null };
    const factory = vm.runInNewContext('(' + code.trim() + ')', {
        window: {}, localStorage: storage, sessionStorage: storage,
        setTimeout: () => 0, clearTimeout: () => {}, ...globals
    });
    const app = factory();
    app.$nextTick = (fn) => fn();
    app.restaurarEjemploDespiece(true);
    app.vaciarNumeros();
    app.fechaHoy = () => '2026-11-18';
    app.activeTab = 'grafico';
    app.pintarGrafico = jest.fn();
    return app;
}

const movimientos = [
    { rubro: 'bisteck', clase: 'ingreso', cantidad: 20, fecha: '2026-11-17T10:00:00-05:00', tipoProducto: 'crudo' },
    { rubro: 'bisteck', clase: 'ingreso', cantidad: 5, fecha: '2026-11-18T10:00:00-05:00', tipoProducto: 'crudo' }
];
const ventas = [
    { rubro: 'bisteck', cantidad: 4, fecha: '2026-11-17T13:00:00-05:00' },
    { rubro: 'bisteck', cantidad: 1, fecha: '2026-11-18T02:30:00-05:00' },
    { rubro: 'bisteck', cantidad: 2, fecha: '2026-11-18T13:00:00-05:00' }
];

function apiConLibro(app) {
    app.api = jest.fn(async (url) => {
        const params = new URL(url, 'http://localhost').searchParams;
        const desde = boundsDiaOperativo(params.get('desde')).inicio;
        const hasta = boundsDiaOperativo(params.get('hasta')).fin;
        if (url.startsWith('/inventario/kardex?')) {
            return armarLibro({ movimientos, ventas, desde, hasta });
        }
        return { movimientos: movimientos.filter((m) => new Date(m.fecha) >= desde && new Date(m.fecha) <= hasta) };
    });
}

test('Ayer muestra el libro real del día operativo sin modificar la tabla ni Transformar', async () => {
    const app = crearApp();
    app.periodo = '30dias';
    app.customDesde = '2026-10-20';
    app.customHasta = '2026-11-18';
    app.periodoTransformar = '7dias';
    app.rows.forEach((row) => { row.ingreso = 999; row.venta = 888; });
    app.indiceFilas(); // La proyección debe invalidar este índice al copiar las filas.
    const anterior = plain({ rows: app.rows, claves: app.claveDeFila, movimientos: app.movimientosPeriodo, ventas: app.ventasPeriodo });
    app.cargarKardex = jest.fn();
    apiConLibro(app);
    await app.setPeriodoGrafico('ayer');

    expect(app.graficoError).toBe('');
    expect(app.graficoCargando).toBe(false);
    expect(app.periodo).toBe('30dias');
    expect(app.periodoTransformar).toBe('7dias');
    expect([app.customDesde, app.customHasta]).toEqual(['2026-10-20', '2026-11-18']);
    expect(plain({ rows: app.rows, claves: app.claveDeFila, movimientos: app.movimientosPeriodo, ventas: app.ventasPeriodo })).toEqual(anterior);
    expect(app.cargarKardex).not.toHaveBeenCalled();
    expect(plain(app.graficoSerie)).toEqual([{ dia: '2026-11-17', ingreso: 20, ventas: 5, saldo: 15 }]);
    expect(app.filasGrafico().find((f) => f.id === 'carne_bistec')).toMatchObject({ ingreso: 20, ventas: 5, saldo: 15 });
    expect(app.graficoFilas.find((f) => f.id === 'pechuga').ingreso).toBe(0);
});

test('7 días carga su rango y agrupa los eventos de madrugada en el día operativo anterior', async () => {
    const app = crearApp();
    apiConLibro(app);
    await app.setPeriodoGrafico('7dias');
    expect(app.periodo).toBe('hoy');
    expect(app.graficoSerie).toHaveLength(7);
    expect(app.graficoSerie[5]).toMatchObject({ dia: '2026-11-17', ingreso: 20, ventas: 5, saldo: 15 });
    expect(app.graficoSerie[6]).toMatchObject({ dia: '2026-11-18', ingreso: 5, ventas: 2, saldo: 18 });
    expect(app.api.mock.calls[0][0]).toContain('desde=2026-11-12&hasta=2026-11-18');
});

test('los botones conservan los métodos al cargar desde el scope combinado de Alpine', async () => {
    const app = crearApp();
    apiConLibro(app);
    const tablaAntes = plain(app.rows);
    // Alpine combina scopes con ownKeys/get/set, sin descriptores propios enumerables.
    const scope = new Proxy({}, {
        ownKeys: () => Reflect.ownKeys(app),
        get: (_, key) => app[key],
        set: (_, key, value) => { app[key] = value; return true; }
    });
    expect(Object.assign({}, scope).aplicarOpcionesCocido).toBeUndefined();
    await scope.setPeriodoGrafico('ayer');
    expect(app.graficoError).toBe('');
    expect(app.graficoSerie[0]).toMatchObject({ dia: '2026-11-17', ingreso: 20, ventas: 5, saldo: 15 });
    expect(plain(app.rows)).toEqual(tablaAntes);
    await scope.setPeriodoGrafico('7dias');
    expect(app.graficoError).toBe('');
    expect(app.graficoSerie).toHaveLength(7);
    expect(app.periodo).toBe('hoy');
});

test('rango manual y filtro por producto usan únicamente los datos del gráfico', async () => {
    const app = crearApp();
    apiConLibro(app);
    app.customDesdeGrafico = '2026-11-17';
    app.customHastaGrafico = '2026-11-18';
    await app.usarRangoManualGrafico();
    app.graficoProducto = 'carne_bistec';
    app.cargarSerieGrafico();
    expect(app.periodoGrafico).toBe('custom');
    expect(app.periodo).toBe('hoy');
    expect(app.customDesde).toBe('');
    expect(app.sumarBase('ingreso')).toBe(25);
    expect(app.rowsGrafico()).toHaveLength(1);
    app.graficoProducto = 'pechuga';
    app.cargarSerieGrafico();
    expect(app.sumarBase('ingreso')).toBe(0);
    expect(app.graficoSerie.every((p) => p.ingreso === 0 && p.ventas === 0)).toBe(true);
});

test('respuestas tardías de Ayer no reemplazan un período más reciente', async () => {
    const app = crearApp();
    const pendiente = [];
    app.api = jest.fn(() => new Promise((resolve) => pendiente.push(resolve)));
    const primera = app.setPeriodoGrafico('ayer');
    const segunda = app.setPeriodoGrafico('hoy');
    pendiente[2]({ filas: [{ rubro: 'bisteck', tipoProducto: 'crudo', ingresoBruto: 9 }] });
    pendiente[3]({ movimientos: [] });
    await segunda;
    pendiente[0]({ filas: [{ rubro: 'bisteck', tipoProducto: 'crudo', ingresoBruto: 100 }] });
    pendiente[1]({ movimientos: [] });
    await primera;
    expect(app.graficoSerie[0]).toMatchObject({ dia: '2026-11-18', ingreso: 9 });
    expect(app.graficoCargando).toBe(false);
});

test('un error de consulta limpia los datos previos y permite volver a cargar', async () => {
    const app = crearApp();
    apiConLibro(app);
    await app.setPeriodoGrafico('ayer');
    app.api = jest.fn(async () => { throw new Error('Sin conexión'); });
    await app.setPeriodoGrafico('hoy');
    expect(app.graficoError).toContain('Sin conexión');
    expect(app.graficoSerie).toHaveLength(0);
    expect(app.graficoFilas).toHaveLength(0);
    expect(app.graficoCargando).toBe(false);
    apiConLibro(app);
    await app.setPeriodoGrafico('ayer');
    expect(app.graficoError).toBe('');
    expect(app.graficoSerie[0].ingreso).toBe(20);
});

test('un rango invertido avisa antes de consultar el servidor', async () => {
    const app = crearApp();
    app.api = jest.fn();
    app.customDesdeGrafico = '2026-11-18';
    app.customHastaGrafico = '2026-11-17';
    await app.usarRangoManualGrafico();
    expect(app.graficoError).toContain('Desde');
    expect(app.api).not.toHaveBeenCalled();
    expect(app.graficoCargando).toBe(false);
});

test('los turnos consultan sus horas y conservan fechas válidas en los controles del gráfico', async () => {
    const TurnosDiaNoche = {
        esSegmento: (id) => id === 'noche',
        rangoDe: () => ({ desde: '2026-11-18T20:00:00-05:00', hasta: '2026-11-19T03:59:59-05:00' })
    };
    const app = crearApp({ window: { TurnosDiaNoche } });
    app.api = jest.fn(async (url) => url.includes('/kardex?')
        ? { filas: [{ rubro: 'bisteck', tipoProducto: 'crudo', ingresoBruto: 8, venta: 3 }] }
        : { movimientos: [] });
    await app.setPeriodoGrafico('noche');
    expect(app.api.mock.calls[0][0]).toContain('desde=2026-11-18T20%3A00%3A00-05%3A00');
    expect(app.customDesdeGrafico).toBe('2026-11-18');
    expect(app.customHastaGrafico).toBe('2026-11-18');
    expect(app.graficoSerie[0]).toMatchObject({ dia: '2026-11-18', ingreso: 8, ventas: 3, saldo: 5 });
    expect(app.periodo).toBe('hoy');
});

test('Chart.js queda fuera de Alpine y recibe copias de los datos en cada actualización', () => {
    const canvas = {};
    const instancias = new Map();
    class Chart {
        constructor(elemento, config) {
            this.canvas = elemento;
            this.data = config.data;
            this.update = jest.fn();
            this.destroy = jest.fn(() => instancias.delete(elemento));
            instancias.set(elemento, this);
        }
        static getChart(elemento) { return instancias.get(elemento); }
    }
    const app = crearApp({ Chart, window: { Chart }, document: { getElementById: () => canvas } });
    const data = { labels: ['17/11'], datasets: [{ data: [20] }] };
    app.ponerGrafico('_chartAnillo', 'canvas', { type: 'bar', data }, 20);
    const chart = Chart.getChart(canvas);
    expect(app._chartAnillo).toBeUndefined();
    expect(chart.data).not.toBe(data);
    expect(chart.data.datasets[0].data).not.toBe(data.datasets[0].data);
    for (let i = 0; i < 30; i++) {
        data.datasets[0].data[0] = i;
        app.ponerGrafico('_chartAnillo', 'canvas', { type: 'bar', data }, i);
    }
    expect(Chart.getChart(canvas)).toBe(chart);
    expect(chart.data.datasets[0].data[0]).toBe(29);
    expect(chart.$totalAnillo).toBe(29);
    app.soltarGrafico('_chartAnillo', 'canvas');
    expect(chart.destroy).toHaveBeenCalledTimes(1);
});
