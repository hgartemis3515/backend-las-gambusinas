const { aplicarMapa } = require('../src/utils/inventarioSalidaVentas');
const { filasDeRubros } = require('../src/utils/inventarioRubros');

function dia(ymd, hora) {
    return new Date(`${ymd}T${hora}-05:00`);
}

test('cada gaseosa y cada licor descuentan su propia fila', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Inca Kola 1/2 litro', cantidad: 2 },
        { nombre: 'Vino tinto', cantidad: 1 }
    ]);
    expect(porRubro['gaseosa-inca-kola-1-2-litro']).toBe(2);
    expect(porRubro['licor-vino-tinto']).toBe(1);
    expect(porRubro.gaseosas).toBeUndefined();
});

test('el cerdo de pachamanca del reporte de platos descuenta cerdo pachamanca', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Cerdo de pachamanca', cantidad: 4 },
        { nombre: 'Cerdo pachamanca', cantidad: 1 }
    ]);
    expect(porRubro['pachamanca-chancho']).toBe(5);
});

test('10 leñas del reporte son 10 de salida de pollo leña', () => {
    const porRubro = aplicarMapa([
        { nombre: '1/4 pollo a la leña', cantidad: 10 },
        { nombre: 'Ceviche', cantidad: 4 }
    ]);
    expect(porRubro['pollo-lena']).toBe(10);
    expect(porRubro.ceviche).toBeUndefined();
});

test('un filete con papas y arroz descuenta filete, papas y arroz, y puede dejar el saldo en negativo', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Filete de pollo + papas fritas + arroz + ensalada', cantidad: 3 }
    ]);
    expect(porRubro.filete).toBe(3);
    expect(porRubro.papas).toBe(3);
    expect(porRubro['arroz-tipo-pollo']).toBe(3);
    const { aplicarVentasEnFilas } = require('../src/utils/inventarioKardex');
    const ajustadas = aplicarVentasEnFilas([{
        rubro: 'filete',
        plato: 'filete',
        tipoProducto: 'cocido',
        cierre: 0,
        baja: 0,
        umbral: 0
    }], [{ rubro: 'filete', cantidad: 1 }]);
    expect(ajustadas[0].cierre).toBe(-1);
});

test('la venta de reportes baja el saldo que mira la alerta, no el cierre guardado', () => {
    const { aplicarVentasEnFilas, alertasDeFilas } = require('../src/utils/inventarioKardex');
    const filas = [{
        rubro: 'pollo-lena',
        plato: 'pollo-lena',
        nombre: 'Pollo leña',
        tipoProducto: 'cocido',
        cierre: 20,
        baja: 20,
        umbral: 12,
        critico: false
    }];
    const ajustadas = aplicarVentasEnFilas(filas, [{ rubro: 'pollo-lena', cantidad: 10 }]);
    expect(filas[0].cierre).toBe(20);
    expect(ajustadas[0].cierre).toBe(10);
    expect(ajustadas[0].critico).toBe(true);
    expect(alertasDeFilas(ajustadas)).toHaveLength(1);
});

test('un ingreso guardado no se convierte en egreso', () => {
    const guardados = [
        { rubro: 'pollo-lena', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 20, fecha: dia('2026-10-12', '12:00:00') }
    ];
    const fila = filasDeRubros(guardados, dia('2026-10-12', '04:00:00'), dia('2026-10-13', '03:59:59'), {})
        .find((f) => f.rubro === 'pollo-lena' && f.tipoProducto === 'cocido');
    expect(fila.egreso).toBe(0);
    expect(fila.cierre).toBe(20);
});

test('el filete junior come 0.5, la fuente come 2 y el resto de platos de filete come 1', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Filete junior', cantidad: 2 },
        { nombre: 'Fuente de Chicharrón pollo', cantidad: 1 },
        { nombre: 'Arroz chaufa de pollo', cantidad: 1 },
        { nombre: 'Chicharrón de pollo acevichada', cantidad: 1 },
        { nombre: 'Chicharrón de pollo a la BBQ', cantidad: 1 },
        { nombre: 'Chicharrón de pollo chico + yuca frita + zarza criolla', cantidad: 1 },
        { nombre: 'Lomo saltado de pollo', cantidad: 1 }
    ]);
    expect(porRubro.filete).toBe(2 * 0.5 + 2 + 1 + 1 + 1 + 1 + 1);
    expect(porRubro['chaufa-pollo']).toBeUndefined();
    expect(porRubro['chi-pollo-bbq']).toBeUndefined();
    expect(porRubro['salt-pollo']).toBeUndefined();
});

test('el arroz con pato de pecho come pechuga y el de pierna come pierna', () => {
    const pecho = aplicarMapa([{ nombre: 'Arroz con pato pecho', cantidad: 2 }]);
    expect(pecho['pechuga-pato']).toBe(2);
    expect(pecho['pierna-pato']).toBeUndefined();
    expect(pecho['arroz-pato']).toBe(2);
    const partido = aplicarMapa([{
        nombre: 'Arroz con pato',
        cantidad: 3,
        cortes: { Pecho: 2, Pierna: 1 }
    }]);
    expect(partido['pechuga-pato']).toBe(2);
    expect(partido['pierna-pato']).toBe(1);
    expect(partido['arroz-pato']).toBe(3);
    const sinCorte = aplicarMapa([{ nombre: 'Arroz con pato', cantidad: 1 }]);
    expect(sinCorte['pechuga-pato']).toBeUndefined();
    expect(sinCorte['arroz-pato']).toBe(1);
});

test('la pota solo sale en ceviche de chicharrón de pota y en chicharrón de pota', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Ceviche de chicharrón de pota', cantidad: 2 },
        { nombre: 'Chicharrón de pota', cantidad: 1 },
        { nombre: 'Chicha de pota', cantidad: 4 }
    ]);
    expect(porRubro.pota).toBe(3);
    expect(porRubro.ceviche).toBeUndefined();
});

test('la venta del día entra en salida y al día siguiente abre el saldo anterior', () => {
    const movs = [
        { rubro: 'pollo-lena', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 20, fecha: dia('2026-10-12', '12:00:00') },
        { rubro: 'pollo-lena', tipoProducto: 'cocido', clase: 'egreso', cantidad: 10, fecha: dia('2026-10-12', '12:00:00') }
    ];
    const hoy = filasDeRubros(movs, dia('2026-10-12', '04:00:00'), dia('2026-10-13', '03:59:59'), {})
        .find((f) => f.rubro === 'pollo-lena' && f.tipoProducto === 'cocido');
    const manana = filasDeRubros(movs, dia('2026-10-13', '04:00:00'), dia('2026-10-14', '03:59:59'), {})
        .find((f) => f.rubro === 'pollo-lena' && f.tipoProducto === 'cocido');
    expect(hoy.egreso).toBe(10);
    expect(hoy.ingresos).toBe(20);
    expect(manana.saldoInicial).toBe(hoy.cierre);
    expect(manana.egreso).toBe(0);
    expect(manana.ingresos).toBe(0);
});
