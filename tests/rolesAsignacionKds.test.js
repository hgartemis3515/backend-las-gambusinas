const { rolesElegiblesAsignacionAutomaticaBase } = require('../src/utils/rolesAsignacionKds');

describe('rolesElegiblesAsignacionAutomaticaBase', () => {
    test('incluye cocineros y quien abre la tabla KDS de supervisores', () => {
        const roles = rolesElegiblesAsignacionAutomaticaBase();
        expect(roles).toEqual(expect.arrayContaining(['cocinero', 'supervisor', 'admin']));
        expect(roles).not.toContain('mozos');
        expect(roles).not.toContain('cajero');
    });
});
