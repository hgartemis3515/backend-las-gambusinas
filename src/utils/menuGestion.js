'use strict';

const MENU_GESTION_KEYS = [
  'dashboard',
  'mesas',
  'areas',
  'usuarios',
  'mozos',
  'cocineros',
  'roles',
  'tiposPlato',
  'platos',
  'comandas',
  'bouchers',
  'clientes',
  'auditoria',
  'cierre',
  'reportes',
  'config',
];

const MENU_GESTION_DEFAULT = {
  tituloPrincipal: 'Principal',
  tituloAvanzada: 'Avanzada',
  colorPrincipal: '#d4af37',
  colorAvanzada: '#a0a0b8',
  principal: ['dashboard', 'comandas', 'tiposPlato', 'platos', 'mesas', 'bouchers', 'cierre'],
  avanzada: ['areas', 'usuarios', 'mozos', 'cocineros', 'roles', 'clientes', 'auditoria', 'reportes', 'config'],
};

function tituloMenu(valor, fallback) {
  const s = String(valor == null ? '' : valor).trim().replace(/\s+/g, ' ');
  if (!s) return fallback;
  return s.slice(0, 40);
}

function colorMenu(valor, fallback) {
  const s = String(valor == null ? '' : valor).trim();
  if (/^#([0-9A-Fa-f]{6})$/.test(s)) return s.toLowerCase();
  return fallback;
}

function normalizarMenuGestion(raw) {
  const known = new Set(MENU_GESTION_KEYS);
  const seen = new Set();
  const take = (arr) => {
    const out = [];
    if (!Array.isArray(arr)) return out;
    for (const item of arr) {
      const key = typeof item === 'string' ? item.trim() : '';
      if (!known.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    return out;
  };

  const src = raw && typeof raw === 'object' ? raw : {};
  const sinListas = !Array.isArray(src.principal) && !Array.isArray(src.avanzada);
  const principal = take(sinListas ? MENU_GESTION_DEFAULT.principal : src.principal);
  const avanzada = take(sinListas ? MENU_GESTION_DEFAULT.avanzada : src.avanzada);
  for (const key of MENU_GESTION_KEYS) {
    if (!seen.has(key)) principal.push(key);
  }

  return {
    tituloPrincipal: tituloMenu(src.tituloPrincipal, MENU_GESTION_DEFAULT.tituloPrincipal),
    tituloAvanzada: tituloMenu(src.tituloAvanzada, MENU_GESTION_DEFAULT.tituloAvanzada),
    colorPrincipal: colorMenu(src.colorPrincipal, MENU_GESTION_DEFAULT.colorPrincipal),
    colorAvanzada: colorMenu(src.colorAvanzada, MENU_GESTION_DEFAULT.colorAvanzada),
    principal,
    avanzada,
  };
}

module.exports = {
  MENU_GESTION_KEYS,
  MENU_GESTION_DEFAULT,
  normalizarMenuGestion,
};
