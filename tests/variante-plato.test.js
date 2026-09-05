const {
  partirLineaPorVariante,
  expandirPlatosPorVariante,
  esComplementoVariante,
} = require('../src/utils/variantePlato');

const catalogoMix = {
  _id: 'idmix',
  id: 10,
  nombre: 'MIX',
  complementos: [
    { grupo: 'Guarnición A', opciones: [{ nombre: 'Zarza' }] },
    {
      grupo: 'Bebida',
      esVariantePlato: true,
      modoSeleccion: 'cantidades',
      opciones: [
        { nombre: 'TE', pronombre: 'TÉ' },
        { nombre: 'CAFE', pronombre: 'CAFÉ' },
        { nombre: 'LECHE' },
      ],
    },
  ],
};

describe('partirLineaPorVariante', () => {
  test('3 TÉ + 2 CAFÉ parte en dos líneas con nombre de cocina', () => {
    const linea = {
      plato: 'idmix',
      complementosSeleccionados: [
        { grupo: 'Guarnición A', opcion: 'Zarza', cantidad: 1 },
        { grupo: 'Bebida', opcion: 'TE', cantidad: 3 },
        { grupo: 'Bebida', opcion: 'CAFE', cantidad: 2 },
      ],
    };
    const partes = partirLineaPorVariante(linea, catalogoMix, 5);
    expect(partes).toHaveLength(2);
    expect(partes[0].cantidad).toBe(3);
    expect(partes[0].linea.nombreCocinaPedido).toBe('TÉ');
    expect(partes[0].linea.variantePlato.opcion).toBe('TE');
    expect(partes[0].linea.complementosSeleccionados.filter((c) => c.grupo === 'Guarnición A')).toHaveLength(1);
    expect(partes[1].cantidad).toBe(2);
    expect(partes[1].linea.nombreCocinaPedido).toBe('CAFÉ');
  });

  test('sin variante deja una sola línea', () => {
    const partes = partirLineaPorVariante(
      { complementosSeleccionados: [{ grupo: 'Guarnición A', opcion: 'Zarza', cantidad: 1 }] },
      { complementos: [{ grupo: 'Guarnición A', opciones: [{ nombre: 'Zarza' }] }] },
      2
    );
    expect(partes).toHaveLength(1);
    expect(partes[0].cantidad).toBe(2);
    expect(partes[0].linea.nombreCocinaPedido).toBeFalsy();
  });
});

describe('expandirPlatosPorVariante', () => {
  test('expande usando el mapa de catálogo', () => {
    const map = new Map([['idmix', catalogoMix]]);
    const { platos, cantidades } = expandirPlatosPorVariante(
      [{
        plato: 'idmix',
        complementosSeleccionados: [
          { grupo: 'Bebida', opcion: 'TE', cantidad: 3 },
          { grupo: 'Bebida', opcion: 'CAFE', cantidad: 2 },
        ],
      }],
      [5],
      map
    );
    expect(platos).toHaveLength(2);
    expect(cantidades).toEqual([3, 2]);
  });
});

describe('esComplementoVariante', () => {
  test('marca el grupo variante, no las guarniciones', () => {
    expect(esComplementoVariante({ grupo: 'Bebida' }, catalogoMix, null)).toBe(true);
    expect(esComplementoVariante({ grupo: 'Guarnición A' }, catalogoMix, null)).toBe(false);
  });
});
