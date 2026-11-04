const { aplicarMapa, filasDelContador, indiceBebidas } = require('../src/utils/inventarioSalidaVentas');
const { filasDeRubros } = require('../src/utils/inventarioRubros');

function dia(ymd, hora) {
    return new Date(`${ymd}T${hora}-05:00`);
}

test('arroz con pollo, caldo y olla salen del menu pecho o pierna', () => {
    const arroz = aplicarMapa([{ nombre: 'Arroz con pollo Pec', cantidad: 2 }]);
    expect(arroz['arroz-tipo-pollo']).toBe(2);
    expect(arroz['menu-pecho']).toBe(2);
    expect(arroz['pechuga-pollo']).toBeUndefined();
    const caldo = aplicarMapa([{ nombre: 'Caldo de pollo Pie', cantidad: 2 }]);
    expect(caldo['menu-pierna']).toBe(2);
    const olla = aplicarMapa([{ nombre: 'Pollo a la olla', cantidad: 4 }]);
    expect(olla['menu-pecho']).toBe(4);
});

test('cada tipo de arroz descuenta su fila y el chaufa de pollo no', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Arroz verde', cantidad: 2 },
        { nombre: 'Arroz con mariscos', cantidad: 1 },
        { nombre: 'Arroz chaufa', cantidad: 3 },
        { nombre: 'Arroz blanco', cantidad: 1 },
        { nombre: 'Arroz chaufa de pollo', cantidad: 1 }
    ]);
    expect(porRubro['arroz-verde']).toBe(2);
    expect(porRubro['arroz-mariscos']).toBe(1);
    expect(porRubro['arroz-chaufa']).toBe(3);
    expect(porRubro['arroz-blanco']).toBe(1);
    expect(porRubro['chaufa-pollo']).toBe(1);
    expect(porRubro.filete).toBeUndefined();
});

test('la pollada de la carta descuenta pollada, papas y arroz', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Pollada + papa fritas + Arroz + ensalada', cantidad: 2 }
    ]);
    expect(porRubro.pollada).toBe(2);
    expect(porRubro.papas).toBe(2);
    expect(porRubro['arroz-blanco']).toBe(2);
});

test('una gaseosa pedida como guarnición descuenta su fila', () => {
    const filas = filasDelContador({
        platos: [{ nombre: 'Filete de pollo', cantidad: 1 }],
        guarniciones: [{ nombre: 'Inca Kola', cantidad: 2 }]
    });
    expect(aplicarMapa(filas)['gaseosa-inca-kola']).toBe(2);
    expect(aplicarMapa(filas)['filete-pollo']).toBe(1);
});

test('un vino sin la palabra vino descuenta su fila de licor', () => {
    const bebidas = indiceBebidas([{ nombre: 'Tabernero Borgoña', categoria: 'VINO', grupoSos: 'Alcohol' }]);
    const porRubro = aplicarMapa([{ nombre: 'Tabernero Borgoña', cantidad: 1 }], undefined, bebidas);
    expect(porRubro['licor-tabernero-borgona']).toBe(1);
});

test('cada agua de la carta descuenta su fila de bebidas', () => {
    const bebidas = indiceBebidas([
        { nombre: 'Agua mineral 1/2', categoria: 'BEBIDAS, REFRESCOS Y JUGOS' },
        { nombre: 'Agua San Mateo 1/2 Ltr.', categoria: 'BEBIDAS FRÍAS (Carta normal)' },
        { nombre: 'Agua San Mateo 2 1/2 Ltrs.', categoria: 'BEBIDAS FRÍAS (Carta normal)' }
    ]);
    const porRubro = aplicarMapa([
        { nombre: 'Agua mineral 1/2', cantidad: 3 },
        { nombre: 'Agua San Mateo 1/2 Ltr.', cantidad: 1 },
        { nombre: 'Agua San Mateo 2 1/2 Ltrs.', cantidad: 2 }
    ], undefined, bebidas);
    expect(porRubro['agua-agua-mineral-1-2']).toBe(3);
    expect(porRubro['agua-agua-san-mateo-1-2-ltr']).toBe(1);
    expect(porRubro['agua-agua-san-mateo-2-1-2-ltrs']).toBe(2);
});

test('delicia y helado descuentan su fila', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Delicia', cantidad: 4 },
        { nombre: 'Helado Artesanal', cantidad: 2 }
    ]);
    expect(porRubro.delicias).toBe(4);
    expect(porRubro.helados).toBe(2);
});

test('la salchipapa descuenta un hotdog', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Salchipapa', cantidad: 5 },
        { nombre: 'Hotdog', cantidad: 1 }
    ]);
    expect(porRubro.hotdog).toBe(6);
    expect(porRubro.papas).toBeUndefined();
});

test('cada gaseosa y cada licor descuentan su propia fila', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Inca Kola 1/2 litro', cantidad: 2 },
        { nombre: 'Vino tinto', cantidad: 1 }
    ]);
    expect(porRubro['gaseosa-inca-kola-1-2-litro']).toBe(2);
    expect(porRubro['licor-vino-tinto']).toBe(1);
    expect(porRubro.gaseosas).toBeUndefined();
});

test('el plato bistec descuenta carne bistec', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Bistec', cantidad: 2 },
        { nombre: 'Bisteck', cantidad: 1 },
        { nombre: 'Bisteck a la parrilla + papas fritas + arroz + ensalada', cantidad: 1 },
        { nombre: 'Lomo saltado de bistec', cantidad: 3 },
        { nombre: 'Chaufa de bistec', cantidad: 2 }
    ]);
    expect(porRubro.bisteck).toBe(4);
});

test('humita sale del plato Humita y una sola vez por cada pachamanca', () => {
    const { unidadesHumitaPachamanca, filasDelContador } = require('../src/utils/inventarioSalidaVentas');
    const { armarContadorPlatos } = require('../src/utils/contadorPlatosReporte');
    const humita = aplicarMapa([{ nombre: 'Humita', cantidad: 3 }]);
    expect(humita.humita).toBe(3);
    const porPlato = aplicarMapa([
        { nombre: 'Pachamanca 1 sabor', cantidad: 2 },
        { nombre: 'Pachamanca 2 sabores', cantidad: 1 },
        { nombre: 'Pachamanca 3 sabores', cantidad: 1 },
        { nombre: 'Pachamanca 4 sabores', cantidad: 1 }
    ]);
    expect(porPlato.humita).toBe(5);
    const sabor = aplicarMapa([{ nombre: 'Pollo de pachamanca', cantidad: 4 }]);
    expect(sabor.humita).toBeUndefined();
    expect(sabor['pachamanca-pollo']).toBe(4);

    const plato = {
        _id: 'p3',
        nombre: 'Pachamanca 3 sabores',
        complementosUnidosAlPlato: true,
        complementos: [{ grupo: 'Sabores', opciones: [{ nombre: 'Pollo' }, { nombre: 'Cerdo' }, { nombre: 'Res' }] }]
    };
    const linea = {
        platoId: 'p3',
        nombre: plato.nombre,
        cantidad: 2,
        complementos: [
            { grupo: 'Sabores', opcion: 'Pollo', cantidad: 1 },
            { grupo: 'Sabores', opcion: 'Cerdo', cantidad: 1 },
            { grupo: 'Sabores', opcion: 'Res', cantidad: 1 }
        ]
    };
    expect(unidadesHumitaPachamanca([linea], [plato]).total).toBe(2);
    const contador = armarContadorPlatos([linea], [plato]);
    const deSabores = aplicarMapa(filasDelContador(contador));
    expect(deSabores.humita).toBeUndefined();
    expect(deSabores['pachamanca-pollo']).toBe(2);
    expect(deSabores['pachamanca-chancho']).toBe(2);
    expect(deSabores['pachamanca-res']).toBe(2);
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

test('el mixto vendido como pierna baja pierna de pollo y el de pecho baja pecho a la leña', () => {
    const { armarContadorPlatos } = require('../src/utils/contadorPlatosReporte');
    const cuarto = {
        _id: 'c14',
        nombre: '1/4 Pollo a la leña + papa frita + arroz + ensalada',
        categoria: 'LEÑA CON POLLO Y CHANCHO',
        complementos: [
            { grupo: 'Variacion', anexarVarianteAlNombre: true, opciones: [{ nombre: 'Pie' }, { nombre: 'Pec' }] }
        ]
    };
    const mixto = {
        _id: 'mx',
        nombre: 'Mixto leña 1/4 pollo + 300gr panceta + P-frita + Arroz + ensalada',
        categoria: 'LEÑA CON POLLO Y CHANCHO',
        complementos: [
            { grupo: 'Tipo', anexarVarianteAlNombre: true, opciones: [{ nombre: 'Pie' }, { nombre: 'Pec' }] }
        ]
    };
    const linea = (plato, opcion) => ({
        platoId: plato._id,
        nombre: plato.nombre,
        cantidad: 1,
        soles: 0,
        complementos: [{ grupo: plato.complementos[0].grupo, opcion, cantidad: 1 }]
    });
    const contador = armarContadorPlatos([
        linea(cuarto, 'Pec'),
        linea(mixto, 'Pie'),
        linea(mixto, 'Pec')
    ], [cuarto, mixto]);
    expect(contador.pollos.find((r) => r.nombre === '1/4 pollo a la leña').cantidad).toBe(1);
    expect(contador.pollos.find((r) => r.nombre === 'Mixto a la leña Pecho').cantidad).toBe(1);
    expect(contador.pollos.find((r) => r.nombre === 'Mixto a la leña Pierna').cantidad).toBe(1);
    const porRubro = aplicarMapa(filasDelContador(contador));
    expect(porRubro['pollo-lena']).toBe(2);
    expect(porRubro['pierna-lena']).toBe(1);
    expect(porRubro['pierna-pollo']).toBeUndefined();
    expect(porRubro['trozo-panceta']).toBe(6);
});

test('el cuarto pierna va a pierna de pollo y el mix pierna a pierna a la leña', () => {
    const porRubro = aplicarMapa([
        { nombre: '1/4 pollo a la leña', cantidad: 3, cortes: { Pec: 2, Pie: 1 } },
        { nombre: 'Mixto leña 1/4 pollo', cantidad: 2, cortes: { Pec: 1, Pie: 1 } }
    ]);
    expect(porRubro['pollo-lena']).toBe(3);
    expect(porRubro['pierna-pollo']).toBe(1);
    expect(porRubro['pierna-lena']).toBe(1);
    expect(porRubro['trozo-panceta']).toBe(6);
});

test('un filete con papas y arroz descuenta filete, papas y arroz, y puede dejar el saldo en negativo', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Filete de pollo + papas fritas + arroz + ensalada', cantidad: 3 }
    ]);
    expect(porRubro['filete-pollo']).toBe(3);
    expect(porRubro.filete).toBeUndefined();
    expect(porRubro.papas).toBe(3);
    expect(porRubro['arroz-blanco']).toBe(3);
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

test('cada plato de filete baja su propia fila y la fuente sigue bajando filete', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Filete junior', cantidad: 2 },
        { nombre: 'Fuente de Chicharrón pollo', cantidad: 1 },
        { nombre: 'Arroz chaufa de pollo', cantidad: 1 },
        { nombre: 'Chicharrón de pollo acevichada', cantidad: 1 },
        { nombre: 'Chicharrón de pollo a la BBQ', cantidad: 1 },
        { nombre: 'Chicharrón de pollo chico + yuca frita + zarza criolla', cantidad: 1 },
        { nombre: 'Lomo saltado de pollo', cantidad: 1 }
    ]);
    expect(porRubro['filete-junior']).toBe(1);
    expect(porRubro.filete).toBeUndefined();
    expect(porRubro['chicharron-pollo']).toBe(3);
    expect(porRubro['chaufa-pollo']).toBe(1);
    expect(porRubro['chi-pollo-acevichada']).toBe(1);
    expect(porRubro['chi-pollo-bbq']).toBe(1);
    expect(porRubro['salt-pollo']).toBe(1);
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
    expect(porRubro['pieza-pota']).toBe(3);
    expect(porRubro.pota).toBeUndefined();
    expect(porRubro.ceviche).toBeUndefined();
});

test('una gaseosa vendida tiene fila aunque nadie la haya ingresado', () => {
    const { filasDeRubros, extrasDeVentas } = require('../src/utils/inventarioRubros');
    const ventas = [{ rubro: 'gaseosa-inca-kola-1-2-litro', nombre: 'Inca Kola 1/2 litro', cantidad: 2, tipoProducto: 'crudo' }];
    const filas = filasDeRubros([], dia('2026-10-31', '04:00:00'), dia('2026-11-01', '03:59:59'), {}, extrasDeVentas(ventas));
    const fila = filas.find((f) => f.rubro === 'gaseosa-inca-kola-1-2-litro' && f.tipoProducto === 'crudo');
    expect(fila).toBeTruthy();
    expect(fila.nombre).toBe('Inca Kola 1/2 litro');
    expect(fila.egreso).toBe(0);
});

test('el medio pollo a la leña baby solo descuenta 0.5 de pollo baby', () => {
    const porRubro = aplicarMapa([
        { nombre: '1/2 pollo a la leña baby', cantidad: 4 },
        { nombre: '1/2 Pollo a la leña BABY PF + Ensalada', cantidad: 2 }
    ]);
    expect(porRubro['pollo-baby']).toBe(3);
    expect(porRubro['pollo-lena']).toBeUndefined();
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
