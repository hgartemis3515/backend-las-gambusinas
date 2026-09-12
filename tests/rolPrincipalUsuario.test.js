const {
    rolPrincipalDeSeleccion,
    debePromoverACocinero,
    prioridadRol,
} = require('../src/utils/rolPrincipalUsuario');

describe('rolPrincipalDeSeleccion', () => {
    test('cocinero + supervisor guarda supervisor (no el primero del array)', () => {
        expect(rolPrincipalDeSeleccion(['cocinero', 'supervisor'])).toBe('supervisor');
        expect(rolPrincipalDeSeleccion(['supervisor', 'cocinero'])).toBe('supervisor');
    });

    test('rol custom (martha) gana a cocinero', () => {
        expect(rolPrincipalDeSeleccion(['cocinero', 'martha'])).toBe('martha');
    });

    test('supervisor gana al rol custom', () => {
        expect(rolPrincipalDeSeleccion(['martha', 'supervisor'])).toBe('supervisor');
    });

    test('sin selección usa fallback', () => {
        expect(rolPrincipalDeSeleccion([])).toBe('mozos');
        expect(rolPrincipalDeSeleccion(null, 'cocinero')).toBe('cocinero');
    });
});

describe('debePromoverACocinero', () => {
    test('solo mozos / vacío', () => {
        expect(debePromoverACocinero('mozos')).toBe(true);
        expect(debePromoverACocinero('')).toBe(true);
        expect(debePromoverACocinero(null)).toBe(true);
    });

    test('no degrada supervisor, admin, custom ni cocinero', () => {
        expect(debePromoverACocinero('supervisor')).toBe(false);
        expect(debePromoverACocinero('admin')).toBe(false);
        expect(debePromoverACocinero('martha')).toBe(false);
        expect(debePromoverACocinero('cocinero')).toBe(false);
        expect(debePromoverACocinero('cajero')).toBe(false);
    });
});

describe('prioridadRol', () => {
    test('admin > supervisor > custom > cocinero', () => {
        expect(prioridadRol('admin')).toBeGreaterThan(prioridadRol('supervisor'));
        expect(prioridadRol('supervisor')).toBeGreaterThan(prioridadRol('martha'));
        expect(prioridadRol('martha')).toBeGreaterThan(prioridadRol('cocinero'));
    });
});
