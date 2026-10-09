const { armarKardex, alertasDeFilas, filaDesdeSumas } = require('../src/utils/inventarioKardex');
const { filasDeRubros, sumarFilas } = require('../src/utils/inventarioRubros');

function dia(ymd, hora) {
    return new Date(`${ymd}T${hora}-05:00`);
}

const platos = [
    { _id: 'arroz', id: 1, nombre: 'Arroz', isActive: true, alertaCritica: { crudo: 0, cocido: 5 } },
    { _id: 'lomo', id: 2, nombre: 'Lomo', isActive: true, alertaCritica: { crudo: 0, cocido: 2 } },
    { _id: 'viejo', id: 3, nombre: 'Fuera', isActive: false, alertaCritica: { crudo: 1, cocido: 1 } }
];

test('saldo final es antes de la regulación y lo que baja abre el día siguiente', () => {
    const movs = [
        { plato: 'arroz', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 10, fecha: dia('2026-10-06', '10:00:00') },
        { plato: 'arroz', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 4, fecha: dia('2026-10-07', '11:00:00') },
        { plato: 'arroz', tipoProducto: 'cocido', clase: 'egreso', cantidad: 6, fecha: dia('2026-10-07', '19:00:00') },
        { plato: 'arroz', tipoProducto: 'cocido', clase: 'regulacion', cantidad: -1, fecha: dia('2026-10-07', '21:00:00') },
        { plato: 'arroz', tipoProducto: 'cocido', clase: 'egreso', cantidad: 2, fecha: dia('2026-10-08', '13:00:00') }
    ];
    const siete = armarKardex(platos, movs, dia('2026-10-07', '00:00:00'), dia('2026-10-07', '23:59:59'))
        .find((f) => f.plato === 'arroz' && f.tipoProducto === 'cocido');
    expect(siete).toMatchObject({
        saldoInicial: 10, ingresos: 4, total: 14, egreso: 6, saldoFinal: 8, regulacion: -1, baja: 7
    });
    const ocho = armarKardex(platos, movs, dia('2026-10-08', '00:00:00'), dia('2026-10-08', '23:59:59'))
        .find((f) => f.plato === 'arroz' && f.tipoProducto === 'cocido');
    expect(ocho).toMatchObject({
        saldoInicial: 7, ingresos: 0, total: 7, egreso: 2, saldoFinal: 5, regulacion: 0, baja: 5
    });
});

test('ingreso 10 deja saldo final y baja en 10', () => {
    const fila = filaDesdeSumas(0, 10, 0, 0);
    expect(fila).toMatchObject({ total: 10, saldoFinal: 10, baja: 10 });
});

test('regulación positiva no cambia el saldo final', () => {
    const fila = filaDesdeSumas(8, 0, 0, 2);
    expect(fila.saldoFinal).toBe(8);
    expect(fila.baja).toBe(10);
});

test('umbral 0 no alerta y el saldo en el mínimo sí', () => {
    const movs = [
        { plato: 'arroz', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 5, fecha: dia('2026-10-08', '09:00:00') },
        { plato: 'lomo', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 2, fecha: dia('2026-10-08', '09:00:00') }
    ];
    const filas = armarKardex(platos, movs, dia('2026-10-08', '00:00:00'), dia('2026-10-08', '23:59:59'));
    const arrozCrudo = filas.find((f) => f.plato === 'arroz' && f.tipoProducto === 'crudo');
    expect(arrozCrudo.baja).toBe(0);
    expect(arrozCrudo.critico).toBe(false);
    const alertas = alertasDeFilas(filas);
    expect(alertas.map((a) => a.nombre).sort()).toEqual(['Arroz', 'Lomo']);
    expect(filas.some((f) => f.plato === 'viejo')).toBe(false);
});

test('la pachamanca del kardex suma pollo y res', () => {
    const movs = [
        { rubro: 'pachamanca-pollo', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 4, fecha: dia('2026-10-08', '12:00:00') },
        { rubro: 'pachamanca-res', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 2, fecha: dia('2026-10-08', '12:00:00') }
    ];
    const filas = filasDeRubros(movs, dia('2026-10-08', '00:00:00'), dia('2026-10-08', '23:59:59'), {});
    const partes = ['pachamanca-pollo', 'pachamanca-res'].map((clave) => (
        filas.find((f) => f.rubro === clave && f.tipoProducto === 'cocido')
    ));
    expect(sumarFilas(partes).ingresos).toBe(6);
    expect(sumarFilas(partes).total).toBe(6);
    expect(sumarFilas(partes).baja).toBe(6);
});

test('el menos de un ingreso baja esa columna', () => {
    const movs = [
        { rubro: 'trucha', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 3, fecha: dia('2026-10-08', '10:00:00') },
        { rubro: 'trucha', tipoProducto: 'cocido', clase: 'ingreso', cantidad: -1, fecha: dia('2026-10-08', '11:00:00') }
    ];
    const fila = filasDeRubros(movs, dia('2026-10-08', '00:00:00'), dia('2026-10-08', '23:59:59'), {})
        .find((f) => f.rubro === 'trucha' && f.tipoProducto === 'cocido');
    expect(fila.ingresos).toBe(2);
    expect(fila.total).toBe(2);
    expect(fila.baja).toBe(2);
});
