const { buildPlatoDocFromJson } = require('../src/repository/plato.repository');
const { hydrateCatalogoDoc } = require('../src/utils/catalogoCartaPersistencia');

describe('import JSON de catálogo de platos', () => {
  const raw = {
    _id: '64a1b2c3d4e5f67890123456',
    id: 12,
    codigo: 'L1',
    codigoMozo: 'L1',
    nombre: 'Lomo saltado',
    nombreCocina: 'Lomo',
    descripcion: 'Clásico',
    precio: 28,
    stock: 10,
    categoria: 'Carnes',
    tipo: 'plato-carta normal',
    tipos: ['plato-carta normal'],
    orden: 40,
    isActive: true,
    platoEditable: true,
    complementosAfectanPrecio: true,
    mostrarTotalComplementosImpresion: true,
    complementosUnidosAlPlato: false,
    ocultarCronometroCocina: true,
    juntarGuarnicionesEntreVariantes: true,
    requiereNumeroSerie: false,
    kdsEstiloCompacto: true,
    nombresSincronizados: ['Lomo fino'],
    complementos: [{
      grupo: 'Guarnición',
      obligatorio: true,
      seleccionMultiple: true,
      modoSeleccion: 'cantidades',
      maxUnidadesGrupo: 2,
      minUnidadesGrupo: 1,
      seleccionFija: false,
      esVariantePlato: false,
      opciones: [
        { nombre: 'Arroz', precio: 0, pronombre: 'Arroz', preseleccionada: true },
        { nombre: 'Papa Frita', precio: 2 },
      ],
    }],
  };

  test('buildPlatoDocFromJson conserva orden, flags y guarniciones', () => {
    const doc = buildPlatoDocFromJson(raw);
    expect(doc.id).toBe(12);
    expect(doc.orden).toBe(40);
    expect(doc.descripcion).toBe('Clásico');
    expect(doc.nombreCocina).toBe('Lomo');
    expect(doc.platoEditable).toBe(true);
    expect(doc.ocultarCronometroCocina).toBe(true);
    expect(doc.kdsEstiloCompacto).toBe(true);
    expect(doc.complementos).toHaveLength(1);
    expect(doc.complementos[0].grupo).toBe('Guarnición');
    expect(doc.complementos[0].opciones.map((o) => o.nombre)).toEqual(['Arroz', 'Papa Frita']);
    expect(String(doc._id)).toBe(raw._id);
  });

  test('hydrateCatalogoDoc conserva el documento completo', () => {
    const doc = hydrateCatalogoDoc(raw);
    expect(doc.orden).toBe(40);
    expect(doc.complementos[0].opciones).toHaveLength(2);
    expect(doc.platoEditable).toBe(true);
    expect(String(doc._id)).toBe(raw._id);
  });
});
