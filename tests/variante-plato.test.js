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

  test('SUMA off: 4 TÉ con cantidad de plato 1 queda TÉ x4 y copia fijas', () => {
    const linea = {
      plato: 'idmix',
      complementosSeleccionados: [
        { grupo: 'Guarnición A', opcion: 'Arroz', cantidad: 1 },
        { grupo: 'Guarnición B', opcion: 'Papas', cantidad: 2 },
        { grupo: 'Bebida', opcion: 'TE', cantidad: 4 },
      ],
    };
    const partes = partirLineaPorVariante(linea, catalogoMix, 1);
    expect(partes).toHaveLength(1);
    expect(partes[0].cantidad).toBe(4);
    expect(partes[0].linea.nombreCocinaPedido).toBe('TÉ');
    expect(partes[0].linea.complementosSeleccionados.find((c) => c.opcion === 'Arroz').cantidad).toBe(1);
    expect(partes[0].linea.complementosSeleccionados.find((c) => c.opcion === 'Papas').cantidad).toBe(2);
  });

  test('SUMA off: 4 TÉ + 2 CAFÉ con plato x1 parte 4 y 2; fijas por unidad en cada línea', () => {
    const linea = {
      plato: 'idmix',
      complementosSeleccionados: [
        { grupo: 'Guarnición A', opcion: 'Arroz', cantidad: 1 },
        { grupo: 'Guarnición B', opcion: 'Papas', cantidad: 2 },
        { grupo: 'Bebida', opcion: 'TE', cantidad: 4 },
        { grupo: 'Bebida', opcion: 'CAFE', cantidad: 2 },
      ],
    };
    const partes = partirLineaPorVariante(linea, catalogoMix, 1);
    expect(partes).toHaveLength(2);
    expect(partes.map((p) => p.cantidad)).toEqual([4, 2]);
    expect(partes[0].linea.nombreCocinaPedido).toBe('TÉ');
    expect(partes[1].linea.nombreCocinaPedido).toBe('CAFÉ');
    const arrozTe = partes[0].linea.complementosSeleccionados.find((c) => c.opcion === 'Arroz');
    const papasCafe = partes[1].linea.complementosSeleccionados.find((c) => c.opcion === 'Papas');
    expect(arrozTe.cantidad).toBe(1);
    expect(papasCafe.cantidad).toBe(2);
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

const catalogoPolloLena = {
  _id: 'idpollo',
  nombre: 'Pollo leña',
  nombreCocina: 'P.LEÑA',
  complementos: [
    { grupo: 'Guarnición', opciones: [{ nombre: 'Arroz' }] },
    {
      grupo: 'Corte',
      anexarVarianteAlNombre: true,
      opciones: [
        { nombre: 'Pierna' },
        { nombre: 'Pechuga' },
      ],
    },
  ],
};

describe('anexarVarianteAlNombre', () => {
  test('Pierna anexa al alias de cocina', () => {
    const linea = {
      plato: 'idpollo',
      nombre: 'Pollo leña',
      complementosSeleccionados: [
        { grupo: 'Guarnición', opcion: 'Arroz', cantidad: 1 },
        { grupo: 'Corte', opcion: 'Pierna', cantidad: 1 },
      ],
    };
    const partes = partirLineaPorVariante(linea, catalogoPolloLena, 2);
    expect(partes).toHaveLength(1);
    expect(partes[0].cantidad).toBe(2);
    expect(partes[0].linea.nombreCocinaPedido).toBe('P.LEÑA Pierna');
    expect(partes[0].linea.variantePlato).toMatchObject({
      opcion: 'Pierna',
      pronombre: 'Pierna',
      anexaNombre: true,
    });
    expect(esComplementoVariante({ grupo: 'Corte' }, catalogoPolloLena, partes[0].linea.variantePlato)).toBe(true);
    expect(esComplementoVariante({ grupo: 'Guarnición' }, catalogoPolloLena, partes[0].linea.variantePlato)).toBe(false);
  });

  test('sin alias usa el nombre comercial', () => {
    const cat = { ...catalogoPolloLena, nombreCocina: '' };
    const partes = partirLineaPorVariante({
      complementosSeleccionados: [{ grupo: 'Corte', opcion: 'Pierna', cantidad: 1 }],
    }, cat, 1);
    expect(partes[0].linea.nombreCocinaPedido).toBe('Pollo leña Pierna');
  });

  test('dos cortes parten en dos líneas con nombre anexado', () => {
    const partes = partirLineaPorVariante({
      complementosSeleccionados: [
        { grupo: 'Corte', opcion: 'Pierna', cantidad: 1 },
        { grupo: 'Corte', opcion: 'Pechuga', cantidad: 1 },
      ],
    }, catalogoPolloLena, 2);
    expect(partes).toHaveLength(2);
    expect(partes.map((p) => p.linea.nombreCocinaPedido)).toEqual(['P.LEÑA Pierna', 'P.LEÑA Pechuga']);
    expect(partes.map((p) => p.cantidad)).toEqual([1, 1]);
  });
});
