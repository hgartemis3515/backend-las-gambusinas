jest.mock('../src/database/models/asignacionAutomaticaGuarniciones.model', () => ({
  obtenerConfiguracion: jest.fn(),
  CONFIG_ID: 'asignacion_automatica_guarniciones'
}));
jest.mock('../src/database/models/configCocinero.model', () => ({ findOne: jest.fn() }));
jest.mock('../src/database/models/configuracionSistema.model', () => ({
  obtenerConfiguracion: jest.fn()
}));
jest.mock('../src/database/models/zona.model', () => {
  function Zona() {}
  Zona.find = jest.fn();
  Zona.prototype.debeMostrarPlato = jest.fn(() => true);
  return Zona;
});
jest.mock('../src/database/models/mozos.model', () => ({ findById: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/utils/redisCache', () => ({ invalidate: jest.fn() }));
jest.mock('mongoose', () => {
  const m = jest.requireActual('mongoose');
  return {
    ...m,
    model: jest.fn(() => ({
      findById: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      aggregate: jest.fn(),
      updateOne: jest.fn()
    }))
  };
});

const svc = require('../src/services/asignacionAutomaticaGuarnicionesService');
const { indicesPendientesMismoDestino } = require('../src/utils/autocerrarGuarniciones');

describe('DCH jugo vs panes: no arrastrar a la misma cocina', () => {
  test('particiona panes C3 y jugo C4', () => {
    const perfilDch = {
      reglasPorGuarnicion: [
        { guarnicionKey: 'guarniciones de pan::panes', platoId: 204, cocineroPrimarioId: 'C3', activo: true },
        { guarnicionKey: 'guarniciones de pan::mantequilla', platoId: 204, cocineroPrimarioId: 'C3', activo: true },
        { guarnicionKey: 'guarniciones de pan::mermelada', platoId: 204, cocineroPrimarioId: 'C3', activo: true },
        { guarnicionKey: 'guarniciones de pan::jugo de papaya', platoId: 204, cocineroPrimarioId: 'C4', activo: true }
      ],
      reglasPorGrupo: []
    };
    const pendientes = [
      { ci: 0, comp: { grupo: 'Guarniciones de pan', opcion: 'Panes' } },
      { ci: 1, comp: { grupo: 'Guarniciones de pan', opcion: 'Mantequilla' } },
      { ci: 2, comp: { grupo: 'Guarniciones de pan', opcion: 'Mermelada' } },
      { ci: 3, comp: { grupo: 'Guarniciones de pan', opcion: 'Jugo de papaya' } }
    ];
    const { buckets, sinRegla } = svc.particionarPendientesPorRegla(pendientes, perfilDch, 204, null);
    expect(sinRegla).toHaveLength(0);
    expect(buckets.size).toBe(2);
    expect(buckets.get('C3').items.map((p) => p.comp.opcion)).toEqual(['Panes', 'Mantequilla', 'Mermelada']);
    expect(buckets.get('C4').items.map((p) => p.comp.opcion)).toEqual(['Jugo de papaya']);
  });

  test('id catálogo usa platoId numérico, no el ObjectId de línea', () => {
    expect(svc.idCatalogoPlatoLinea({
      _id: '6a9ebbf07e91c7611b29ca92',
      platoId: 204,
      plato: { _id: '6a9c3f6dba4082a68b277035', id: 204 }
    })).toBe(204);
    expect(svc.idCatalogoPlatoLinea({ plato: { id: 204 } })).toBe(204);
  });

  test('tomar panes no cierra el jugo de C4', () => {
    const plato = {
      complementosSeleccionados: [
        { opcion: 'Panes', estadoCocina: 'en_espera', procesandoPor: { cocineroId: 'C3' } },
        { opcion: 'Mantequilla', estadoCocina: 'en_espera', procesandoPor: { cocineroId: 'C3' } },
        { opcion: 'Jugo de papaya', estadoCocina: 'en_espera', procesandoPor: { cocineroId: 'C4' } }
      ]
    };
    expect(indicesPendientesMismoDestino(plato, 0)).toEqual([0, 1]);
    expect(indicesPendientesMismoDestino(plato, 2)).toEqual([2]);
  });
});
