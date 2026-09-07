const {
    rolesElegiblesAsignacionAutomaticaBase,
    ROLES_EXCLUIDOS_ASIGNACION_KDS,
    esRolExcluidoAsignacionKds
} = require('../src/utils/rolesAsignacionKds');

describe('rolesElegiblesAsignacionAutomaticaBase', () => {
    test('incluye cocineros, supervisores y admin', () => {
        const roles = rolesElegiblesAsignacionAutomaticaBase();
        expect(roles).toEqual(expect.arrayContaining(['cocinero', 'supervisor', 'admin']));
        expect(roles).not.toContain('mozos');
        expect(roles).not.toContain('cajero');
    });
});

describe('ROLES_EXCLUIDOS_ASIGNACION_KDS', () => {
    test('excluye mozos, cajeros y capitan de mozos; no excluye admin', () => {
        expect(ROLES_EXCLUIDOS_ASIGNACION_KDS).toEqual(
            expect.arrayContaining(['mozos', 'cajero', 'capitanMozos'])
        );
        expect(esRolExcluidoAsignacionKds('admin')).toBe(false);
        expect(esRolExcluidoAsignacionKds('cocinero')).toBe(false);
        expect(esRolExcluidoAsignacionKds('cajero')).toBe(true);
        expect(esRolExcluidoAsignacionKds('mozos')).toBe(true);
    });
});
