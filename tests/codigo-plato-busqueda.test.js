/**
 * Tests de búsqueda por código de serie en el KDS.
 * Verifica que la función calcularPuntuacionCodigo funcione con códigos
 * de longitud variable: L1, M23, D345.
 */

// Reproducimos la función aquí para testearla en aislamiento.
function calcularPuntuacionCodigo(codigoPlato, termino) {
  if (!codigoPlato || !termino) return { puntuacion: 0, tipo: 'ninguna' };
  const codigo = String(codigoPlato).trim().toUpperCase();
  const terminoUpper = termino.toUpperCase();

  if (codigo === terminoUpper) return { puntuacion: 110, tipo: 'codigo_exacto' };
  if (codigo.startsWith(terminoUpper)) return { puntuacion: 95, tipo: 'codigo_prefijo' };

  if (/^[0-9]+$/.test(terminoUpper)) {
    const digitosCodigo = codigo.replace(/^[A-Z]/, '');
    if (digitosCodigo === terminoUpper) return { puntuacion: 90, tipo: 'codigo_numeros' };
    if (digitosCodigo.startsWith(terminoUpper)) {
      return { puntuacion: 80, tipo: 'codigo_numeros_prefijo' };
    }
  }

  return { puntuacion: 0, tipo: 'ninguna' };
}

describe('calcularPuntuacionCodigo — códigos de longitud variable', () => {
  test('exacto L1', () => {
    const r = calcularPuntuacionCodigo('L1', 'L1');
    expect(r.puntuacion).toBe(110);
    expect(r.tipo).toBe('codigo_exacto');
  });

  test('exacto M23', () => {
    const r = calcularPuntuacionCodigo('M23', 'M23');
    expect(r.puntuacion).toBe(110);
    expect(r.tipo).toBe('codigo_exacto');
  });

  test('exacto D345', () => {
    const r = calcularPuntuacionCodigo('D345', 'D345');
    expect(r.puntuacion).toBe(110);
    expect(r.tipo).toBe('codigo_exacto');
  });

  test('prefijo letra L -> L1', () => {
    const r = calcularPuntuacionCodigo('L1', 'L');
    expect(r.puntuacion).toBe(95);
    expect(r.tipo).toBe('codigo_prefijo');
  });

  test('prefijo M2 -> M23', () => {
    const r = calcularPuntuacionCodigo('M23', 'M2');
    expect(r.puntuacion).toBe(95);
    expect(r.tipo).toBe('codigo_prefijo');
  });

  test('prefijo D34 -> D345', () => {
    const r = calcularPuntuacionCodigo('D345', 'D34');
    expect(r.puntuacion).toBe(95);
    expect(r.tipo).toBe('codigo_prefijo');
  });

  test('solamente dígitos 1 -> L345', () => {
    const r = calcularPuntuacionCodigo('L345', '345');
    expect(r.puntuacion).toBe(90);
    expect(r.tipo).toBe('codigo_numeros');
  });

  test('solamente dígitos 23 -> M23', () => {
    const r = calcularPuntuacionCodigo('M23', '23');
    expect(r.puntuacion).toBe(90);
    expect(r.tipo).toBe('codigo_numeros');
  });

  test('solamente dígitos 1 -> L1', () => {
    const r = calcularPuntuacionCodigo('L1', '1');
    expect(r.puntuacion).toBe(90);
    expect(r.tipo).toBe('codigo_numeros');
  });

  test('prefijo numérico 3 -> D345', () => {
    const r = calcularPuntuacionCodigo('D345', '3');
    expect(r.puntuacion).toBe(80);
    expect(r.tipo).toBe('codigo_numeros_prefijo');
  });

  test('no coincide', () => {
    const r = calcularPuntuacionCodigo('M23', 'L1');
    expect(r.puntuacion).toBe(0);
    expect(r.tipo).toBe('ninguna');
  });
});