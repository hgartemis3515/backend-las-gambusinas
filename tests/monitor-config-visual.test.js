const { sanitizarConfigPerfilVerCocina, fusionarConfigPerfilVerCocina } = require('../src/utils/sanitizarPerfilVerCocina');

describe('configVisual por monitor (Personalizar desde monitor 1)', () => {
    test('sanitiza snapshot de Personalizar', () => {
        const out = sanitizarConfigPerfilVerCocina({
            layoutColumnas: 6,
            tamanioFuentePlato: 42,
            password: 'no',
        });
        expect(out.layoutColumnas).toBe(6);
        expect(out.tamanioFuentePlato).toBe(42);
        expect(out.password).toBeUndefined();
    });

    test('fusiona override con diseño previo', () => {
        const prev = sanitizarConfigPerfilVerCocina({ layoutColumnas: 2, colorFondo: '#111111' });
        const next = sanitizarConfigPerfilVerCocina({ layoutColumnas: 8 });
        const fused = fusionarConfigPerfilVerCocina(prev, next);
        expect(fused.layoutColumnas).toBe(8);
        expect(fused.colorFondo).toBe('#111111');
    });
});
