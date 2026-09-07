'use strict';

const HEX3 = /^#([0-9a-fA-F]{3})$/;
const HEX6 = /^#([0-9a-fA-F]{6})$/;

/** Fondo histórico del recuadro KDS (vista); no es color de perfil de usuario. */
const COLOR_KDS_FONDO_DEFAULT = '#1e3a8a';
/** Sin color personalizado: el nombre se ve como antes de este feature. */
const COLOR_PERFIL_DEFAULT = '';

function expandirHexColor(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const h = raw.startsWith('#') ? raw : `#${raw}`;
  if (HEX6.test(h)) return h.toLowerCase();
  if (HEX3.test(h)) {
    const s = h.slice(1);
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`.toLowerCase();
  }
  return null;
}

function sanitizarColorPerfil(value, fallback = COLOR_PERFIL_DEFAULT) {
  return expandirHexColor(value) || fallback;
}

function sanitizarColorMozoForzado(value) {
  return sanitizarColorPerfil(value, COLOR_KDS_FONDO_DEFAULT);
}

module.exports = {
  COLOR_PERFIL_DEFAULT,
  COLOR_KDS_FONDO_DEFAULT,
  expandirHexColor,
  sanitizarColorPerfil,
  sanitizarColorMozoForzado,
};
