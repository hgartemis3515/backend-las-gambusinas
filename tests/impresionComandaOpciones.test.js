const {
  imprimirSoloNombreComercial,
  nombreComercialLineaImpresion,
  aplicarOpcionesImpresionProductos,
} = require('../src/utils/impresionComandaOpciones');

describe('impresionComandaOpciones', () => {
  test('default ON si el flag no viene en config', () => {
    expect(imprimirSoloNombreComercial(undefined)).toBe(true);
    expect(imprimirSoloNombreComercial({})).toBe(true);
    expect(imprimirSoloNombreComercial({ tickets: {} })).toBe(true);
  });

  test('se puede desactivar', () => {
    expect(imprimirSoloNombreComercial({
      tickets: { imprimirSoloNombreComercial: false },
    })).toBe(false);
  });

  test('prioriza nombre comercial sobre alias de cocina', () => {
    expect(nombreComercialLineaImpresion({
      nombre: 'CEV',
      nombreCocina: 'CEV',
      plato: { nombre: 'Ceviche Clásico', nombreCocina: 'CEV' },
    })).toBe('Ceviche Clásico');
  });

  test('marcado: quita guarniciones y deja nombre de carta', () => {
    const out = aplicarOpcionesImpresionProductos([{
      nombre: 'CEV',
      plato: { nombre: 'Ceviche Clásico', nombreCocina: 'CEV' },
      complementos: [{ grupo: 'Guarnición', opcion: 'Papas' }],
      mostrarResumenComplementos: true,
    }]);
    expect(out[0].nombre).toBe('Ceviche Clásico');
    expect(out[0].complementos).toEqual([]);
    expect(out[0].mostrarResumenComplementos).toBe(false);
  });

  test('omite platos eliminados o anulados', () => {
    const out = aplicarOpcionesImpresionProductos([
      { nombre: 'Lomo', plato: { nombre: 'Lomo' }, eliminado: true },
      { nombre: 'Causa', plato: { nombre: 'Causa' } },
      { nombre: 'Chicha', plato: { nombre: 'Chicha' }, anulado: true },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].nombre).toBe('Causa');
  });

  test('desmarcado: conserva guarniciones y sigue usando nombre comercial', () => {
    const extras = [{ grupo: 'Guarnición', opcion: 'Papas' }];
    const out = aplicarOpcionesImpresionProductos([{
      nombre: 'Lomo Saltado',
      complementos: extras,
    }], { soloNombreComercial: false });
    expect(out[0].nombre).toBe('Lomo Saltado');
    expect(out[0].complementos).toEqual(extras);
  });
});
