const { aplicarMapa, filasDelContador, indiceBebidas, partirSalida } = require('../src/utils/inventarioSalidaVentas');
const { filasDeRubros } = require('../src/utils/inventarioRubros');

function dia(ymd, hora) {
    return new Date(`${ymd}T${hora}-05:00`);
}

test('arroz con pollo, caldo y olla salen del menu pecho o pierna', () => {
    const arroz = aplicarMapa([{ nombre: 'Arroz con pollo Pec', cantidad: 2 }]);
    expect(arroz['arroz-tipo-pollo']).toBeUndefined();
    expect(arroz['arroz-pollo']).toBe(2);
    expect(arroz['menu-pecho']).toBeUndefined();
    expect(arroz['pechuga-pollo']).toBeUndefined();
    const caldo = aplicarMapa([{ nombre: 'Caldo de pollo Pie', cantidad: 2 }]);
    expect(caldo['caldo-pollo']).toBe(2);
    expect(caldo['menu-pierna']).toBeUndefined();
    const olla = aplicarMapa([{ nombre: 'Pollo a la olla', cantidad: 4 }]);
    expect(olla['pollo-olla']).toBe(4);
    expect(olla['menu-pecho']).toBeUndefined();
});

test('arroz con pollo no descuenta también el octavo suelto', () => {
    const partido = partirSalida(
        [{ nombre: 'Arroz con pollo', cantidad: 4 }],
        'Comanda 1',
        null,
        {
            relaciones: [
                { plato: 'Arroz con pollo', rubro: 'Arroz con pollo', cantidad: 1 },
                { plato: 'Arroz con pollo', rubro: 'Octavo de pollo', cantidad: 1 }
            ]
        }
    );
    expect(partido.porRubro['arroz-pollo']).toBe(4);
    expect(partido.porRubro['octavo-pollo']).toBeUndefined();
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
    expect(porRubro['arroz-mariscos']).toBeUndefined();
    expect(porRubro['arroz-chaufa']).toBeUndefined();
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

test('el arroz de la pollada no se duplica con la guarnición llamada Arroz', () => {
    const nombre = 'Pollada + papa fritas + Arroz + ensalada';
    const partido = partirSalida([
        { nombre, cantidad: 30, guarnicionOpcional: true },
        { nombre: nombre + ' Con arroz', cantidad: 30, esGuarnicion: true, soloArroz: true, platoOrigen: nombre }
    ], 'Comanda 4', null, {
        relaciones: [{ plato: nombre, rubro: 'Arroz blanco', cantidad: 1 }]
    });
    expect(partido.porRubro['arroz-blanco']).toBe(30);
    expect(partido.porRubro.pollada).toBe(30);
    expect(partido.detalle['arroz-blanco'].map((d) => d.nombre)).toEqual([nombre + ' Con arroz']);
    expect(partido.detalle['arroz-blanco'].some((d) => d.nombre === 'Arroz' || d.nombre === 'Arroz blanco')).toBe(false);
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

test('lomo fino y seco de res descuentan su crudo', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Lomo fino', cantidad: 3 },
        { nombre: 'Seco de res', cantidad: 2 },
        { nombre: 'Seco de carnero', cantidad: 1 }
    ]);
    expect(porRubro['lomo-fino']).toBe(3);
    expect(porRubro['carne-guiso']).toBe(2);
    expect(porRubro['seco-res']).toBeUndefined();
    expect(porRubro['seco-cordero']).toBe(1);
});

test('humita sale del plato Humita y de la pachamanca según sus sabores', () => {
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
    expect(porPlato.humita).toBe(11);
    const unaPieza = aplicarMapa([{ nombre: 'Pachamanca 1 sabor', cantidad: 1, cortes: { Pollo: 1, Cerdo: 1 } }]);
    expect(unaPieza.humita).toBe(1);
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
    const humitas = unidadesHumitaPachamanca([linea], [plato]);
    expect(humitas.total).toBe(6);
    expect(humitas.detalle[0].factor).toBe(3);
    expect(humitas.detalle[0].platos).toBe(2);
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

test('el mixto de pierna baja pierna a la leña y el de pecho baja pecho a la leña', () => {
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

test('el cuarto pierna y el mix pierna van a pierna a la leña, no a pierna de pollo', () => {
    const porRubro = aplicarMapa([
        { nombre: '1/4 pollo a la leña', cantidad: 3, cortes: { Pec: 2, Pie: 1 } },
        { nombre: 'Mixto leña 1/4 pollo', cantidad: 2, cortes: { Pec: 1, Pie: 1 } }
    ]);
    expect(porRubro['pollo-lena']).toBe(3);
    expect(porRubro['pierna-lena']).toBe(2);
    expect(porRubro['pierna-pollo']).toBeUndefined();
    expect(porRubro['trozo-panceta']).toBe(6);
});

test('un filete de pollo vinculado otra vez a filete no se resta dos veces', () => {
    const porRubro = partirSalida([
        { nombre: 'Filete de pollo+ papa frita +arroz +ensalada.', cantidad: 1 }
    ], 'Comanda 5', null, {
        relaciones: [{ plato: 'Filete de pollo+ papa frita +arroz +ensalada.', rubro: 'Filete de pollo', cantidad: 1 }]
    }).porRubro;
    expect((porRubro['filete-pollo'] || 0) + (porRubro.filete || 0)).toBe(1);
});

test('dos milanesas no se duplican con el vínculo de filete', () => {
    const porRubro = partirSalida([
        { nombre: 'Milanesa + Papas Fritas + Arroz + Ensalada', cantidad: 2 }
    ], 'Comanda 51', null, {
        relaciones: [
            { plato: 'Milanesa + Papas Fritas + Arroz + Ensalada', rubro: 'Milanesa', cantidad: 1 },
            { plato: 'Milanesa + Papas Fritas + Arroz + Ensalada', rubro: 'Filete de pollo', cantidad: 1 }
        ]
    }).porRubro;
    expect(porRubro.milanesa).toBe(2);
    expect(porRubro.filete).toBeUndefined();
});

test('la milanesa junior de la carta gasta medio filete y no uno', () => {
    const porRubro = partirSalida([
        { nombre: 'Milanesa Junior + Arroz + papa frita + ensalada', cantidad: 1 }
    ], 'Comanda 14', null, {
        relaciones: [
            { plato: 'Milanesa Junior + Arroz + papa frita + ensalada', rubro: 'Milanesa', cantidad: 1 },
            { plato: 'Milanesa Junior + Arroz + papa frita + ensalada', rubro: 'Filete de pollo', cantidad: 0.5 }
        ]
    }).porRubro;
    expect(porRubro.milanesa).toBe(0.5);
    expect(porRubro.filete).toBeUndefined();
});

test('la milanesa junior gasta medio filete', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Milanesa Junior + Arroz + papa frita + ensalada', cantidad: 2 },
        { nombre: 'Milanesa + Papas Fritas + Arroz + Ensalada', cantidad: 1 }
    ]);
    expect(porRubro.milanesa).toBe(2);
});

test('un filete con papas y arroz descuenta filete, papas y arroz, y puede dejar el saldo en negativo', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Filete de pollo + papas fritas + arroz + ensalada', cantidad: 3 }
    ]);
    expect(porRubro['filete-pollo']).toBe(3);
    expect(porRubro.filete).toBeUndefined();
    expect(porRubro.papas).toBe(3);
    expect(porRubro['arroz-blanco']).toBe(3);
    const { armarLibro } = require('../src/utils/inventarioLibro');
    const fecha = new Date('2026-07-01T15:00:00.000Z');
    const libro = armarLibro({
        movimientos: [{ rubro: 'filete', tipoProducto: 'crudo', clase: 'ingreso', cantidad: 1, motivo: 'Ingreso crudo', fecha: new Date('2026-07-01T14:00:00.000Z') }],
        ventas: [{ rubro: 'filete', nombre: 'Filete', cantidad: 3, fecha, detalle: [] }],
        desde: new Date('2026-07-01T09:00:00.000Z'),
        hasta: new Date('2026-07-02T08:59:59.000Z')
    });
    const fila = libro.filas.find((f) => f.rubro === 'filete' && f.tipoProducto === 'crudo');
    expect(fila.sinTope).toBe(-2);
    expect(fila.queda).toBe(0);
});

test('la venta de reportes baja el saldo que mira la alerta', () => {
    const { armarLibro } = require('../src/utils/inventarioLibro');
    const { alertasDeFilas } = require('../src/utils/inventarioKardex');
    const libro = armarLibro({
        movimientos: [{ rubro: 'pollo-lena', tipoProducto: 'cocido', clase: 'ingreso', cantidad: 20, motivo: 'Ingreso cocido', fecha: new Date('2026-07-01T14:00:00.000Z') }],
        ventas: [{ rubro: 'pollo-lena', nombre: 'Pecho a la Leña', cantidad: 10, fecha: new Date('2026-07-01T15:00:00.000Z'), detalle: [] }],
        umbrales: { 'pollo-lena': { crudo: 0, cocido: 10 } },
        desde: new Date('2026-07-01T09:00:00.000Z'),
        hasta: new Date('2026-07-02T08:59:59.000Z')
    });
    const alerta = alertasDeFilas(libro.filas).find((a) => a.plato === 'pollo-lena' && a.tipoProducto === 'cocido');
    expect(alerta).toMatchObject({ saldo: 10, umbral: 10 });
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
    expect(porRubro['menu-pecho']).toBeUndefined();
    expect(porRubro['menu-pierna']).toBeUndefined();
});

test('la pierna de pato no descarga también el pecho', () => {
    const relaciones = [
        { plato: 'Arroz con pato (1/4)', rubro: 'Arroz verde + Pato', cantidad: 1, complemento: 'Carta' },
        { plato: 'Arroz con pato (1/4)', rubro: 'Pecho de Pato', cantidad: 1, complemento: 'Parte pecho' },
        { plato: 'Arroz con pato (1/4)', rubro: 'Pierna de pato', cantidad: 1, complemento: 'Parte pierna' }
    ];
    const pierna = partirSalida(
        [{ nombre: 'Arroz con pato (1/4)', cantidad: 1, cortes: { Pierna: 1 }, detalle: 'Pierna 1' }],
        'Comanda 51',
        null,
        { relaciones }
    );
    expect(pierna.porRubro['pierna-pato']).toBe(1);
    expect(pierna.porRubro['pechuga-pato']).toBeUndefined();
    expect(pierna.porRubro['arroz-verde']).toBe(1);
    const pecho = partirSalida(
        [{ nombre: 'Arroz con pato (1/4)', cantidad: 1, cortes: { Pecho: 1 }, detalle: 'Pecho 1' }],
        'Comanda 60',
        null,
        { relaciones }
    );
    expect(pecho.porRubro['pechuga-pato']).toBe(1);
    expect(pecho.porRubro['pierna-pato']).toBeUndefined();
});

test('el arroz con pato de pecho come pechuga y el de pierna come pierna', () => {
    const pecho = aplicarMapa([{ nombre: 'Arroz con pato pecho', cantidad: 2 }]);
    expect(pecho['pechuga-pato']).toBe(2);
    expect(pecho['pierna-pato']).toBeUndefined();
    expect(pecho['arroz-verde']).toBe(2);
    const partido = aplicarMapa([{
        nombre: 'Arroz con pato',
        cantidad: 3,
        cortes: { Pecho: 2, Pierna: 1 }
    }]);
    expect(partido['pechuga-pato']).toBe(2);
    expect(partido['pierna-pato']).toBe(1);
    expect(partido['arroz-verde']).toBe(3);
    const sinCorte = aplicarMapa([{ nombre: 'Arroz con pato', cantidad: 1 }]);
    expect(sinCorte['pechuga-pato']).toBeUndefined();
    expect(sinCorte['arroz-verde']).toBe(1);
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
    const { armarLibro } = require('../src/utils/inventarioLibro');
    const ventas = [{ rubro: 'gaseosa-inca-kola-1-2-litro', nombre: 'Inca Kola 1/2 litro', cantidad: 2, fecha: dia('2026-10-31', '12:00:00'), detalle: [] }];
    const { filas } = armarLibro({ movimientos: [], ventas, desde: dia('2026-10-31', '04:00:00'), hasta: dia('2026-11-01', '03:59:59') });
    const fila = filas.find((f) => f.rubro === 'gaseosa-inca-kola-1-2-litro' && f.tipoProducto === 'crudo');
    expect(fila).toBeTruthy();
    expect(fila.nombre).toBe('Inca Kola 1/2 litro');
    expect(fila).toMatchObject({ egreso: 0, venta: 2, queda: 0, sinTope: -2 });
});

test('una bebida que acompaña a un plato se llama como la bebida, no como el plato', () => {
    const { nombreDeRubro } = require('../src/utils/inventarioSalidaVentas');
    expect(nombreDeRubro('gaseosa-inca-kola-300ml', [{ nombre: 'Seco de Res + frijoles + arroz' }])).toBe('Inca Kola 300ml');
    expect(nombreDeRubro('gaseosa-inca-kola-300ml', [{ nombre: 'Inca Kola 300 ml' }, { nombre: 'Inca Kola 300ml' }])).toBe('Inca Kola 300ml');
    expect(nombreDeRubro('pollo-lena', [])).toBe('Pecho a la Leña');
});

test('el medio pollo a la leña baby solo descuenta 0.5 de pollo baby', () => {
    const porRubro = aplicarMapa([
        { nombre: '1/2 pollo a la leña baby', cantidad: 4 },
        { nombre: '1/2 Pollo a la leña BABY PF + Ensalada', cantidad: 2 }
    ]);
    expect(porRubro['pollo-baby']).toBe(3);
    expect(porRubro['pollo-lena']).toBeUndefined();
});

test('la yuca del chicharrón BBQ solo baja si el mozo la elige', () => {
    const { armarContadorPlatos } = require('../src/utils/contadorPlatosReporte');
    const plato = {
        _id: 'bbq',
        nombre: 'Chicharron de pollo a la BBQ + arroz + papas fritas',
        categoria: 'CHICHARRONES',
        complementos: [{
            grupo: 'GUARNICIONES',
            opciones: [{ nombre: 'Arroz' }, { nombre: 'Papa Frita' }, { nombre: 'Yuca Frita' }, { nombre: 'Yuca Sancochada' }]
        }]
    };
    const linea = (opciones) => ({
        platoId: 'bbq',
        nombre: plato.nombre,
        cantidad: 1,
        soles: 40,
        complementos: opciones.map((opcion) => ({ grupo: 'GUARNICIONES', opcion, cantidad: 1 }))
    });
    const conYuca = aplicarMapa(filasDelContador(armarContadorPlatos([linea(['Yuca Frita'])], [plato])));
    expect(conYuca.yuca).toBe(1);
    expect(conYuca.papas).toBeUndefined();
    expect(conYuca['arroz-blanco']).toBeUndefined();
    expect(conYuca['chi-pollo-bbq']).toBe(1);
    const conArrozPapa = aplicarMapa(filasDelContador(armarContadorPlatos([
        linea(['Arroz', 'Papa Frita'])
    ], [plato])));
    expect(conArrozPapa.yuca).toBeUndefined();
    expect(conArrozPapa.papas).toBe(1);
    expect(conArrozPapa['arroz-blanco']).toBe(1);
    const dosYucas = aplicarMapa(filasDelContador(armarContadorPlatos([
        linea(['Yuca Frita']),
        linea(['Yuca Sancochada'])
    ], [plato])));
    expect(dosYucas.yuca).toBe(2);
});

test('las relaciones guardadas no duplican ni agregan la yuca opcional de los chicharrones', () => {
    const { armarContadorPlatos } = require('../src/utils/contadorPlatosReporte');
    const chico = 'Chicharron de pollo chico + yuca frita + zarza criolla';
    const acevichado = 'Chicharrón de pollo acevichada + arroz y papa frita';
    const catalogo = [chico, acevichado].map((nombre, i) => ({
        _id: String(i), nombre,
        complementos: [{ grupo: 'GUARNICIONES', opciones: [{ nombre: 'Yuca Frita' }, { nombre: 'Papa Frita' }] }]
    }));
    const linea = (i, opcion) => ({ platoId: String(i), cantidad: 1, complementos: [{ grupo: 'GUARNICIONES', opcion }] });
    const relaciones = [chico, acevichado].map((plato) => ({ plato, rubro: 'Yuca', cantidad: 1 }));
    const calcular = (lineas, numero) => partirSalida(filasDelContador(armarContadorPlatos(lineas, catalogo)), numero, null, { relaciones });

    const sinYuca = calcular([linea(0, 'Papa Frita'), linea(1, 'Papa Frita')], 'Comanda 6');
    expect(sinYuca.porRubro).toMatchObject({ 'chicharron-pollo': 1, 'chi-pollo-acevichada': 1, papas: 2 });
    expect(sinYuca.porRubro.yuca).toBeUndefined();
    const conYuca = calcular([linea(0, 'Yuca Frita')], 'Comanda 22');
    expect(conYuca.porRubro.yuca).toBe(1);
    expect(conYuca.detalle.yuca).toMatchObject([{ nombre: 'Yuca Frita', cantidad: 1, comanda: 'Comanda 22' }]);
});

test('yuca, inca 300, carnero, frugos y pizza descuentan su fila', () => {
    const yuca = aplicarMapa([
        { nombre: 'Chicharrón de Pota + yuca + zarza', cantidad: 1 },
        { nombre: 'Chicharron de Pescado', cantidad: 1 },
        { nombre: 'Jalea de Pescado + yuca frita c/zarza', cantidad: 1 },
        { nombre: 'Chicharron de pollo + arroz + papas fritas', cantidad: 1 },
        { nombre: 'Fuente de Chicharrón pollo', cantidad: 1 },
        { nombre: 'Chicharrón de Trucha', cantidad: 1 },
        { nombre: 'Duo Truchero Ceviche Chicharron de trucha', cantidad: 2 }
    ]);
    expect(yuca.yuca).toBe(8);
    const no = aplicarMapa([
        { nombre: 'Ceviche c/ chicharrón de pota', cantidad: 3 },
        { nombre: 'Duo marino ceviche chicharron de pescado', cantidad: 2 },
        { nombre: 'Fuente de Chicharrón de chancho', cantidad: 1 }
    ]);
    expect(no.yuca).toBeUndefined();
    const inca = aplicarMapa([
        { nombre: 'Pollada + papa fritas + Arroz + ensalada', cantidad: 1 },
        { nombre: 'Milanesa junior + arroz + papa frita + ensalada', cantidad: 1 },
        { nombre: 'Filete junior + papa frita + arroz + ensalada', cantidad: 1 },
        { nombre: 'Arroz con pollo + papa a la huancaina', cantidad: 1 },
        { nombre: 'Seco de res + frijoles + arroz', cantidad: 1 },
        { nombre: 'Pollo a la olla + Arroz + Papa a la huancaína', cantidad: 1 }
    ]);
    expect(inca['gaseosa-inca-kola-300ml']).toBe(6);
    const carnero = aplicarMapa([{ nombre: 'Seco de carnero chico (250 gr + arroz + frijol + zarza criolla)', cantidad: 2 }]);
    expect(carnero['seco-cordero']).toBe(2);
    expect(carnero.carnero).toBeUndefined();
    const otros = aplicarMapa([
        { nombre: 'Frugos 1.5Lt', cantidad: 3 },
        { nombre: 'Pizza Americana 20 x 20 personal (Jamon- Queso)', cantidad: 2 },
        { nombre: 'Pizza grande 30x30', cantidad: 1 }
    ]);
    expect(otros['frugos-1-5l']).toBe(3);
    expect(otros['pizza-20x20']).toBe(2);
    expect(otros['pizza-30x30']).toBe(1);
});

test('la relación de platos cambia la cantidad y suma los otros productos vinculados', () => {
    const relaciones = [
        { plato: '1/2 Chicharron de chancho + camote frito + zarza criolla', rubro: 'Chicharrón de chancho crudo', cantidad: 1 },
        { plato: '1/2 Chicharrón de chancho + 4 panes', rubro: 'Chicharrón de chancho crudo', cantidad: 1 },
        { plato: 'Desayuno Criollo Gambusinas', rubro: 'Chicharrón de chancho crudo', cantidad: 1 },
        { plato: '1/2 Chicharron de chancho + camote frito + zarza criolla', rubro: 'Papas', cantidad: 1 },
        { plato: '1/4 Pollo a la leña + papa frita + arroz + ensalada', rubro: 'Pierna de Pollo', cantidad: 1 }
    ];
    const sinRelacion = partirSalida([
        { nombre: '1/2 Chicharron de chancho + camote frito + zarza criolla', cantidad: 2 }
    ], '', null, {});
    expect(sinRelacion.porRubro['chicharron-chancho']).toBe(1);
    const conRelacion = partirSalida([
        { nombre: '1/2 Chicharron de chancho + camote frito + zarza criolla', cantidad: 2 },
        { nombre: '1/2 Chicharrón de chancho + 4 panes', cantidad: 1 },
        { nombre: 'Desayuno Criollo Gambusinas', cantidad: 1 },
        { nombre: 'Fuente de Chicharrón de chancho', cantidad: 1 }
    ], '', null, { relaciones });
    expect(conRelacion.porRubro['chicharron-chancho']).toBe(6);
    expect(conRelacion.porRubro.papas).toBe(2);
    const lena = partirSalida([
        { nombre: '1/4 Pollo a la leña + papa frita + arroz + ensalada', cantidad: 2, cortes: { Pecho: 2 } }
    ], '', null, { relaciones });
    expect(lena.porRubro['pollo-lena']).toBe(2);
    expect(lena.porRubro['pierna-pollo']).toBe(2);
});

test('un plato con varios productos vinculados resta cada uno', () => {
    const relaciones = [
        { plato: 'Ceviche de chicharrón de pota', rubro: 'Pieza de pota', cantidad: 2 },
        { plato: 'Ceviche de chicharrón de pota', rubro: 'Pieza de pescado', cantidad: 1 }
    ];
    const uno = partirSalida([
        { nombre: 'Ceviche de chicharrón de pota', cantidad: 1 }
    ], '', null, { relaciones });
    expect(uno.porRubro['pieza-pota']).toBe(2);
    expect(uno.porRubro['pieza-pescado']).toBe(1);
    const tres = partirSalida([
        { nombre: 'Ceviche de chicharrón de pota', cantidad: 3 }
    ], '', null, { relaciones });
    expect(tres.porRubro['pieza-pota']).toBe(6);
    expect(tres.porRubro['pieza-pescado']).toBe(3);
    const sin = partirSalida([
        { nombre: 'Ceviche de chicharrón de pota', cantidad: 1 }
    ], '', null, {});
    expect(sin.porRubro['pieza-pota']).toBe(1);
    expect(sin.porRubro['pieza-pescado']).toBeUndefined();
});

test('un plato sin regla fija resta solo lo vinculado', () => {
    const relaciones = [
        { plato: 'Parihuela especial', rubro: 'Pieza de pescado', cantidad: 1 },
        { plato: 'Parihuela especial', rubro: 'Pieza de pota', cantidad: 2 },
        { plato: 'Parihuela especial', rubro: 'Humita', cantidad: 4 }
    ];
    const out = partirSalida([
        { nombre: 'Parihuela especial', cantidad: 2 }
    ], '', null, { relaciones });
    expect(out.porRubro['pieza-pescado']).toBe(2);
    expect(out.porRubro['pieza-pota']).toBe(4);
    expect(out.porRubro.humita).toBeUndefined();
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

test('tamal de chancho y tamal de pollo descuentan su propia fila', () => {
    const porRubro = aplicarMapa([
        { nombre: 'Tamal Chancho + zarza criolla', cantidad: 2 },
        { nombre: 'Tamal Pollo + Zarza criolla', cantidad: 3 },
        { nombre: 'Tamal con 2 panes', cantidad: 1 }
    ]);
    expect(porRubro['tamal-chancho']).toBe(2);
    expect(porRubro['tamal-pollo']).toBe(3);
    expect(porRubro.tamal).toBeUndefined();
    const filas = filasDeRubros([], dia('2026-11-16', '04:00:00'), dia('2026-11-17', '03:59:59'), {});
    expect(filas.some((f) => f.rubro === 'tamal-chancho' && f.nombre === 'Tamal de chancho')).toBe(true);
    expect(filas.some((f) => f.rubro === 'tamal-pollo' && f.nombre === 'Tamal de pollo')).toBe(true);
});

test('chancho a la leña BBQ solo gasta 6 piezas y no su fila cruda', () => {
    const partido = partirSalida(
        [{ nombre: 'Chancho a la leña BBQ', cantidad: 1 }],
        'Comanda 9',
        null,
        { relaciones: [{ plato: 'Chancho a la leña BBQ', rubro: 'Chancho a la leña BBQ', cantidad: 1 }] }
    );
    expect(partido.porRubro['trozo-panceta']).toBe(6);
    expect(partido.porRubro['chancho-lena-bbq']).toBeUndefined();
    expect(partido.porRubro['chancho-lena']).toBeUndefined();
    const lena = partirSalida(
        [{ nombre: 'Chancho a la leña', cantidad: 1 }],
        'Comanda 9',
        null,
        { relaciones: [{ plato: 'Chancho a la leña', rubro: 'Chancho a la leña', cantidad: 1 }] }
    );
    expect(lena.porRubro['trozo-panceta']).toBe(4);
    expect(lena.porRubro['chancho-lena']).toBeUndefined();
    const panceta = aplicarMapa([{ nombre: 'Panceta de chancho leña', cantidad: 1 }]);
    expect(panceta['trozo-panceta']).toBe(3);
    const conArroz = partirSalida([
        { nombre: 'Chancho a la leña BBQ', cantidad: 1 },
        { nombre: 'Chancho a la Leña BBQ Con arroz', cantidad: 1, soloArroz: true, esGuarnicion: true, platoOrigen: 'Chancho a la Leña BBQ' },
        { nombre: 'Chancho a la leña', cantidad: 1 },
        { nombre: 'Chancho a la Leña + PF + Arroz + Ensalada Con arroz', cantidad: 1, soloArroz: true, esGuarnicion: true, platoOrigen: 'Chancho a la Leña + PF + Arroz + Ensalada' }
    ], 'Comanda 9');
    expect(conArroz.porRubro['trozo-panceta']).toBe(10);
    expect(conArroz.porRubro['arroz-blanco']).toBe(2);
});
