'use strict';

const PIN_COCINA_MIN = 6;
const PIN_COCINA_MAX = 8;
const PIN_COCINA_LEN = PIN_COCINA_MAX;

function normalizarPinCocina(v) {
  return String(v || '').replace(/\D/g, '').slice(0, PIN_COCINA_MAX);
}

function esPinCocinaValido(v) {
  return new RegExp(`^\\d{${PIN_COCINA_MIN},${PIN_COCINA_MAX}}$`).test(String(v || '').trim());
}

module.exports = {
  PIN_COCINA_MIN,
  PIN_COCINA_MAX,
  PIN_COCINA_LEN,
  normalizarPinCocina,
  esPinCocinaValido
};
