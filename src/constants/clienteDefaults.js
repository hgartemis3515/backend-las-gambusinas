const PREFIJO_CLIENTE_ANONIMO = 'Cliente';

const nombreClienteAnonimo = (numero) => `${PREFIJO_CLIENTE_ANONIMO}-${numero}`;

module.exports = {
  PREFIJO_CLIENTE_ANONIMO,
  NOMBRE_CLIENTE_FALLBACK: PREFIJO_CLIENTE_ANONIMO,
  nombreClienteAnonimo,
};
