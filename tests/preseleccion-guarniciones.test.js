const { fusionarGuarnicionesPreseleccionadas, preseleccionGuarnicionesDeCatalogo } = require('../src/utils/preseleccionGuarniciones');

const platoLeña = {
  nombre: '1/4 Pollo a la leña + papa frita + arroz + ensalada',
  complementos: [
    {
      grupo: 'Guarnicion',
      seleccionFija: false,
      seleccionMultiple: true,
      modoSeleccion: 'multiple',
      opciones: [
        { nombre: 'Papa Frita', preseleccionada: true },
        { nombre: 'Arroz', preseleccionada: true },
        { nombre: 'Ensalada', preseleccionada: true },
        { nombre: 'Frejol', preseleccionada: false },
      ],
    },
    {
      grupo: 'Variacion',
      anexarVarianteAlNombre: true,
      modoSeleccion: 'cantidades',
      opciones: [
        { nombre: 'Pie', pronombre: 'Pie' },
        { nombre: 'Pec', pronombre: 'Pec' },
      ],
    },
  ],
};

describe('fusionarGuarnicionesPreseleccionadas', () => {
  test('catálogo lista las guarniciones marcadas y no la variación', () => {
    const defs = preseleccionGuarnicionesDeCatalogo(platoLeña);
    expect(defs.map((d) => d.opcion).sort()).toEqual(['Arroz', 'Ensalada', 'Papa Frita']);
  });

  test('si el mozo solo mandó la variación, completa Papa/Arroz/Ensalada', () => {
    const out = fusionarGuarnicionesPreseleccionadas(platoLeña, [
      { grupo: 'Variacion', opcion: 'Pie', cantidad: 1 },
    ]);
    const ops = out.map((c) => `${c.grupo}:${c.opcion}`).sort();
    expect(ops).toEqual([
      'Guarnicion:Arroz',
      'Guarnicion:Ensalada',
      'Guarnicion:Papa Frita',
      'Variacion:Pie',
    ]);
  });

  test('si ya hay el grupo de guarnición, no reinserta las no elegidas', () => {
    const out = fusionarGuarnicionesPreseleccionadas(platoLeña, [
      { grupo: 'Guarnicion', opcion: 'Arroz', cantidad: 1 },
      { grupo: 'Variacion', opcion: 'Pec', cantidad: 1 },
    ]);
    const garn = out.filter((c) => c.grupo === 'Guarnicion').map((c) => c.opcion);
    expect(garn).toEqual(['Arroz']);
  });

  test('plato sin marcas no agrega nada', () => {
    const plato = {
      complementos: [{
        grupo: 'Extras',
        opciones: [{ nombre: 'Huevo', preseleccionada: false }],
      }],
    };
    expect(fusionarGuarnicionesPreseleccionadas(plato, [])).toEqual([]);
  });
});
