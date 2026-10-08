const { fichaDePlato, armarContadorPlatos } = require('../src/utils/contadorPlatosReporte');

const pacha3 = {
  _id: 'p3',
  nombre: 'Pachamanca 3 sabores',
  categoria: 'PACHAMANCAS (Carta normal)',
  complementosUnidosAlPlato: true,
  complementos: [
    { grupo: 'Sabores', anexarVarianteAlNombre: true, modoSeleccion: 'cantidades', opciones: [{ nombre: 'Pollo' }, { nombre: 'Cerdo' }, { nombre: 'Res' }, { nombre: 'Carnero' }] },
    { grupo: 'Guarnicion Pachamanca', modoSeleccion: 'cantidades', opciones: [{ nombre: 'Humita' }, { nombre: 'Tamal' }] },
  ],
};
const cuarto = {
  _id: 'c14',
  nombre: '1/4 Pollo a la leña + papa frita + arroz + ensalada',
  categoria: 'LEÑA CON POLLO Y CHANCHO',
  complementos: [
    { grupo: 'Guarnicion', modoSeleccion: 'cantidades', opciones: [{ nombre: 'Arroz' }, { nombre: 'Papa Frita' }] },
    { grupo: 'Variacion', anexarVarianteAlNombre: true, modoSeleccion: 'opciones', opciones: [{ nombre: 'Pie' }, { nombre: 'Pec' }] },
  ],
};
const mixto = {
  _id: 'mx',
  nombre: 'Mixto leña 1/4 pollo + 300gr panceta + P-frita + Arroz + ensalada',
  categoria: 'LEÑA CON POLLO Y CHANCHO',
  complementos: [
    { grupo: 'GUARNICIONES', modoSeleccion: 'cantidades', opciones: [{ nombre: 'Arroz' }, { nombre: 'Papa Frita' }] },
    { grupo: 'Tipo', anexarVarianteAlNombre: true, modoSeleccion: 'opciones', opciones: [{ nombre: 'Pie' }, { nombre: 'Pec' }] },
  ],
};
const gaseosa = { _id: 'gas', nombre: 'Inca Kola 1/2 litro', categoria: 'BEBIDAS', complementos: [] };
const dch = {
  _id: 'dch',
  nombre: 'DCH',
  categoria: 'Desayuno Continental',
  complementos: [
    { grupo: 'Guarniciones', esVariantePlato: true, modoSeleccion: 'cantidades', opciones: [{ nombre: 'DCH Cafe' }, { nombre: 'DCH Leche Milo' }] },
    { grupo: 'Guarniciones de pan', modoSeleccion: 'cantidades', opciones: [{ nombre: 'Panes' }] },
  ],
};
const bistec = {
  _id: 'bis',
  nombre: 'Bisteck',
  categoria: 'CARNE',
  complementos: [{ grupo: 'Guarnicion', modoSeleccion: 'cantidades', opciones: [{ nombre: 'Arroz' }] }],
};
const chancho = {
  _id: 'ch',
  nombre: 'Chancho a la Leña + PF + Arroz + Ensalada',
  categoria: 'LEÑA CON POLLO Y CHANCHO',
  complementos: [{ grupo: 'GUARNICIONES', modoSeleccion: 'cantidades', opciones: [{ nombre: 'Arroz' }] }],
};

const catalogo = [pacha3, cuarto, mixto, gaseosa, dch, bistec, chancho];

function linea(plato, extra) {
  return { platoId: plato._id, nombre: plato.nombre, cantidad: 1, soles: 0, complementos: [], ...extra };
}

describe('fichaDePlato', () => {
  test('clasifica pachamanca, mixto, cuarto y suelto', () => {
    expect(fichaDePlato(pacha3).tipo).toBe('pachamanca');
    expect(fichaDePlato(mixto).tipo).toBe('mixto-lena');
    expect(fichaDePlato(cuarto).tipo).toBe('cuarto-lena');
    expect(fichaDePlato(gaseosa).tipo).toBe('suelto');
    expect(fichaDePlato(dch).tipo).toBe('mix');
    expect(fichaDePlato(chancho).tipo).toBe('chancho-lena');
  });
});

describe('armarContadorPlatos', () => {
  test('pachamanca de 3 sabores reparte pollo y carnes sin repetir la fuente', () => {
    const out = armarContadorPlatos([
      linea(pacha3, {
        soles: 80,
        cantidad: 2,
        complementos: [
          { grupo: 'Sabores', opcion: 'Pollo', cantidad: 1 },
          { grupo: 'Sabores', opcion: 'Cerdo', cantidad: 1 },
          { grupo: 'Sabores', opcion: 'Res', cantidad: 1 },
          { grupo: 'Guarnicion Pachamanca', opcion: 'Humita', cantidad: 1 },
        ],
      }),
    ], catalogo);
    expect(out.pollos.map((r) => [r.nombre, r.cantidad])).toEqual([['Pollo de pachamanca', 2]]);
    expect(out.carnes.map((r) => [r.nombre, r.cantidad])).toEqual([
      ['Cerdo de pachamanca', 2],
      ['Res de pachamanca', 2],
    ]);
    expect(out.platos.find((r) => /pachamanca 3/i.test(r.nombre))).toBeUndefined();
    expect(out.resumen.soles).toBe(80);
    expect(out.guarniciones.find((g) => g.nombre === 'Humita').cantidad).toBe(2);
    expect(out.guarniciones.find((g) => /pollo|cerdo|res/i.test(g.nombre))).toBeUndefined();
  });

  test('cinco pachamancas de un sabor multiplican el sabor por la cantidad', () => {
    const out = armarContadorPlatos([
      linea(pacha3, {
        nombre: 'Pachamanca 1 sabor',
        soles: 175,
        cantidad: 5,
        complementos: [
          { grupo: 'Sabores', opcion: 'Cerdo', cantidad: 1 },
          { grupo: 'Guarnicion Pachamanca', opcion: 'Humita', cantidad: 1 },
        ],
      }),
    ], catalogo);
    expect(out.carnes[0]).toMatchObject({ nombre: 'Cerdo de pachamanca', cantidad: 5 });
    expect(out.pollos).toHaveLength(0);
  });

  test('cuarto Pie y Pec son un solo pollo, y el mixto no es tercer plato', () => {
    const out = armarContadorPlatos([
      linea(cuarto, { soles: 33, complementos: [{ grupo: 'Variacion', opcion: 'Pie', cantidad: 1 }, { grupo: 'Guarnicion', opcion: 'Arroz', cantidad: 1 }] }),
      linea(cuarto, { soles: 33, complementos: [{ grupo: 'Variacion', opcion: 'Pec', cantidad: 1 }, { grupo: 'Guarnicion', opcion: 'Arroz', cantidad: 1 }] }),
      linea(mixto, {
        soles: 65,
        complementos: [
          { grupo: 'Tipo', opcion: 'Pec', cantidad: 1 },
          { grupo: 'GUARNICIONES', opcion: 'Arroz', cantidad: 1 },
          { grupo: 'GUARNICIONES', opcion: 'Papa Frita', cantidad: 1 },
        ],
      }),
    ], catalogo);
    const cuartoRow = out.pollos.find((r) => r.nombre === '1/4 pollo a la leña');
    expect(cuartoRow.cantidad).toBe(3);
    expect(cuartoRow.detalle).toContain('Pie 1');
    expect(cuartoRow.detalle).toContain('Pec 2');
    expect(cuartoRow.detalle).toContain('1 del mixto');
    expect(out.carnes.find((r) => r.nombre === 'Panceta de chancho leña').cantidad).toBe(1);
    expect(out.platos.find((r) => /mixto/i.test(r.nombre))).toBeUndefined();
    expect(out.guarniciones.find((g) => /pie|pec/i.test(g.nombre))).toBeUndefined();
    expect(out.resumen.soles).toBe(131);
  });

  test('el arroz de dos grupos es una fila y la gaseosa sigue en platos', () => {
    const out = armarContadorPlatos([
      linea(bistec, { soles: 35, complementos: [{ grupo: 'Guarnicion', opcion: 'Arroz', cantidad: 1 }] }),
      linea(chancho, { soles: 46, complementos: [{ grupo: 'GUARNICIONES', opcion: 'arroz', cantidad: 1 }, { grupo: 'Zarza Criolla', opcion: 'ZarzaCriolla', cantidad: 1 }] }),
      linea(gaseosa, { soles: 6 }),
      linea(chancho, { soles: 0, complementos: [{ grupo: 'GUARNICIONES', opcion: 'Zarza criolla', cantidad: 1 }] }),
    ], catalogo);
    expect(out.guarniciones.find((g) => g.nombre.toLowerCase() === 'arroz').cantidad).toBe(2);
    expect(out.guarniciones.filter((g) => /zarza/i.test(g.nombre))).toHaveLength(1);
    expect(out.platos.find((r) => r.nombre === 'Inca Kola 1/2 litro').cantidad).toBe(1);
    expect(out.carnes.find((r) => r.nombre === 'Chancho a la leña').cantidad).toBe(2);
  });

  test('DCH cuenta la bebida y no una fila DCH de más', () => {
    const out = armarContadorPlatos([
      linea(dch, {
        soles: 20,
        cantidad: 2,
        complementos: [
          { grupo: 'Guarniciones', opcion: 'DCH Cafe', cantidad: 1 },
          { grupo: 'Guarniciones de pan', opcion: 'Panes', cantidad: 2 },
        ],
      }),
    ], catalogo);
    expect(out.platos.map((r) => [r.nombre, r.cantidad])).toEqual([['DCH Cafe', 2]]);
    expect(out.guarniciones.find((g) => g.nombre === 'Panes').cantidad).toBe(4);
    expect(out.resumen.soles).toBe(20);
  });

  test('pachamanca sin sabores no se inventa', () => {
    const out = armarContadorPlatos([
      linea(pacha3, { soles: 35, complementos: [{ grupo: 'Guarnicion Pachamanca', opcion: 'Tamal', cantidad: 1 }] }),
    ], catalogo);
    expect(out.pollos).toHaveLength(0);
    expect(out.carnes).toHaveLength(0);
    expect(out.platos[0].nombre).toBe('Pachamanca sin sabor registrado');
    expect(out.platos[0].cantidad).toBe(1);
  });
});
