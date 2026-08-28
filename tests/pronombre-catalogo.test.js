const {
  resolverPronombreCatalogo,
  overlayPronombresEnPlatoLinea,
  enriquecerComplementosConPrecio,
} = require('../src/utils/precioComplementos');

const catalogo = [{
  grupo: 'Guarnición',
  opciones: [
    { nombre: 'Arroz', precio: 0, pronombre: 'Arroz' },
    { nombre: 'papa frit', precio: 0, pronombre: 'P Frita' },
    { nombre: 'ensalada', precio: 0, pronombre: 'ensal' },
  ]
}];

describe('pronombre desde catálogo', () => {
  test('resuelve por grupo y opción aunque el snapshot esté vacío', () => {
    expect(resolverPronombreCatalogo(catalogo, { grupo: 'Guarnición', opcion: 'papa frit' }))
      .toBe('P Frita');
    expect(resolverPronombreCatalogo(catalogo, { grupo: 'guarnición', opcion: 'ensalada' }))
      .toBe('ensal');
  });

  test('overlay pisa el snapshot con el pronombre vigente del menú', () => {
    const linea = {
      plato: { complementos: catalogo },
      complementosSeleccionados: [
        { grupo: 'Guarnición', opcion: 'Arroz', pronombre: '' },
        { grupo: 'Guarnición', opcion: 'papa frit', pronombre: '' },
        { grupo: 'Guarnición', opcion: 'ensalada', pronombre: '' },
      ]
    };
    overlayPronombresEnPlatoLinea(linea);
    expect(linea.complementosSeleccionados.map((c) => c.pronombre))
      .toEqual(['Arroz', 'P Frita', 'ensal']);
  });

  test('enriquecer copia pronombre al crear comanda', () => {
    const out = enriquecerComplementosConPrecio(catalogo, [
      { grupo: 'Guarnición', opcion: 'papa frit', cantidad: 1 }
    ]);
    expect(out[0].pronombre).toBe('P Frita');
  });

  test('enriquecer usa precio de catálogo aunque el grupo difiera en mayúsculas', () => {
    const catalogoConPrecio = [{
      grupo: 'Guarnición',
      opciones: [{ nombre: 'Papa extra', precio: 4, pronombre: 'P.ext' }]
    }];
    const out = enriquecerComplementosConPrecio(catalogoConPrecio, [
      { grupo: 'guarnición', opcion: 'papa extra', cantidad: 2, precio: 99 }
    ]);
    expect(out[0].precio).toBe(4);
    expect(out[0].cantidad).toBe(2);
    expect(out[0].grupo).toBe('guarnición');
  });

  test('enriquecer conserva precio del mozo si el adicional no está en catálogo', () => {
    const out = enriquecerComplementosConPrecio([{ grupo: 'Guarnición', opciones: [{ nombre: 'Arroz', precio: 0 }] }], [
      { grupo: 'Adicionales', opcion: 'Extra queso', cantidad: 1, precio: 3 }
    ]);
    expect(out[0].precio).toBe(3);
    expect(out[0].opcion).toBe('Extra queso');
  });
});
