const Plato = require('../src/database/models/plato.model');
const ComplementoPlantilla = require('../src/database/models/complementoPlantilla.model');
const { sanitizarComplementosParaGuardar } = require('../src/repository/plato.repository');

describe('seleccionFija en grupos de complemento', () => {
  test('plato.complementos.seleccionFija existe y default false', () => {
    const path = Plato.schema.path('complementos').schema.path('seleccionFija');
    expect(path).toBeTruthy();
    expect(path.instance).toBe('Boolean');
    expect(path.defaultValue).toBe(false);
  });

  test('plantilla.seleccionFija existe y default false', () => {
    const path = ComplementoPlantilla.schema.path('seleccionFija');
    expect(path).toBeTruthy();
    expect(path.instance).toBe('Boolean');
    expect(path.defaultValue).toBe(false);
  });

  test('sanitizar conserva seleccionFija y cantidades con máx vacíos', () => {
    const out = sanitizarComplementosParaGuardar([{
      grupo: 'Guarnición',
      seleccionFija: true,
      seleccionMultiple: true,
      modoSeleccion: 'cantidades',
      maxUnidadesGrupo: '',
      minUnidadesGrupo: '',
      maxUnidadesPorOpcion: '',
      opciones: [
        { nombre: 'Papa', preseleccionada: true, cantidadPreseleccion: 2 },
        { nombre: 'Arroz', preseleccionada: true, cantidadPreseleccion: 1 },
      ],
    }]);
    expect(out).toHaveLength(1);
    expect(out[0].seleccionFija).toBe(true);
    expect(out[0].maxUnidadesGrupo).toBeNull();
    expect(out[0].maxUnidadesPorOpcion).toBeNull();
    expect(out[0].opciones[0]).toMatchObject({ nombre: 'Papa', preseleccionada: true, cantidadPreseleccion: 2 });
    expect(out[0].opciones[1]).toMatchObject({ nombre: 'Arroz', cantidadPreseleccion: 1 });
  });

  test('sanitizar no deja MIX como fijo', () => {
    const out = sanitizarComplementosParaGuardar([{
      grupo: 'MIX',
      esVariantePlato: true,
      seleccionFija: true,
      opciones: [{ nombre: 'TÉ' }],
    }]);
    expect(out[0].esVariantePlato).toBe(true);
    expect(out[0].seleccionFija).toBe(false);
  });
});
