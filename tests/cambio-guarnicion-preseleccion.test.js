const {
  calcularCambioGuarnicionPreseleccion,
  aplicarCambioGuarnicionAPlato,
} = require('../src/utils/cambioGuarnicionPreseleccion');
const { fusionarGuarnicionesPreseleccionadas } = require('../src/utils/preseleccionGuarniciones');

const platoLeña = {
  nombre: '1/4 Pollo a la leña',
  complementos: [
    {
      grupo: 'Guarnicion',
      seleccionMultiple: true,
      modoSeleccion: 'multiple',
      opciones: [
        { nombre: 'Papa Frita', preseleccionada: true },
        { nombre: 'Arroz', preseleccionada: true },
        { nombre: 'Ensalada', preseleccionada: true },
        { nombre: 'Yuca frita', preseleccionada: false },
        { nombre: 'Frejol', preseleccionada: false },
      ],
    },
    {
      grupo: 'Variacion',
      anexarVarianteAlNombre: true,
      opciones: [{ nombre: 'Pie' }],
    },
  ],
};

describe('calcularCambioGuarnicionPreseleccion', () => {
  test('mismas marcas → no cuenta G', () => {
    const r = calcularCambioGuarnicionPreseleccion(platoLeña, [
      { grupo: 'Guarnicion', opcion: 'Papa Frita', cantidad: 1 },
      { grupo: 'Guarnicion', opcion: 'Arroz', cantidad: 1 },
      { grupo: 'Guarnicion', opcion: 'Ensalada', cantidad: 1 },
    ]);
    expect(r.cambioGuarnicionPreseleccion).toBe(false);
    expect(r.guarnicionesCambio.entraron).toEqual([]);
  });

  test('una guarnición distinta de la marca → cuenta 1 (flag true)', () => {
    const r = calcularCambioGuarnicionPreseleccion(platoLeña, [
      { grupo: 'Guarnicion', opcion: 'Papa Frita', cantidad: 1 },
      { grupo: 'Guarnicion', opcion: 'Arroz', cantidad: 1 },
      { grupo: 'Guarnicion', opcion: 'Yuca frita', cantidad: 1 },
    ]);
    expect(r.cambioGuarnicionPreseleccion).toBe(true);
    expect(r.guarnicionesCambio.entraron.map((x) => x.opcion)).toContain('Yuca frita');
    expect(r.guarnicionesCambio.salieron.map((x) => x.opcion)).toContain('Ensalada');
  });

  test('3 guarniciones distintas en la misma línea → sigue siendo un solo cambio', () => {
    const r = calcularCambioGuarnicionPreseleccion(platoLeña, [
      { grupo: 'Guarnicion', opcion: 'Yuca frita', cantidad: 1 },
      { grupo: 'Guarnicion', opcion: 'Frejol', cantidad: 1 },
      { grupo: 'Guarnicion', opcion: 'Yuca frita', cantidad: 1 },
    ]);
    expect(r.cambioGuarnicionPreseleccion).toBe(true);
    expect(r.cambioGuarnicionPreseleccion).not.toBe(3);
  });

  test('MIX / variación no disparan G si las marcas se mantienen', () => {
    const r = calcularCambioGuarnicionPreseleccion(platoLeña, [
      { grupo: 'Guarnicion', opcion: 'Papa Frita', cantidad: 1 },
      { grupo: 'Guarnicion', opcion: 'Arroz', cantidad: 1 },
      { grupo: 'Guarnicion', opcion: 'Ensalada', cantidad: 1 },
      { grupo: 'Variacion', opcion: 'Pie', cantidad: 1 },
    ]);
    expect(r.cambioGuarnicionPreseleccion).toBe(false);
  });

  test('plato sin marcas en catálogo → no cuenta', () => {
    const plato = {
      complementos: [{
        grupo: 'Extras',
        opciones: [{ nombre: 'Huevo', preseleccionada: false }],
      }],
    };
    const r = calcularCambioGuarnicionPreseleccion(plato, [
      { grupo: 'Extras', opcion: 'Huevo', cantidad: 1 },
    ]);
    expect(r.cambioGuarnicionPreseleccion).toBe(false);
  });

  test('tras fusionar preselección (solo mandó variación) no cuenta G', () => {
    const fused = fusionarGuarnicionesPreseleccionadas(platoLeña, [
      { grupo: 'Variacion', opcion: 'Pie', cantidad: 1 },
    ]);
    const r = calcularCambioGuarnicionPreseleccion(platoLeña, fused);
    expect(r.cambioGuarnicionPreseleccion).toBe(false);
  });

  test('snapshot persistido gana al catálogo vivo', () => {
    const snap = [
      { grupo: 'Guarnicion', opcion: 'Papa Frita', cantidad: 1 },
    ];
    const r = calcularCambioGuarnicionPreseleccion(
      platoLeña,
      [{ grupo: 'Guarnicion', opcion: 'Papa Frita', cantidad: 1 }],
      snap
    );
    expect(r.cambioGuarnicionPreseleccion).toBe(false);
  });

  test('aplicarCambioGuarnicionAPlato escribe el flag en la línea', () => {
    const plato = {
      complementosSeleccionados: [
        { grupo: 'Guarnicion', opcion: 'Frejol', cantidad: 1 },
      ],
    };
    aplicarCambioGuarnicionAPlato(plato, platoLeña);
    expect(plato.cambioGuarnicionPreseleccion).toBe(true);
    expect(plato.guarnicionesMarcaSnapshot.length).toBe(3);
  });
});
