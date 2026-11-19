const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { armarLibro } = require('../src/utils/inventarioLibro');
const { perfilRubro, esStockGeneral, normalizarVenta, semillaCocido } = require('../src/utils/inventarioCascadaVenta');
const { boundsDiaOperativo } = require('../src/utils/diaOperativoRestaurante');

const html = fs.readFileSync(path.join(__dirname, '../public/inventario.html'), 'utf8');
const factoryCode = html.slice(html.indexOf('function inventarioApp()'), html.lastIndexOf('</script>'));

function crearApp() {
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const fabrica = vm.runInNewContext('(' + factoryCode.trim() + ')', {
        window: {}, localStorage, sessionStorage: localStorage, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0
    });
    const app = fabrica();
    app.$nextTick = (f) => f && f();
    app.$watch = () => {};
    app.$refs = {};
    app.sonarVenta = () => {};
    app.animarContadorVenta = () => {};
    app.restaurarEjemploDespiece(true);
    app.vaciarNumeros();
    app.aplicarOpcionesCocido([]);
    return app;
}

const hora = (h) => '2026-11-11T' + h + ':00-05:00';
const horaAyer = (h) => '2026-11-10T' + h + ':00-05:00';
const mov = (rubro, clase, cantidad, fecha, motivo, tipoProducto = 'crudo') => ({ rubro, clase, cantidad, fecha, tipoProducto, motivo: motivo || 'Ingreso crudo' });

function pintar(app, movimientos, ventas, ymd = '2026-11-11') {
    const b = boundsDiaOperativo(ymd);
    const libro = armarLibro({ movimientos, ventas: ventas || [], desde: b.inicio, hasta: b.fin });
    app.ventasPeriodo = libro.ventas;
    app.movimientosPeriodo = movimientos;
    app.aplicarKardex(libro.filas, movimientos, libro.ventas);
    return libro;
}

test('la hoja y el servidor usan la misma regla de cocido en todas las filas', () => {
    const app = crearApp();
    const opciones = [{ clave: 'sandwiches', tieneCocido: true, reservaClave: 'pechuga-pollo' }, { clave: 'milanesa', tieneCocido: true, reservaClave: 'filete' }];
    app.aplicarOpcionesCocido(opciones);
    app.rows.forEach((row) => {
        const clave = app.claveDeFila[row.id];
        if (!clave) return;
        const op = opciones.find((o) => o.clave === clave);
        expect([clave, perfilRubro(clave, op)]).toEqual([clave, { tieneCocido: !!row.tieneCocido, soloCocido: !!row.soloCocido }]);
        expect([clave, esStockGeneral(clave)]).toEqual([clave, app.esVentaStockGeneral(clave)]);
        expect(semillaCocido(clave).tieneCocido).toBe(app.opcionCocidoDe(clave).tieneCocido);
    });
});

test('la hoja normaliza las ventas igual que el servidor', () => {
    const app = crearApp();
    [
        { rubro: 'filete-pollo', cantidad: 2, tipoProducto: 'crudo', nombre: 'Filete' },
        { rubro: 'filete-junior', cantidad: 1, tipoProducto: 'crudo', nombre: 'Filete junior', sinSaldo: true },
        { rubro: 'arroz-blanco', cantidad: 3, tipoProducto: 'crudo', nombre: 'Arroz' },
        { rubro: 'milanesa-junior', cantidad: 1, tipoProducto: 'crudo', nombre: 'Milanesa junior' },
        { rubro: 'filete', cantidad: 1, tipoProducto: 'crudo', nombre: 'Milanesa junior', detalle: [{ nombre: 'Milanesa junior', platos: 1 }] }
    ].forEach((v) => {
        expect(JSON.parse(JSON.stringify(app.ventaKardexNormalizada(v)))).toEqual(normalizarVenta(v));
    });
});

test('«Hoy» es el día operativo también después de medianoche', () => {
    const app = crearApp();
    expect(app.ymdOperativo(new Date('2026-11-18T02:30:00-05:00'))).toBe('2026-11-17');
    expect(app.ymdOperativo('2026-11-18T05:30:00-05:00')).toBe('2026-11-18');
    app.ymdOperativo = () => '2026-11-17';
    expect(app.fechaHoy()).toBe('2026-11-17');
    expect(app.rangoDe('hoy')).toEqual({ desde: '2026-11-17', hasta: '2026-11-17' });
    expect(app.rangoDe('ayer')).toEqual({ desde: '2026-11-16', hasta: '2026-11-16' });
});

test('cada fila cuadra sola y el grupo va aparte', () => {
    const app = crearApp();
    const movs = [
        mov('pierna-pollo', 'ingreso', 10, horaAyer('10:00')),
        mov('pollada', 'ingreso', 4, horaAyer('10:00')),
        mov('pierna-pollo', 'ingreso', 5, hora('10:00')),
        mov('pierna-pollo', 'ingreso', -3, hora('11:00'), 'Pasa a Pollada'),
        mov('pollada', 'ingreso', 3, hora('11:00'), 'Sale de Pierna de Pollo')
    ];
    pintar(app, movs, [{ rubro: 'pollada', nombre: 'Pollada', cantidad: 2, fecha: hora('13:00'), detalle: [] }]);
    const pierna = app.filaReal('pierna');
    expect(app.saldoAnteriorColumna(pierna)).toBe(10);
    expect(app.valorTipo(pierna, 'ingreso', 'crudo')).toBe(5);
    expect(app.ingresoTotalColumna(pierna)).toBe(15);
    expect(app.saldoRealColumna(pierna)).toBe(12);
    expect(app.stockCuadro('pierna', 'crudo')).toBe(12);
    expect(app.tieneGrupo(pierna)).toBe(true);
    expect(app.saldoAnteriorGrupo(pierna)).toBe(14);
    expect(app.ingresoTotalGrupo(pierna)).toBe(22);
    expect(app.quedaGrupo(pierna)).toBe(17);
    expect(app.ventaColumna(pierna)).toBe(0);
    expect(app.ventaGrupo(pierna)).toBe(2);
});

test('un día sin datos deja la fila en 0 en vez de repetir el período anterior', () => {
    const app = crearApp();
    pintar(app, [mov('cuy', 'ingreso', 5, hora('10:00'))]);
    expect(app.saldoRealColumna(app.filaReal('cuy'))).toBe(5);
    app.claveDeFila.cuy = 'cuy-sin-datos';
    app.aplicarKardex([], [], []);
    expect(app.saldoRealColumna(app.filaReal('cuy'))).toBe(0);
});

test('Pierna suma la apertura visible y su ingreso sin volver a contar el pase a Pollada', () => {
    const app = crearApp();
    pintar(app, [
        mov('pachamanca-pollo', 'ingreso', 53, horaAyer('09:00')),
        mov('pierna-lena', 'ingreso', 32, horaAyer('09:00')),
        mov('pollada', 'ingreso', 12, horaAyer('09:00')),
        mov('pierna-pollo', 'ingreso', 40, hora('09:00'), 'Ingreso independiente crudo'),
        mov('pierna-pollo', 'ingreso', -40, hora('10:00'), 'Pasa a Pollada'),
        mov('pollada', 'ingreso', 40, hora('10:00'), 'Sale de Pierna de Pollo')
    ]);
    const pierna = app.filaReal('pierna');
    const pollada = app.filaReal('pollada');
    expect(app.cifraGrupo(pierna, 'saldoAnterior')).toBe(97);
    expect(app.cifraIngresoTabla(pierna, 'ingreso')).toBe(40);
    expect(app.cifraIngresoTabla(pierna, 'ingresoTotal')).toBe(137);
    expect(app.cifraIngresoTabla(pierna, 'ingresoTotal', 'crudo')).toBe(137);
    expect(app.cifraIngresoTabla(pollada, 'ingresoTotal')).toBe(52);
    expect(app.stockCuadro('pierna', 'crudo')).toBe(0);
    expect(app.stockCuadro('pollada', 'crudo')).toBe(52);
    app.abrirOrigenIngreso(pierna, 'crudo');
    expect(app.origenIngreso).toMatchObject({ total: 40, anotado: 40, transformado: 0 });
    app.abrirDesgloseGrupo(pierna, 'ingresoTotal');
    expect(app.desgloseGrupo.total).toBe(177);
    expect(app.desgloseGrupo.ayuda).toContain('97 de saldo anterior + 40 de ingreso = 137');
    const filaImpresa = app.documentoImpresionHoja().match(/<tr class="fila[^"]*">(?:(?!<\/tr>).)*>Pierna de Pollo<(?:(?!<\/tr>).)*<\/tr>/)[0];
    expect([...filaImpresa.matchAll(/<span class="v">(\d+)<\/span>/g)].map((m) => Number(m[1]))).toEqual([97, 40, 137]);
});

test('la impresión respeta las columnas, los indicadores y las filas ocultas de la configuración', () => {
    const app = crearApp();
    pintar(app, [mov('pierna-pollo', 'ingreso', 40, hora('09:00'))]);
    const apertura = ['Producto', 'Saldo anterior', 'Ingreso'];
    const ingresoVenta = ['Ingreso total', 'Venta comandas'];
    const queda = 'Queda (saldo real)';
    const revisar = (esperadas, anchos) => {
        const impreso = app.documentoImpresionHoja();
        const titulos = impreso.match(/<tr class="sub">(.*?)<\/tr>/)[1];
        expect([...titulos.matchAll(/<th>(.*?)<\/th>/g)].map((m) => m[1])).toEqual(esperadas);
        const bandas = impreso.match(/<tr class="sup">(.*?)<\/tr>/)[1];
        expect([...bandas.matchAll(/colspan="(\d+)"/g)].map((m) => Number(m[1]))).toEqual(anchos);
        expect(impreso.match(/<col /g)).toHaveLength(esperadas.length);
        const grupos = [...impreso.matchAll(/<tr class="grupo"><td colspan="(\d+)"/g)];
        expect(grupos.length).toBeGreaterThan(0);
        grupos.forEach((m) => expect(Number(m[1])).toBe(esperadas.length));
        const filas = [...impreso.matchAll(/<tr class="fila[^"]*">(.*?)<\/tr>/g)];
        expect(filas.length).toBeGreaterThan(0);
        filas.forEach((m) => expect(m[1].match(/<td /g)).toHaveLength(esperadas.length));
        return impreso;
    };

    const ocultas = revisar([...apertura, ...ingresoVenta, queda], [2, 2, 1, 1]);
    expect(ocultas).not.toContain('Transformación');
    expect(ocultas).not.toContain('↑+40');
    expect(ocultas).not.toMatch(/>(Pollo|Pato) fresco</i);

    app.setOcultarSaldoYConteo(false);
    app.setOcultarEstado(false);
    app.setOcultarMasMenosIngreso(false);
    app.setOcultarPolloFresco(false);
    app.cargarVistaTablaLocal();
    const mixtas = revisar([...apertura, ...ingresoVenta, 'Saldo', 'Conteo', queda, 'Estado'], [2, 2, 1, 4]);
    expect(mixtas).toContain('↑+40');
    expect(mixtas).toMatch(/>Pollo fresco</i);
    expect(mixtas).not.toMatch(/>Pato fresco</i);

    app.setOcultarCorreccion(false);
    app.setOcultarTransformacion(false);
    app.setOcultarDiferencia(false);
    revisar([...apertura, 'Corrección', ...ingresoVenta, 'Transformación', 'Saldo', 'Conteo', queda, 'Diferencia', 'Estado'], [2, 3, 2, 5]);
});

test('la impresión incluye el stock propio y los platos con stock debajo de su grupo', () => {
    const app = crearApp();
    app.aplicarOpcionesCocido([{ clave: 'pollada', tieneCocido: true }]);
    pintar(app, [
        mov('pierna-pollo', 'ingreso', 3, hora('09:00')),
        mov('pollada', 'ingreso', 7, hora('09:00')),
        mov('pollada', 'ingreso', 2, hora('09:00'), 'Ingreso independiente cocido', 'cocido'),
        mov('pachamanca-pollo', 'ingreso', 4, hora('09:00'))
    ]);
    app.tableGroups.find((g) => g.id === 'pollo').open = false;
    const pierna = app.filaReal('pierna');
    expect(app.quedaGrupo(pierna)).toBe(16);
    const impreso = app.documentoImpresionHoja();
    const detalle = impreso.match(/<tr class="fila[^\"]*">(?:(?!<\/tr>).)*>Pierna de Pollo<(?:(?!<\/tr>).)*<\/tr>(<tr class="detalle-stock">.*?<\/tr>)/)[1];
    expect(detalle).toContain('Pierna de Pollo (propia)');
    expect(detalle).toMatch(/Pollada<.*?Crudo 7<.*?Cocido 2</);
    expect(detalle).toMatch(/Pollo pachamanca pierna<.*?Macerado 4</i);
    expect(detalle).not.toMatch(/Pierna a la Leña|Cocido 0|Crudo 0/i);
});

test('el reporte cuenta el producto final con su tipo y corte, y descarta pases deshechos', () => {
    const app = crearApp();
    const reporte = [
        mov('octavo-pollo', 'ingreso', 146, hora('04:00'), 'Saldo anterior · pierna'),
        mov('octavo-pollo', 'ingreso', 30, hora('04:00'), 'Ajuste apertura · Editar stock · pecho'),
        mov('octavo-pollo', 'ingreso', -2, hora('08:00'), 'Pasa a Caldo de pollo'),
        mov('caldo-pollo', 'ingreso', 2, hora('08:00'), 'Pasa a Caldo de pollo · pierna'),
        mov('pierna-pollo', 'ingreso', 40, hora('09:00'), 'Ingreso independiente crudo'),
        mov('pierna-pollo', 'ingreso', -40, hora('09:30'), 'Pasa a Pollada'),
        mov('pollada', 'ingreso', 40, hora('09:30'), 'Sale de Pierna de Pollo'),
        mov('pechuga-pollo', 'ingreso', 5, hora('10:00'), 'Ingreso independiente crudo'),
        mov('pechuga-pollo', 'ingreso', -3, hora('10:30'), 'Pasa a Octavo de pollo'),
        mov('octavo-pollo', 'ingreso', 6, hora('10:30'), 'Sale de Pecho de Pollo'),
        mov('pierna-pollo', 'ingreso', -2, hora('11:00'), 'Pasa a Octavo de pollo'),
        mov('octavo-pollo', 'ingreso', 4, hora('11:00'), 'Viene de Pierna de Pollo · pierna'),
        mov('octavo-pollo', 'ingreso', -4, hora('11:30'), 'Pasa a Arroz con pollo · pecho'),
        mov('arroz-pollo', 'ingreso', 4, hora('11:30'), 'Sale de Octavo de pollo · pecho'),
        mov('arroz-pollo', 'ingreso', -2, hora('12:00'), 'Pasa a cocido Arroz con pollo · pecho'),
        mov('arroz-pollo', 'ingreso', 2, hora('12:00'), 'Pasa de crudo Arroz con pollo · pecho', 'cocido'),
        mov('pechuga-pollo', 'ingreso', -1, hora('13:00'), 'Pasa a Sandwich'),
        mov('sandwiches', 'ingreso', 1, hora('13:00'), 'Sale de Pecho de Pollo', 'cocido'),
        mov('pechuga-pollo', 'ingreso', -1, hora('14:00'), 'Pasa a Pecho a la Leña'),
        mov('pollo-lena', 'ingreso', 1, hora('14:00'), 'Sale de Pecho de Pollo'),
        mov('pechuga-pollo', 'ingreso', 1, hora('14:01'), 'Pasa a Pecho a la Leña'),
        mov('pollo-lena', 'ingreso', -1, hora('14:01'), 'Sale de Pecho de Pollo'),
        mov('pollada', 'ingreso', 1, hora('15:00'), 'Ingreso independiente cocido', 'cocido'),
        mov('pollada', 'ingreso', -1, hora('15:01'), 'Ingreso independiente cocido', 'cocido')
    ];
    app.reporteDiaVista = app.vistaReporteHoja({}, reporte.reverse());
    const filas = app.filasReporteIngreso();
    const pierna = filas.find((f) => f.clave === 'pierna-pollo');
    expect(pierna.ingreso).toBe(40);
    expect(pierna.lineas).toMatchObject([{ nombre: 'Pollada', tipo: 'Crudo', detalle: 'Desde Pierna de Pollo', cantidad: 40 }]);
    const pecho = filas.find((f) => f.clave === 'pechuga-pollo');
    expect(pecho.ingreso).toBe(2);
    expect(pecho.lineas).toMatchObject([{ clave: 'pechuga-pollo', cantidad: 1 }, { clave: 'sandwiches', tipo: 'Cocido', cantidad: 1 }]);
    const octavo = filas.find((f) => f.clave === 'octavo-pollo');
    expect(octavo.ingreso).toBe(12);
    expect(octavo.lineas).toEqual(expect.arrayContaining([
        expect.objectContaining({ clave: 'arroz-pollo', tipo: 'Crudo', corte: 'Pecho', detalle: 'Desde Octavo de pollo', cantidad: 2 }),
        expect.objectContaining({ clave: 'arroz-pollo', tipo: 'Cocido', corte: 'Pecho', detalle: 'Desde crudo', cantidad: 2 }),
        expect.objectContaining({ clave: 'caldo-pollo', corte: 'Pierna', detalle: 'Desde Octavo de pollo', cantidad: 2 }),
        expect.objectContaining({ clave: 'octavo-pollo', corte: 'Pecho', detalle: 'Desde Pecho de Pollo', cantidad: 2 }),
        expect.objectContaining({ clave: 'octavo-pollo', corte: 'Pierna', detalle: 'Desde Pierna de Pollo', cantidad: 4 })
    ]));
    expect(app.totalReporteIngreso()).toBe(54);
    expect(filas.map((f) => f.clave)).toHaveLength(3);
});

test('el reporte de venta agrupa platos y abre las comandas con el mismo total y el stock utilizado', () => {
    const app = crearApp();
    const v = (rubro, origen, nombre, cantidad, tipoProducto, sinSaldo = false) => ({
        rubro, origen, nombre, cantidad, tipoProducto, sinSaldo,
        detalle: [{ nombre, cantidad, platos: cantidad, comanda: 'Comanda 1', comandaId: '1', hora: hora('13:00') }]
    });
    const ventas = [
        v('pollada', 'pollada', 'Pollada con arroz', 2, 'cocido'),
        v('pierna-pollo', 'pollada', 'Pollada con arroz', 1.5, 'crudo'),
        v('pollada', 'pollada', 'Pollada con arroz', 1.5, 'cocido', true),
        v('pierna-lena', 'pierna-lena', 'Cuarto a la leña', 1, 'cocido'),
        v('arroz-pollo', 'arroz-pollo', 'Arroz con pollo', 3, 'cocido')
    ];
    const movimientos = [
        mov('pollada', 'ingreso', 2, hora('08:00'), 'Ingreso directo', 'cocido'),
        { ...mov('pollada', 'egreso', 1, hora('14:00'), 'Venta manual · Personal', 'cocido'), _id: 'manual', nombre: 'Pollada' }
    ];
    app.reporteDiaVista = app.vistaReporteHoja({ ventas }, movimientos);
    const pierna = app.filasReporteVenta().find((f) => f.clave === 'pierna-pollo');
    expect(pierna.venta).toBe(5.5);
    expect(pierna.lineas).toEqual(expect.arrayContaining([
        expect.objectContaining({ plato: 'Pollada con arroz', tipo: 'Crudo', detalle: 'Comandas · Stock de Pierna de Pollo', cantidad: 1.5 }),
        expect.objectContaining({ plato: 'Pollada con arroz', tipo: 'Cocido', detalle: 'Comandas · Stock de Pollada', cantidad: 2 }),
        expect.objectContaining({ nombre: 'Pollada', detalle: 'Descarga manual · Personal', cantidad: 1 })
    ]));
    app.abrirVenta(pierna, app.reporteDiaVista);
    expect(app.ventaInfo.total).toBe(5.5);
    expect(app.ventaInfo.lineas.find((l) => l.nombre === 'Pollada con arroz')).toMatchObject({ cantidad: 3.5, comandaId: '1' });
    expect(app.totalReporteVenta()).toBe(8.5);

    app.alternarReporteOculta(app.filasReporteEditar().find((f) => f.clave === 'pollada'));
    expect(app.totalReporteIngreso()).toBe(0);
    expect(app.totalReporteVenta()).toBe(4);
    const filtrada = app.filasReporteVenta().find((f) => f.clave === 'pierna-pollo');
    expect(app.detalleVenta(filtrada, app.reporteDiaVista).total).toBe(1);
});

test('Venta Comandas de pierna muestra las siete ventas del modal sin descontarlas dos veces', () => {
    const app = crearApp();
    const ventas = [
        { rubro: 'pollada', nombre: 'Pollada', cantidad: 4, fecha: hora('12:00') },
        { rubro: 'pierna-lena', nombre: 'Pierna a la leña', cantidad: 3, fecha: hora('13:00') },
        { rubro: 'pollo-lena', nombre: 'Pecho a la leña', cantidad: 5, fecha: hora('13:00') }
    ];
    pintar(app, [mov('pierna-pollo', 'ingreso', 10, hora('09:00'))], ventas);
    const pierna = app.filaReal('pierna');
    expect(app.ventaColumna(pierna)).toBe(0);
    expect(app.ventaComandasCocido(pierna)).toBe(7);
    expect(app.stockCuadro('pierna', 'crudo')).toBe(10);
    expect(app.ventaInfo).toBeNull();
    app.abrirVentaFila(pierna);
    expect(app.ventaInfo.total).toBe(7);
    expect(app.ventaInfo.propia).toBe(0);
    pintar(app, []);
    expect(app.ventaComandasCocido(pierna)).toBe(0);
});

test('Venta Comandas usa el total de la lupa para Octavo, sus platos y productos individuales', () => {
    const app = crearApp();
    const movimientos = [
        mov('octavo-pollo', 'ingreso', 10, hora('09:00')),
        mov('octavo-pollo', 'egreso', 2, hora('13:00'), 'Venta manual · Eventos · pierna')
    ];
    const ventas = [
        { rubro: 'arroz-pollo', nombre: 'Arroz con pollo', cantidad: 4, fecha: hora('12:00') },
        { rubro: 'pollo-olla', nombre: 'Pollo a la olla', cantidad: 3, fecha: hora('12:00') },
        { rubro: 'cuy', nombre: 'Cuy', cantidad: 5, fecha: hora('12:00') }
    ];
    pintar(app, movimientos, ventas);
    expect(app.ventaColumna(app.filaReal('octavo_pollo'))).toBe(2);
    for (const [id, total] of [['octavo_pollo', 9], ['arroz_con_pollo', 4], ['cuy', 5]]) {
        const fila = app.filaReal(id);
        expect(app.ventaComandasCocido(fila)).toBe(total);
        app.abrirVentaFila(fila);
        expect(app.ventaInfo.total).toBe(total);
    }
    expect(app.stockCuadro('octavo_pollo', 'crudo')).toBe(8);
    // Mismas ventas, pero cambia una descarga del período.
    pintar(app, movimientos.concat(mov('octavo-pollo', 'egreso', 1, hora('14:00'), 'Venta manual · Eventos · pecho')), ventas);
    expect(app.ventaComandasCocido(app.filaReal('octavo_pollo'))).toBe(10);
});

test('el modal de ventas muestra un plato una vez, con de dónde salió', () => {
    const app = crearApp();
    const movs = [
        mov('pollada', 'ingreso', 1, hora('09:00'), 'Ingreso cocido', 'cocido'),
        mov('pollada', 'ingreso', 5, hora('09:00'))
    ];
    const detalle = [{ nombre: 'Pollada', cantidad: 2, platos: 2, factor: 1, comanda: 'Comanda 42', comandaId: 'c42', hora: hora('12:00') }];
    pintar(app, movs, [{ rubro: 'pollada', nombre: 'Pollada', cantidad: 2, fecha: hora('12:00'), detalle }]);
    const row = app.filaReal('pollada');
    app.abrirVentaFila(row);
    expect(app.ventaInfo.lineas).toHaveLength(1);
    expect(app.ventaInfo.lineas[0]).toMatchObject({ nombre: 'Pollada', cantidad: 2, platos: 2 });
    expect(app.ventaInfo.lineas[0].usos.map((u) => u.cantidad)).toEqual([1, 1]);
    expect(app.ventaInfo.total).toBe(app.ventaColumna(row));
    expect(app.resumenVenta()).toMatchObject({ total: 2, comandas: 1, platos: 1 });
});

test('un plato que gasta dos productos cuenta una vez como plato', () => {
    const app = crearApp();
    const d = (cantidad) => [{ nombre: 'Arroz Chaufa Chancho', cantidad, platos: 1, factor: cantidad, comanda: 'Comanda 7', comandaId: 'c7' }];
    pintar(app, [mov('trozo-panceta', 'ingreso', 5, hora('09:00'), 'Ingreso cocido', 'cocido')], [
        { rubro: 'trozo-panceta', nombre: 'Pieza de panceta', cantidad: 1, fecha: hora('12:00'), detalle: d(1) },
        { rubro: 'chaufa-chancho', nombre: 'Chaufa de chancho', cantidad: 1, fecha: hora('12:00'), detalle: d(1) }
    ]);
    app.abrirVentaFila(app.filaReal('trozo_panceta'));
    expect(app.ventaInfo.lineas).toHaveLength(1);
    expect(app.ventaInfo.lineas[0]).toMatchObject({ platos: 1, cantidad: 1, propia: 1 });
    expect(app.ventaInfo.propia).toBe(app.ventaColumna(app.filaReal('trozo_panceta')));
    expect(app.ventaInfo.total).toBe(1);
    expect(app.ventaInfo.nota).toBe('');
});

test('chaufa conserva cantidades reales y comandas distintas sin contar otra vez sus ingredientes', () => {
    const app = crearApp();
    const detalle = (id, n) => [{ nombre: 'Arroz Chaufa Chancho', cantidad: n, platos: n, factor: 1, comandaId: id, comanda: id }];
    const ventas = ['c1', 'c2'].flatMap((id, i) => [
        { rubro: 'trozo-panceta', cantidad: i + 1, fecha: hora('12:00'), detalle: detalle(id, i + 1) },
        { rubro: 'chaufa-chancho', cantidad: i + 1, fecha: hora('12:00'), detalle: detalle(id, i + 1) }
    ]);
    pintar(app, [mov('trozo-panceta', 'ingreso', 10, hora('09:00'), 'Ingreso cocido', 'cocido')], ventas);
    app.abrirVentaFila(app.filaReal('trozo_panceta'));
    expect(app.ventaInfo.lineas).toHaveLength(2);
    expect(app.ventaInfo.lineas.map((l) => l.cantidad).sort()).toEqual([1, 2]);
    expect(app.ventaInfo.total).toBe(3);
    expect(app.ventaInfo.propia).toBe(app.ventaColumna(app.filaReal('trozo_panceta')));
});

test('el modal conserva las partes reales consumidas de una reserva del mismo plato', () => {
    const app = crearApp();
    const parte = [{ nombre: 'Pollada', cantidad: 1, platos: 1, comandaId: 'c1', comanda: 'Comanda 1' }];
    app.abrirVenta({ id: 'pollada', nombre: 'Pollada', clave: 'pollada', claves: ['pollada', 'pechuga-pollo'], venta: 1 }, {
        ventas: [
            { rubro: 'pollada', origen: 'pollada', nombre: 'Pollada', cantidad: 1, detalle: parte },
            { rubro: 'pechuga-pollo', origen: 'pollada', nombre: 'Pollada', cantidad: 1, detalle: parte }
        ], movimientos: []
    });
    expect(app.ventaInfo.lineas[0].cantidad).toBe(2);
    expect(app.ventaInfo.propia).toBe(1);
});

test('editar stock establece apertura y recalcula total sin aumentar ingresos del período', async () => {
    const app = crearApp();
    const guardados = [mov('cuy', 'ingreso', 10, horaAyer('09:00')), mov('cuy', 'ingreso', 2, hora('09:00'))];
    app.rangoVista = () => ({ desde: '2026-11-11', hasta: '2026-11-11' });
    app.fechaCierreVista = () => undefined;
    app.cargarKardex = async () => { pintar(app, guardados); };
    app.paso = async (rubro, tipoProducto, cantidad, motivo, clase, nombre, fecha) => { guardados.push(mov(rubro, clase, cantidad, fecha, motivo, tipoProducto)); };
    app.pulseRowTotal = () => {};
    app.anotarHistorial = () => {};
    await app.cargarKardex();
    app.abrirEditarStock('cuy');
    expect(app.editarStock.crudo).toBe(12);
    app.editarStock.crudo = 7;
    expect(await app.guardarModalStock()).toBe(true);
    const ajuste = guardados[guardados.length - 1];
    expect(ajuste).toMatchObject({ clase: 'ingreso', cantidad: -5, fecha: '2026-11-11T04:00:00-05:00' });
    expect(ajuste.motivo.indexOf('Ajuste apertura')).toBe(0);
    const row = app.filaReal('cuy');
    expect(row.saldoAnterior).toBe(5);
    expect(app.valorTipo(row, 'ingreso', 'crudo')).toBe(2);
    expect(app.ingresoTotalColumna(row)).toBe(7);
    expect(app.saldoRealColumna(row)).toBe(7);
    expect(row.correccion).toBe(0);
});

test('una venta con el modal abierto no altera la apertura escrita ni se pierde al guardar', async () => {
    const app = crearApp();
    const guardados = [mov('cuy', 'ingreso', 10, hora('09:00'))];
    const ventas = [];
    app.rangoVista = () => ({ desde: '2026-11-11', hasta: '2026-11-11' });
    app.fechaCierreVista = () => undefined;
    app.cargarKardex = async () => { pintar(app, guardados, ventas); };
    app.paso = async (rubro, tipoProducto, cantidad, motivo, clase, nombre, fecha) => { guardados.push(mov(rubro, clase, cantidad, fecha, motivo, tipoProducto)); };
    app.pulseRowTotal = () => {};
    app.anotarHistorial = () => {};
    await app.cargarKardex();
    app.abrirEditarStock('cuy');
    ventas.push({ rubro: 'cuy', nombre: 'Cuy', cantidad: 4, fecha: hora('14:00'), detalle: [] });
    app.editarStock.crudo = 8;
    await app.guardarModalStock();
    expect(app.filaReal('cuy')).toMatchObject({ saldoAnterior: 2, ingreso: 10, venta: 4 });
    expect(app.ingresoTotalColumna(app.filaReal('cuy'))).toBe(12);
    expect(app.saldoRealColumna(app.filaReal('cuy'))).toBe(8);
});

test('editar apertura de un día pasado usa el inicio de ese día', () => {
    const app = crearApp();
    app.ymdOperativo = () => '2026-11-17';
    app.activeTab = 'tabla';
    app.periodo = 'ayer';
    expect(app.fechaCierreVista()).toBe('2026-11-17T03:59:00-05:00');
    expect(app.fechaSaldoAnterior()).toBe('2026-11-16T04:00:00-05:00');
    expect(app.notaEditarStock()).toContain('Saldo anterior');
    app.periodo = 'hoy';
    expect(app.fechaCierreVista()).toBeUndefined();
});

test('descuadre: dice qué pasó y cómo resolverlo, sin falsas alarmas', async () => {
    const app = crearApp();
    const guardados = [
        mov('chicharron-chancho', 'ingreso', 5, hora('09:00')),
        mov('cuy', 'ingreso', 1, hora('09:00')),
        mov('pollada', 'ingreso', 3, hora('09:00')),
        mov('yuca', 'ingreso', 6, horaAyer('09:00')),
        mov('yuca', 'ingreso', -2, hora('08:00'), 'Ajuste apertura'),
        mov('helados', 'ingreso', 9, hora('09:00')),
        mov('helados', 'inventario', 7, hora('10:00'), 'Conteo crudo')
    ];
    const ventas = [
        { rubro: 'chicharron-chancho', nombre: 'Chicharrón', cantidad: 2, fecha: hora('12:00'), detalle: [] },
        { rubro: 'cuy', nombre: 'Cuy', cantidad: 3, fecha: hora('12:00'), detalle: [] }
    ];
    app.cargarKardex = async () => { pintar(app, guardados, ventas); };
    app.paso = async (rubro, tipoProducto, cantidad, motivo, clase) => { guardados.push(mov(rubro, clase, cantidad, hora('20:00'), motivo, tipoProducto)); };
    app.fechaCierreVista = () => undefined;
    app.fechaSaldoAnterior = () => hora('04:00');
    await app.cargarKardex();
    const lista = app.filasDescuadre();
    expect(lista.map((i) => [i.clase, i.id])).toEqual([['emergencia', 'cuy'], ['apertura', 'yuca'], ['conteo', 'helados']]);
    expect(lista[0]).toMatchObject({ falta: 2, titulo: 'Faltan 2' });
    expect(app.cuentaDescuadre()).toBe(2);
    await app.resolverDescuadre(lista[0], 'ingreso');
    expect(app.saldoRealColumna(app.filaReal('cuy'))).toBe(0);
    expect(app.emergenciaFila(app.filaReal('cuy'))).toBe(false);
    await app.resolverDescuadre(app.filasDescuadre().find((i) => i.clase === 'apertura'), 'apertura');
    expect(app.saldoAnteriorColumna(app.filaReal('yuca'))).toBe(6);
    expect(app.filasDescuadre().map((i) => i.clase)).toEqual(['conteo']);
    expect(app.cuentaDescuadre()).toBe(0);
});

test('editar stock de filete y octavo no crea apertura pendiente ni modifica sus existencias al consultar Descuadre', () => {
    const app = crearApp();
    app.rangoVista = () => ({ desde: '2026-11-11', hasta: '2026-11-11' });
    const movimientos = [
        mov('filete', 'ingreso', 10, horaAyer('09:00')),
        mov('octavo-pollo', 'ingreso', 20, horaAyer('09:00')),
        mov('filete', 'ingreso', 4, hora('04:00'), 'Ajuste apertura · Editar stock'),
        mov('octavo-pollo', 'ingreso', -3, hora('04:00'), 'Ajuste apertura · Editar stock · pierna')
    ];
    pintar(app, movimientos);
    const antes = JSON.stringify(app.rows);
    expect(app.filasDescuadre().filter((i) => i.clase === 'apertura')).toHaveLength(0);
    expect(app.cuentaDescuadre()).toBe(0);
    expect(app.filaReal('filete').saldoAnterior).toBe(14);
    expect(app.filaReal('octavo_pollo').saldoAnterior).toBe(17);
    expect(JSON.stringify(app.rows)).toBe(antes);
    expect(app.movimientosPeriodo).toBe(movimientos);
});

test('una edición de stock no oculta faltantes reales ni otros ajustes de apertura', () => {
    const app = crearApp();
    app.rangoVista = () => ({ desde: '2026-11-11', hasta: '2026-11-11' });
    pintar(app, [
        mov('filete', 'ingreso', 2, hora('04:00'), 'Ajuste apertura · Editar stock'),
        mov('filete', 'ingreso', 3, hora('04:00'), 'Ajuste apertura'),
        mov('filete', 'egreso', 10, hora('12:00'), 'Venta'),
        mov('yuca', 'ingreso', 1, hora('04:00'), 'Ajuste apertura')
    ]);
    const lista = app.filasDescuadre();
    expect(lista.find((i) => i.id === 'filete' && i.clase === 'apertura').ajuste).toBe(3);
    expect(lista.some((i) => i.id === 'filete' && i.clase === 'emergencia')).toBe(true);
    expect(lista.some((i) => i.id === 'yuca' && i.clase === 'apertura')).toBe(true);
});

test('descuadre: si hay crudo libre, primero se pasa a cocido', async () => {
    const app = crearApp();
    const guardados = [mov('pollo-baby', 'ingreso', 5, hora('09:00')), mov('pollo-baby', 'ingreso', 1, hora('09:00'), 'Ingreso cocido', 'cocido')];
    const ventas = [{ rubro: 'pollo-baby', nombre: 'Pollo baby', cantidad: 3, fecha: hora('12:00'), detalle: [] }];
    app.cargarKardex = async () => { pintar(app, guardados, ventas); };
    app.encolarMovimientos = (movs) => { movs.forEach((m) => guardados.push(mov(m.rubro, m.clase, m.cantidad, hora('20:00'), m.motivo, m.tipoProducto))); };
    app.anotarHistorial = () => {};
    app.pulseRowTotal = () => {};
    await app.cargarKardex();
    const item = app.filasDescuadre()[0];
    expect(item).toMatchObject({ clase: 'emergencia', tipo: 'cocido', falta: 2, crudoLibre: 5 });
    await app.resolverDescuadre(item, 'crudo');
    const row = app.filaReal('pollo_baby');
    expect(app.quedaSinTopeTipo(row, 'cocido')).toBe(0);
    expect(app.saldoRealColumnaTipo(row, 'crudo')).toBe(3);
});

test('el cuadro de ingreso total explica la suma', () => {
    const app = crearApp();
    app.frescosHoy = () => 0;
    pintar(app, [mov('cuy', 'ingreso', 4, horaAyer('09:00')), mov('cuy', 'ingreso', 6, hora('09:00'))]);
    app.abrirIngresoLupa(app.filaReal('cuy'));
    expect(app.ingresoLupa).toMatchObject({ saldoAnterior: 4, ingresoDia: 6, ingresoTotal: 10 });
});

test('la lupa de Queda cuadra con las columnas', () => {
    const app = crearApp();
    pintar(app, [
        mov('cuy', 'ingreso', 4, horaAyer('09:00')),
        mov('cuy', 'ingreso', 6, hora('09:00')),
        mov('cuy', 'regulacion', -1, hora('10:00'), 'Ajuste de stock')
    ], [{ rubro: 'cuy', nombre: 'Cuy', cantidad: 2, fecha: hora('12:00'), detalle: [] }]);
    app.diasMultiplicadorPeriodo = () => 1;
    const info = app.construirProcedimientoSaldoReal(app.filaReal('cuy'));
    expect(info).toMatchObject({ saldoAnterior: 4, ingreso: 6, ingresoTotal: 10, ventas: 2, correccion: -1, quedaSaldoReal: 7, cuadra: true });
});

test('una etiqueta de Transformar no cuenta un ajuste de stock como ingreso', () => {
    const app = crearApp();
    app.rangoTurnoCuadro = () => ({ desde: hora('04:00'), hasta: hora('23:59') });
    app.movimientosTurno = [
        { rubro: 'cuy', clase: 'ingreso', tipoProducto: 'crudo', cantidad: 2, motivo: 'Ingreso crudo', fecha: hora('10:00') },
        { rubro: 'cuy', clase: 'regulacion', tipoProducto: 'crudo', cantidad: 5, motivo: 'Ajuste de stock', fecha: hora('11:00') }
    ];
    expect(app.partesMovimiento('cuy', 'crudo')).toEqual({ ingreso: 2, resto: 0 });
});

test('una bebida que acompaña un plato conserva su nombre', () => {
    const app = crearApp();
    app.asegurarFilasVendidas([{ rubro: 'gaseosa-inca-kola-300ml', nombre: 'Inca Kola 300ml', cantidad: 1, detalle: [{ nombre: 'Seco de Res + frijoles + arroz' }] }]);
    expect(app.filaPorClave('gaseosa-inca-kola-300ml').nombre).toBe('Inca Kola 300ml');
});

describe('descarga manual de octavos en el modal de ventas', () => {
    const fila = { id: 'octavo_pollo', nombre: 'Octavo de pollo', clave: 'octavo-pollo', claves: ['octavo-pollo'], venta: 0 };
    const mov = (cantidad, motivo, extra) => ({
        _id: motivo + cantidad, rubro: 'octavo-pollo', nombre: 'Octavo de pollo', clase: 'egreso',
        tipoProducto: 'crudo', cantidad, motivo, fecha: hora('10:00'), ...extra
    });
    const lineas = (movimientos) => {
        const app = crearApp();
        app.abrirVenta(fila, { ventas: [], movimientos });
        return { app, lineas: app.ventaInfo.lineas };
    };

    test('dice si los octavos fueron de pierna o de pecho', () => {
        const pierna = lineas([mov(40, 'Venta manual · pierna · Para evento', { lote: 'vm-aaaa-1111' })]).lineas[0];
        expect(pierna.usos).toEqual([{ uso: 'Principal — Octavo de pollo · Pierna', cantidad: 40 }]);
        expect(pierna.motivo).toBe('Para evento');
        expect(lineas([mov(3, 'Venta manual · pecho')]).lineas[0].uso).toBe('Principal — Octavo de pollo · Pecho');
    });

    test('una descarga de sector separa cuánto fue de cada corte', () => {
        const { app, lineas: [linea] } = lineas([
            mov(10, 'Venta manual · Eventos · pecho', { lote: 'vm-bbbb-2222' }),
            mov(30, 'Venta manual · Eventos · pierna', { lote: 'vm-bbbb-2222' })
        ]);
        expect(linea.cantidad).toBe(40);
        expect(linea.motivo).toBe('Eventos');
        expect(linea.usos).toEqual([
            { uso: 'Principal — Octavo de pollo · Pecho', cantidad: 10 },
            { uso: 'Principal — Octavo de pollo · Pierna', cantidad: 30 }
        ]);
        app.ventaBusqueda = 'pierna';
        expect(app.lineasVentaVista()).toHaveLength(1);
    });

    test('una descarga antigua sin marca no inventa el corte', () => {
        expect(lineas([mov(2, 'Venta manual')]).lineas[0].uso).toBe('Principal — Octavo de pollo');
    });
});

describe('Procedimiento saldo real de Octavo de pollo', () => {
    test('la lupa de Saldo anterior muestra el reparto guardado sin cambiar el saldo ni cortes de otros cuadros', () => {
        const app = crearApp();
        app.rangoPeriodo = () => ({ desde: '2026-11-11', hasta: '2026-11-12' });
        const movimientos = [
            mov('octavo-pollo', 'ingreso', 176, horaAyer('09:00')),
            mov('octavo-pollo', 'ingreso', 30, hora('04:00'), 'Ajuste apertura · Editar stock · pecho'),
            mov('octavo-pollo', 'ingreso', 30, hora('04:00'), 'Saldo anterior · pecho'),
            mov('octavo-pollo', 'ingreso', 146, hora('04:00'), 'Saldo anterior · pierna'),
            mov('octavo-pollo', 'ingreso', -176, hora('04:00'), 'Saldo anterior · sin separar'),
            mov('octavo-pollo', 'ingreso', -1, hora('12:00'), 'Pasa a Caldo de pollo · pecho')
        ];
        pintar(app, movimientos);
        app.movimientosPeriodo = movimientos.concat([
            mov('octavo-pollo', 'ingreso', 7, '2026-11-12T04:00:00-05:00', 'Saldo anterior · pecho'),
            mov('octavo-pollo', 'ingreso', -7, '2026-11-12T04:00:00-05:00', 'Saldo anterior · sin separar')
        ]);
        const fila = app.filaReal('octavo_pollo');
        const inicial = JSON.stringify(fila.cortesOctavo);
        const stock = app.octavosVisibles();
        app.abrirDesgloseGrupo(fila, 'saldoAnterior');
        const octavo = app.desgloseGrupo.filas.find((f) => f.id === fila.id);
        expect(octavo.total).toBe(206);
        expect(octavo.cortes.map((c) => c.texto)).toEqual(['Pierna 146', 'Pecho 60']);
        expect(JSON.stringify(fila.cortesOctavo)).toBe(inicial);
        expect(app.octavosVisibles()).toEqual(stock);
        app.abrirDesgloseGrupo(fila, 'ingresoTotal');
        expect(app.desgloseGrupo.filas.find((f) => f.id === fila.id).cortes.map((c) => c.texto)).toContain('Sin separar 176');
    });

    const textos = (lista) => lista.map((c) => c.texto);

    test('dice cuánto incluye de pierna y de pecho el saldo anterior y lo que queda', () => {
        const app = crearApp();
        const row = app.filaReal('octavo_pollo');
        Object.assign(row, {
            saldoAnterior: 90, crudo: 80,
            cortesOctavo: { inicial: { pierna: 60, pecho: 30 }, queda: { pierna: 60, pecho: 30 } }
        });
        const info = app.construirProcedimientoSaldoReal(row);
        expect(textos(info.pasos[0].cortes)).toEqual(['Pierna 60', 'Pecho 30']);
        const saldoQueda = info.quedaSaldoReal;
        const esperado = ['Pierna 60', 'Pecho 30'];
        if (saldoQueda > 90) esperado.push('Sin separar ' + app.formatNum(saldoQueda - 90));
        if (saldoQueda < 90) esperado.push('Salió sin corte −' + app.formatNum(90 - saldoQueda));
        expect(textos(info.cortesSueltas)).toEqual(esperado);
    });

    test('lo que las marcas no explican se dice aparte', () => {
        const app = crearApp();
        expect(textos(app.cortesDeSaldoOctavo({ pierna: 60, pecho: 30 }, 100))).toEqual(['Pierna 60', 'Pecho 30', 'Sin separar 10']);
        expect(textos(app.cortesDeSaldoOctavo({ pierna: 60, pecho: 30 }, 80))).toEqual(['Pierna 60', 'Pecho 30', 'Salió sin corte −10']);
    });

    test('otras filas no muestran cortes', () => {
        const app = crearApp();
        const info = app.construirProcedimientoSaldoReal(app.filaReal('pierna'));
        expect(info.pasos[0].cortes).toBeNull();
        expect(info.cortesSueltas).toBeNull();
    });
});

test('los cuadros de octavos del procedimiento usan el mismo saldo que Queda', () => {
    const app = crearApp();
    const row = app.filaReal('octavo_pollo');
    row.cortesOctavo = { inicial: { pierna: 60, pecho: 30 }, queda: { pierna: 60, pecho: 20 } };
    const { octavos } = app.construirProcedimientoSaldoReal(row);
    expect(octavos.pierna.sueltos).toBe(60);
    expect(octavos.pecho.sueltos).toBe(20);
});


describe('productos con grupo en la tabla', () => {
    const preparar = () => {
        const app = crearApp();
        pintar(app, [
            mov('pierna-pollo', 'ingreso', 10, horaAyer('09:00')),
            mov('pollada', 'ingreso', 4, horaAyer('09:00')),
            mov('pierna-pollo', 'ingreso', 20, hora('09:00')),
            mov('pierna-pollo', 'ingreso', -3, hora('10:00'), 'Pasa a Pollada'),
            mov('pollada', 'ingreso', 3, hora('10:00'), 'Sale de Pierna de Pollo')
        ]);
        app.encolarMovimientos = jest.fn();
        app.anotarMovs = () => {};
        app.pulseRowTotal = () => {};
        app.productoBloqueado = () => false;
        return { app, pierna: app.filaReal('pierna') };
    };

    test('cada cuadro muestra el total del grupo y la lupa suma lo mismo', () => {
        const { app, pierna } = preparar();
        expect(app.cifraGrupo(pierna, 'saldoAnterior')).toBe(14);
        expect(app.cifraGrupo(pierna, 'ingreso')).toBe(23);
        expect(app.cifraGrupo(pierna, 'ingresoTotal')).toBe(37);
        expect(app.cifraGrupo(pierna, 'transformacion')).toBe(3);
        expect(app.cifraGrupo(pierna, 'queda')).toBe(34);
        ['saldoAnterior', 'ingresoTotal', 'queda'].forEach((columna) => {
            app.abrirDesgloseGrupo(pierna, columna);
            const info = app.desgloseGrupo;
            expect(info.filas[0]).toMatchObject({ id: 'pierna', propio: true });
            expect(info.filas.map((f) => f.id)).toEqual(expect.arrayContaining(['pollada', 'pierna_lena', 'pollo_pachamanca']));
            expect(info.filas.reduce((a, f) => a + f.total, 0)).toBe(info.total);
            expect(info.total).toBe(app.cifraGrupo(pierna, columna));
        });
    });

    test('un producto sin platos sigue mostrando solo lo suyo y no abre los modales de grupo', () => {
        const app = crearApp();
        pintar(app, [mov('cuy', 'ingreso', 5, hora('10:00'))]);
        const cuy = app.filaReal('cuy');
        expect(app.cifraGrupo(cuy, 'queda')).toBe(5);
        app.abrirIngresoGrupo(cuy);
        app.abrirDesgloseGrupo(cuy, 'queda');
        expect(app.ingresoGrupo).toBeNull();
        expect(app.desgloseGrupo).toBeNull();
    });

    test('ingresar suma stock en cada producto sin transformar y coincide con Transformar', () => {
        const { app, pierna } = preparar();
        const pollada = app.filaReal('pollada');
        const piernaAntes = app.saldoRealColumna(pierna);
        const polladaAntes = app.calcSaldoTipo(pollada, 'cocido');
        app.abrirIngresoGrupo(pierna);
        const lineas = app.ingresoGrupo.lineas;
        expect(lineas[0]).toMatchObject({ id: 'pierna', principal: true });
        lineas[0].cuadros[0].valor = '5';
        lineas.find((l) => l.id === 'pollada').cuadros.find((c) => c.tipo === 'cocido').valor = '2';
        expect(app.totalIngresoGrupo()).toBe(7);
        expect(app.guardarIngresoGrupo()).toBe(true);
        expect(app.ingresoGrupo).toBeNull();
        expect(app.saldoRealColumna(pierna)).toBe(piernaAntes + 5);
        expect(app.calcSaldoTipo(pollada, 'cocido')).toBe(polladaAntes + 2);
        const movs = app.encolarMovimientos.mock.calls.flatMap((c) => c[0]);
        expect(movs.map((m) => [m.rubro, m.tipoProducto, m.clase, m.cantidad, m.motivo])).toEqual([
            ['pierna-pollo', 'crudo', 'ingreso', 5, 'Ingreso independiente crudo'],
            ['pollada', 'cocido', 'ingreso', 2, 'Ingreso independiente cocido']
        ]);
    });

    test('el ingreso de octavos se guarda por pierna o pecho', () => {
        const app = crearApp();
        pintar(app, []);
        app.encolarMovimientos = jest.fn();
        app.anotarMovs = () => {};
        app.pulseRowTotal = () => {};
        app.productoBloqueado = () => false;
        app.abrirIngresoGrupo(app.filaReal('octavo_pollo'));
        const cuadros = app.ingresoGrupo.lineas[0].cuadros;
        expect(cuadros.map((c) => c.etiqueta)).toEqual(['Pierna', 'Pecho']);
        cuadros[0].valor = '8';
        app.guardarIngresoGrupo();
        expect(app.encolarMovimientos.mock.calls[0][0][0]).toMatchObject({ rubro: 'octavo-pollo', cantidad: 8, motivo: 'Ingreso independiente crudo · pierna' });
    });

    test('no acepta negativos ni un ingreso vacío', () => {
        const { app, pierna } = preparar();
        app.abrirIngresoGrupo(pierna);
        expect(app.guardarIngresoGrupo()).toBe(false);
        app.ingresoGrupo.lineas[0].cuadros[0].valor = '-3';
        expect(app.guardarIngresoGrupo()).toBe(false);
        expect(app.ingresoGrupo.error).toMatch(/positivas/);
        expect(app.encolarMovimientos).not.toHaveBeenCalled();
    });

    test('la lupa de Ingreso separa lo ingresado de lo transformado en todo el grupo', () => {
        const { app, pierna } = preparar();
        app.movimientosPeriodo = app.movimientosPeriodo.filter((m) => new Date(m.fecha) >= new Date(hora('04:00')));
        const origen = app.origenIngresoDe(pierna);
        expect(origen.total).toBe(23);
        expect(origen.transformado).toBe(3);
        expect(origen.anotado).toBe(20);
        app.abrirIngresoGrupo(pierna);
        expect(app.ingresoGrupo.transformaciones).toHaveLength(1);
        expect(app.ingresoGrupo.transformadoSale).toBe(3);
    });
});


describe('modales del grupo de Octavo de pollo', () => {
    const textos = (l) => (l || []).map((c) => c.texto);
    const preparar = () => {
        const app = crearApp();
        pintar(app, []);
        const octavo = app.filaReal('octavo_pollo');
        octavo.cortesOctavo = { inicial: { pierna: 6, pecho: 4 }, queda: { pierna: 6, pecho: 4 } };
        octavo.saldoAnterior = 10;
        octavo.crudo = 10;
        app.pulseRowTotal = () => {};
        return { app, octavo };
    };

    test('el reparto dice cuánto es de pierna y de pecho en cada fila', () => {
        const { app, octavo } = preparar();
        app.abrirDesgloseGrupo(octavo, 'saldoAnterior');
        const fila = app.desgloseGrupo.filas.find((f) => f.id === 'octavo_pollo');
        expect(textos(fila.cortes)).toEqual(['Pierna 6', 'Pecho 4']);
        app.abrirDesgloseGrupo(octavo, 'queda');
        expect(textos(app.desgloseGrupo.filas.find((f) => f.id === 'octavo_pollo').cortes)).toEqual(['Pierna 6', 'Pecho 4']);
        expect(app.desgloseGrupo.filas.every((f) => Array.isArray(f.cortes))).toBe(true);
    });

    test('el modal de ingreso dice cuánto hay de pierna y de pecho, también en cada plato', () => {
        const { app, octavo } = preparar();
        app.abrirIngresoGrupo(octavo);
        const principal = app.ingresoGrupo.lineas[0];
        expect(textos(principal.hayCortes)).toEqual(['Pierna 6', 'Pecho 4']);
        expect(principal.cuadros.map((c) => [c.etiqueta, c.hay])).toEqual([['Pierna', 6], ['Pecho', 4]]);
        const plato = app.ingresoGrupo.lineas.find((l) => l.id === 'arroz_con_pollo');
        expect(plato.cuadros.map((c) => c.etiqueta)).toEqual(expect.arrayContaining(['Pierna crudo', 'Pecho crudo']));
        expect(plato.hayCortes).toHaveLength(2);
    });
});
