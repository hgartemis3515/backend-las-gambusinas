const { aplicarMapa } = require('../src/utils/inventarioSalidaVentas');
const { filasDeRubros } = require('../src/utils/inventarioRubros');

function dia(ymd, hora) {
    return new Date(`${ymd}T${hora}-05:00`);
}

test('10 leñas del reporte son 10 de salida de pollo leña', () => {
    const porRubro = aplicarMapa([
        { nombre: '1/4 pollo a la leña', cantidad: 10 },
        { nombre: 'Ceviche', cantidad: 4 }
    ]);
    expect(porRubro['pollo-lena']).toBe(10);
    expect(porRubro.ceviche).toBeUndefined();
});

test('las ventas virtuales de reportes no bajan el saldo real', () => {
    const guardados = [
        { rubro: 'pollo-lena', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 20, fecha: dia('2026-10-12', '12:00:00') }
    ];
    const fila = filasDeRubros(guardados, dia('2026-10-12', '04:00:00'), dia('2026-10-13', '03:59:59'), {})
        .find((f) => f.rubro === 'pollo-lena' && f.tipoProducto === 'cocido');
    expect(fila.egreso).toBe(0);
    expect(fila.cierre).toBe(20);
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
