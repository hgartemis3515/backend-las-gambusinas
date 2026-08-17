/**
 * Tests del servicio asignacionAutomaticaGuarnicionesService (PLAN v1.1).
 * Cubre lógica pura (sin Mongo): batchs, prioridad, estación, reglas.
 */
const svc = require('./asignacionAutomaticaGuarnicionesService');

describe('normalizarGuarnicionKey', () => {
  test('canónico trim+lower', () => {
    expect(svc.normalizarGuarnicionKey('Acompañamiento', 'Papas Fritas'))
      .toBe('acompañamiento::papas fritas');
  });
});

describe('detectarBatchsEnComanda', () => {
  test('sin complementos → vacío', () => {
    expect(svc.detectarBatchsEnComanda({ platos: [] })).toEqual({});
  });

  test('2+ guarniciones mismo key en misma comanda → batch', () => {
    const comanda = {
      platos: [
        {
          complementosSeleccionados: [
            { grupo: 'Acomp', opcion: 'Papas fritas' },
            { grupo: 'Acomp', opcion: 'Papas fritas' }
          ]
        },
        {
          complementosSeleccionados: [
            { grupo: 'Acomp', opcion: 'Papas fritas' }
          ]
        }
      ]
    };
    const batchs = svc.detectarBatchsEnComanda(comanda);
    expect(Object.keys(batchs)).toHaveLength(1);
    expect(batchs['acompañamiento::papas fritas']).toHaveLength(3);
  });

  test('guarniciones ya asignadas no entran en batch', () => {
    const comanda = {
      platos: [{
        complementosSeleccionados: [
          { grupo: 'Acomp', opcion: 'Papas', procesandoPor: { cocineroId: 'X' } },
          { grupo: 'Acomp', opcion: 'Papas' }
        ]
      }]
    };
    const batchs = svc.detectarBatchsEnComanda(comanda);
    // Solo 1 pendiente → no hay batch (necesita 2+)
    expect(batchs).toEqual({});
  });

  test('claves distintas no forman batch', () => {
    const comanda = {
      platos: [{
        complementosSeleccionados: [
          { grupo: 'Acomp', opcion: 'Papas' },
          { grupo: 'Acomp', opcion: 'Arroz' }
        ]
      }]
    };
    expect(svc.detectarBatchsEnComanda(comanda)).toEqual({});
  });
});

describe('prioridadUnidadTrabajo', () => {
  test('refire > vip > tiempoLimitado > estándar', () => {
    expect(svc.prioridadUnidadTrabajo({})).toBe(0);
    expect(svc.prioridadUnidadTrabajo({ etiquetasPrioridad: { tiempoLimitado: true } })).toBe(1);
    expect(svc.prioridadUnidadTrabajo({ etiquetasPrioridad: { vip: true } })).toBe(2);
    expect(svc.prioridadUnidadTrabajo({ etiquetasPrioridad: { refire: true } })).toBe(3);
  });
  test('refire gana sobre vip combinado', () => {
    expect(svc.prioridadUnidadTrabajo({ etiquetasPrioridad: { refire: true, vip: true } })).toBe(3);
  });
});

describe('cocineroTieneEstacion', () => {
  test('sin estación recomendada → true', () => {
    expect(svc.cocineroTieneEstacion({ estaciones: ['fritura'] }, null)).toBe(true);
  });
  test('cocinero general (sin estaciones) → true siempre', () => {
    expect(svc.cocineroTieneEstacion({}, 'fritura')).toBe(true);
    expect(svc.cocineroTieneEstacion({ estaciones: [] }, 'fritura')).toBe(true);
  });
  test('coincide exacto → true', () => {
    expect(svc.cocineroTieneEstacion({ estaciones: ['fritura', 'plancha'] }, 'fritura')).toBe(true);
  });
  test('no coincide y no es general → false', () => {
    expect(svc.cocineroTieneEstacion({ estaciones: ['ensaladas'] }, 'fritura')).toBe(false);
  });
  test('general explícito → true', () => {
    expect(svc.cocineroTieneEstacion({ estaciones: ['general'] }, 'fritura')).toBe(true);
  });
});

describe('encontrarReglaGuarnicion', () => {
  const perfil = {
    reglasPorGuarnicion: [
      { guarnicionKey: 'acompañamiento::papas fritas', cocineroPrimarioId: 'A', estacionRecomendada: 'fritura', activo: true },
      { guarnicionKey: 'salsa::criolla', cocineroPrimarioId: 'B', activo: false }
    ],
    reglasPorGrupo: [
      { grupo: 'Acompañamiento', cocineroPrimarioId: 'C', activo: true }
    ]
  };

  test('regla por guarnicion exacta gana', () => {
    const r = svc.encontrarReglaGuarnicion(perfil, 'Acompañamiento', 'Papas fritas');
    expect(r).not.toBeNull();
    expect(r.tipo).toBe('guarnicion');
    expect(r.regla.cocineroPrimarioId).toBe('A');
    expect(r.regla.estacionRecomendada).toBe('fritura');
  });

  test('regla inactiva se salta', () => {
    const r = svc.encontrarReglaGuarnicion(perfil, 'Salsa', 'Criolla');
    // La regla por guarnicion está inactiva → cae a regla por grupo (no hay grupo "Salsa") → null
    expect(r).toBeNull();
  });

  test('fallback a regla por grupo', () => {
    const r = svc.encontrarReglaGuarnicion(perfil, 'Acompañamiento', 'Arroz');
    expect(r).not.toBeNull();
    expect(r.tipo).toBe('grupo');
    expect(r.regla.cocineroPrimarioId).toBe('C');
  });

  test('sin regla → null', () => {
    expect(svc.encontrarReglaGuarnicion(perfil, 'Bebida', 'Inca Kola')).toBeNull();
  });
});

describe('construirCandidatos', () => {
  test('primario + backups ordenados', () => {
    const regla = {
      cocineroPrimarioId: 'A',
      backups: [
        { cocineroId: 'C', orden: 2 },
        { cocineroId: 'B', orden: 1 }
      ]
    };
    const cands = svc.construirCandidatos(regla);
    expect(cands).toHaveLength(3);
    expect(cands[0]).toMatchObject({ cocineroId: 'A', esPrimario: true, orden: 0 });
    expect(cands[1]).toMatchObject({ cocineroId: 'B', orden: 1 });
    expect(cands[2]).toMatchObject({ cocineroId: 'C', orden: 2 });
  });
  test('sin backups → solo primario', () => {
    const cands = svc.construirCandidatos({ cocineroPrimarioId: 'A' });
    expect(cands).toHaveLength(1);
  });
});

describe('resolverPerfilActivo', () => {
  test('deshabilitada → motivo deshabilitada', () => {
    const r = svc.resolverPerfilActivo({ habilitada: false });
    expect(r.perfil).toBeNull();
    expect(r.motivo).toBe('deshabilitada');
  });
  test('sin bloques → sin_franja_activa', () => {
    const r = svc.resolverPerfilActivo({ habilitada: true, calendario: { bloques: [] } });
    expect(r.motivo).toBe('sin_franja_activa');
  });
  test('bloque activo + perfil existe → ok', () => {
    const m = require('moment-timezone');
    const ahora = m().tz('America/Lima');
    const dia = ahora.day();
    const hhmm = ahora.format('HH:mm');
    const config = {
      habilitada: true,
      perfiles: [{ id: 'p1', activo: true, reglasPorGuarnicion: [] }],
      calendario: {
        bloques: [{
          id: 'b1', perfilId: 'p1', activo: true,
          diasSemana: [dia], horaInicio: '00:00', horaFin: '23:59'
        }]
      }
    };
    const r = svc.resolverPerfilActivo(config, ahora);
    expect(r.motivo).toBe('ok');
    expect(r.perfil.id).toBe('p1');
  });
});

// ---------------- Escenarios de servicio real ----------------

describe('Escenarios de servicio real (lógica pura)', () => {
  test('Muchas papas fritas: detectarBatchs agrupa todas las pendientes', () => {
    const comanda = {
      platos: [
        { complementosSeleccionados: [{ grupo: 'Acomp', opcion: 'Papas fritas' }] },
        { complementosSeleccionados: [{ grupo: 'Acomp', opcion: 'Papas fritas' }] },
        { complementosSeleccionados: [{ grupo: 'Acomp', opcion: 'Papas fritas' }] }
      ]
    };
    const batchs = svc.detectarBatchsEnComanda(comanda);
    expect(batchs['acompañamiento::papas fritas']).toHaveLength(3);
  });

  test('VIP + refire: refire gana prioridad al frente de la cola', () => {
    const vip = svc.prioridadUnidadTrabajo({ etiquetasPrioridad: { vip: true } });
    const refire = svc.prioridadUnidadTrabajo({ etiquetasPrioridad: { refire: true } });
    expect(refire).toBeGreaterThan(vip);
  });

  test('Estación saturada: cocinero sin la estación recomendada no la cumple', () => {
    const cocineroEnsaladas = { estaciones: ['ensaladas'] };
    expect(svc.cocineroTieneEstacion(cocineroEnsaladas, 'fritura')).toBe(false);
    // Pero un cocinero general sí la cumple (fallback)
    expect(svc.cocineroTieneEstacion({ estaciones: [] }, 'fritura')).toBe(true);
  });

  test('Batch: 3 papas en misma comanda → 1 batch con 3 items', () => {
    const comanda = {
      platos: [{
        complementosSeleccionados: [
          { grupo: 'Acomp', opcion: 'Papas fritas' },
          { grupo: 'Acomp', opcion: 'Papas fritas' },
          { grupo: 'Acomp', opcion: 'Papas fritas' }
        ]
      }]
    };
    const batchs = svc.detectarBatchsEnComanda(comanda);
    const keys = Object.keys(batchs);
    expect(keys).toHaveLength(1);
    expect(batchs[keys[0]]).toHaveLength(3);
  });

  test('Regla por guarnicion con estación recomendada se resuelve antes que la de grupo', () => {
    const perfil = {
      reglasPorGuarnicion: [
        { guarnicionKey: 'acompañamiento::papas fritas', cocineroPrimarioId: 'FRITURA', estacionRecomendada: 'fritura', activo: true }
      ],
      reglasPorGrupo: [
        { grupo: 'Acompañamiento', cocineroPrimarioId: 'GENERAL', activo: true }
      ]
    };
    const r = svc.encontrarReglaGuarnicion(perfil, 'Acompañamiento', 'Papas fritas');
    expect(r.regla.cocineroPrimarioId).toBe('FRITURA');
    expect(r.regla.estacionRecomendada).toBe('fritura');
  });
});
