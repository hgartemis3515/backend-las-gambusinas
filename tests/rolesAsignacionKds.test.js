const { rolesElegiblesAsignacionAutomaticaBase } = require('../src/utils/rolesAsignacionKds');

describe('rolesElegiblesAsignacionAutomaticaBase', () => {
    test('incluye cocineros, supervisores y admin (permiso asignacion-automatica-kds)', () => {
        const roles = rolesElegiblesAsignacionAutomaticaBase();
        expect(roles).toEqual(expect.arrayContaining(['cocinero', 'supervisor', 'admin']));
        expect(roles).not.toContain('mozos');
    });
});
