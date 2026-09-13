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
});
