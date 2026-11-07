const { normalizarMenuGestion, MENU_GESTION_DEFAULT, MENU_GESTION_KEYS } = require('../src/utils/menuGestion');

describe('normalizarMenuGestion', () => {
  test('usa defaults y cubre todas las claves', () => {
    const n = normalizarMenuGestion(null);
    expect(n.tituloPrincipal).toBe('Principal');
    expect(n.tituloAvanzada).toBe('Avanzada');
    expect([...n.principal, ...n.avanzada].sort()).toEqual([...MENU_GESTION_KEYS].sort());
    expect(n.principal).toEqual(MENU_GESTION_DEFAULT.principal);
    expect(n.avanzada).toEqual(MENU_GESTION_DEFAULT.avanzada);
  });

  test('respeta orden custom y descarta claves inválidas o duplicadas', () => {
    const n = normalizarMenuGestion({
      tituloPrincipal: '  Día a día  ',
      tituloAvanzada: 'Más',
      principal: ['comandas', 'tiposPlato', 'comandas', 'no-existe'],
      avanzada: ['config', 'dashboard'],
    });
    expect(n.tituloPrincipal).toBe('Día a día');
    expect(n.avanzada[0]).toBe('config');
    expect(n.principal.filter((k) => k === 'comandas')).toHaveLength(1);
    expect(n.principal.includes('dashboard')).toBe(false);
    expect([...n.principal, ...n.avanzada].sort()).toEqual([...MENU_GESTION_KEYS].sort());
  });

  test('recorta títulos largos', () => {
    const n = normalizarMenuGestion({ tituloPrincipal: 'x'.repeat(80) });
    expect(n.tituloPrincipal).toHaveLength(40);
  });

  test('acepta colores hex y descarta inválidos', () => {
    const ok = normalizarMenuGestion({ colorPrincipal: '#4C1D95', colorAvanzada: '#eee' });
    expect(ok.colorPrincipal).toBe('#4c1d95');
    expect(ok.colorAvanzada).toBe(MENU_GESTION_DEFAULT.colorAvanzada);
  });

  test('guarda el fondo de cada cuadro y descarta colores inválidos', () => {
    const n = normalizarMenuGestion({
      fondos: { comandas: '#112233', mesas: 'rojo', noExiste: '#abcdef' },
    });
    expect(n.fondos.comandas).toBe('#112233');
    expect(n.fondos.mesas).toBeUndefined();
    expect(n.fondos.noExiste).toBeUndefined();
  });

  test('una clave que falta entra en la columna del default', () => {
    const n = normalizarMenuGestion({
      principal: MENU_GESTION_DEFAULT.principal.filter((k) => k !== 'noticias'),
      avanzada: MENU_GESTION_DEFAULT.avanzada.filter((k) => k !== 'inventario'),
    });
    expect(n.principal).toContain('noticias');
    expect(n.principal).not.toContain('inventario');
    expect(n.avanzada).toContain('inventario');
    expect(n.avanzada).not.toContain('noticias');
  });

  test('deja inventario en la columna donde se movió', () => {
    const n = normalizarMenuGestion({
      principal: ['inventario'].concat(MENU_GESTION_DEFAULT.principal),
      avanzada: MENU_GESTION_DEFAULT.avanzada.filter((k) => k !== 'inventario')
    });
    expect(n.principal[0]).toBe('inventario');
    expect(n.principal.filter((k) => k === 'inventario')).toHaveLength(1);
    expect(n.avanzada).not.toContain('inventario');
  });
});
