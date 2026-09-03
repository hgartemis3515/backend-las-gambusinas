'use strict';

const PIN_COCINA_LEN = 6;

function normalizarPinCocina(v) {
  return String(v || '').replace(/\D/g, '').slice(0, PIN_COCINA_LEN);
}

function esPinCocinaValido(v) {
  return new RegExp(`^\\d{${PIN_COCINA_LEN}}$`).test(String(v || '').trim());
}

module.exports = {
  PIN_COCINA_LEN,
  normalizarPinCocina,
  esPinCocinaValido
};
