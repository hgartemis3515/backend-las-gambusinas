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

describe('deshabilitarSumaVariante en grupos MIX', () => {
  test('plato.complementos.deshabilitarSumaVariante existe y default false', () => {
    const path = Plato.schema.path('complementos').schema.path('deshabilitarSumaVariante');
    expect(path).toBeTruthy();
    expect(path.instance).toBe('Boolean');
    expect(path.defaultValue).toBe(false);
  });

  test('plantilla.deshabilitarSumaVariante existe y default false', () => {
    const path = ComplementoPlantilla.schema.path('deshabilitarSumaVariante');
    expect(path).toBeTruthy();
    expect(path.instance).toBe('Boolean');
    expect(path.defaultValue).toBe(false);
  });

  test('sanitizar conserva deshabilitarSumaVariante solo en MIX', () => {
    const mix = sanitizarComplementosParaGuardar([{
      grupo: 'MIX',
      esVariantePlato: true,
      deshabilitarSumaVariante: true,
      opciones: [{ nombre: 'TÉ' }, { nombre: 'CAFÉ' }],
    }]);
    expect(mix[0].deshabilitarSumaVariante).toBe(true);
    expect(mix[0].esVariantePlato).toBe(true);

    const otro = sanitizarComplementosParaGuardar([{
      grupo: 'Guarnición',
      deshabilitarSumaVariante: true,
      opciones: [{ nombre: 'Arroz' }],
    }]);
    expect(otro[0].deshabilitarSumaVariante).toBe(false);
  });
});

describe('anexarVarianteAlNombre', () => {
  test('plato.complementos.anexarVarianteAlNombre existe y default false', () => {
    const path = Plato.schema.path('complementos').schema.path('anexarVarianteAlNombre');
    expect(path).toBeTruthy();
    expect(path.instance).toBe('Boolean');
    expect(path.defaultValue).toBe(false);
  });

  test('plantilla.anexarVarianteAlNombre existe y default false', () => {
    const path = ComplementoPlantilla.schema.path('anexarVarianteAlNombre');
    expect(path).toBeTruthy();
    expect(path.instance).toBe('Boolean');
    expect(path.defaultValue).toBe(false);
  });

  test('sanitizar conserva anexar y no deja MIX ni fijo', () => {
    const out = sanitizarComplementosParaGuardar([{
      grupo: 'Corte',
      anexarVarianteAlNombre: true,
      esVariantePlato: true,
      seleccionFija: true,
      opciones: [{ nombre: 'Pierna' }, { nombre: 'Pechuga' }],
    }]);
    expect(out[0].esVariantePlato).toBe(true);
    expect(out[0].anexarVarianteAlNombre).toBe(false);
    expect(out[0].seleccionFija).toBe(false);
  });

  test('sanitizar deja un solo grupo definidor de nombre', () => {
    const out = sanitizarComplementosParaGuardar([
      { grupo: 'Corte', anexarVarianteAlNombre: true, opciones: [{ nombre: 'Pierna' }] },
      { grupo: 'MIX', esVariantePlato: true, opciones: [{ nombre: 'TÉ' }] },
    ]);
    expect(out[0].anexarVarianteAlNombre).toBe(true);
    expect(out[1].esVariantePlato).toBe(false);
    expect(out[1].anexarVarianteAlNombre).toBe(false);
  });
});

describe('forzarVisibleTablaKds', () => {
  test('plato.complementos.forzarVisibleTablaKds existe y default false', () => {
    const path = Plato.schema.path('complementos').schema.path('forzarVisibleTablaKds');
    expect(path).toBeTruthy();
    expect(path.instance).toBe('Boolean');
    expect(path.defaultValue).toBe(false);
  });

  test('sanitizar conserva forzarVisibleTablaKds y lo apaga en MIX', () => {
    const ok = sanitizarComplementosParaGuardar([{
      grupo: 'Salsa',
      forzarVisibleTablaKds: true,
      opciones: [{ nombre: 'Huancaína' }],
    }]);
    expect(ok[0].forzarVisibleTablaKds).toBe(true);

    const mix = sanitizarComplementosParaGuardar([{
      grupo: 'MIX',
      esVariantePlato: true,
      forzarVisibleTablaKds: true,
      opciones: [{ nombre: 'TÉ' }],
    }]);
    expect(mix[0].forzarVisibleTablaKds).toBe(false);
  });
});
