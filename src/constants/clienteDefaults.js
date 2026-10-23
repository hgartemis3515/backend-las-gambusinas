const PREFIJO_CLIENTE_ANONIMO = 'Cliente';

const nombreClienteAnonimo = (numero) => `${PREFIJO_CLIENTE_ANONIMO}-${numero}`;

function esNombreClienteAnonimo(nombre) {
  return /^cliente-\d+$/i.test(String(nombre || '').trim());
}

/** El nombre que escribió el mozo gana sobre Cliente-123. */
function nombreClientePreferido(...vals) {
  const limpios = [];
  for (const v of vals) {
    const s = String(v == null ? '' : v).trim().slice(0, 60);
    if (s) limpios.push(s);
  }
  return limpios.find((s) => !esNombreClienteAnonimo(s)) || limpios[0] || null;
}

module.exports = {
  PREFIJO_CLIENTE_ANONIMO,
  NOMBRE_CLIENTE_FALLBACK: PREFIJO_CLIENTE_ANONIMO,
  nombreClienteAnonimo,
  esNombreClienteAnonimo,
  nombreClientePreferido,
};
