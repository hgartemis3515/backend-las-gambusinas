'use strict';

/** Sesión corta (turno) vs dispositivo recordado (1 semana). */
function resolverExpiryJwtMozos(rememberMe) {
  const on =
    rememberMe === true ||
    rememberMe === 'true' ||
    rememberMe === 1 ||
    rememberMe === '1';
  return on ? '7d' : '12h';
}

module.exports = { resolverExpiryJwtMozos };
