const { elegirSiguienteBackup } = require('../src/utils/elegirSiguienteBackup');

describe('elegirSiguienteBackup', () => {
  const regla = {
    cocineroPrimarioId: 'P1',
    backups: [
      { cocineroId: 'B1', orden: 1 },
      { cocineroId: 'B2', orden: 2 },
    ],
  };

  test('desde el primario elige el primer backup', () => {
    expect(elegirSiguienteBackup(regla, 'P1').cocineroId).toBe('B1');
  });

  test('desde el primer backup pasa al segundo', () => {
    expect(elegirSiguienteBackup(regla, 'B1').cocineroId).toBe('B2');
  });

  test('en el último backup no hay siguiente', () => {
    expect(elegirSiguienteBackup(regla, 'B2')).toBeNull();
  });

  test('sin backups retorna null', () => {
    expect(elegirSiguienteBackup({ backups: [] }, 'P1')).toBeNull();
  });
});
