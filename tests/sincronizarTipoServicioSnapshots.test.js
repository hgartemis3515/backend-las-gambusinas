const {
  normTipoServicio,
  aplicarTipoServicioEnLineas,
} = require('../src/utils/sincronizarTipoServicioSnapshots');

describe('tipoServicio en snapshots de ticket/boucher', () => {
  test('normTipoServicio solo acepta mesa | para_llevar', () => {
    expect(normTipoServicio('para_llevar')).toBe('para_llevar');
    expect(normTipoServicio('mesa')).toBe('mesa');
    expect(normTipoServicio(undefined)).toBe('mesa');
    expect(normTipoServicio('otro')).toBe('mesa');
  });

  test('prioriza platoLineaId y no pisa otra línea del mismo plato', () => {
    const platos = [
      { platoLineaId: 'aaa', platoId: 1, tipoServicio: 'mesa' },
      { platoLineaId: 'bbb', platoId: 1, tipoServicio: 'mesa' },
    ];
    const hits = aplicarTipoServicioEnLineas(platos, [
      { lineaId: 'bbb', tipoServicio: 'para_llevar' },
    ], 'c1');
    expect(hits).toBe(1);
    expect(platos[0].tipoServicio).toBe('mesa');
    expect(platos[1].tipoServicio).toBe('para_llevar');
  });

  test('fallback por platoId si no hay platoLineaId', () => {
    const platos = [
      { platoId: 10, comandaId: 'c1', tipoServicio: 'mesa' },
      { platoId: 11, comandaId: 'c1', tipoServicio: 'mesa' },
    ];
    const hits = aplicarTipoServicioEnLineas(platos, [
      { platoId: 11, tipoServicio: 'para_llevar' },
    ], 'c1');
    expect(hits).toBe(1);
    expect(platos[1].tipoServicio).toBe('para_llevar');
  });

  test('no cuenta hit si el tipo ya era el mismo', () => {
    const platos = [{ platoLineaId: 'aaa', tipoServicio: 'para_llevar' }];
    const hits = aplicarTipoServicioEnLineas(platos, [
      { lineaId: 'aaa', tipoServicio: 'para_llevar' },
    ], 'c1');
    expect(hits).toBe(0);
  });
});
