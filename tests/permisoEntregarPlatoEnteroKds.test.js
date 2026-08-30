const {
    PERMISOS_FUNDAMENTALES,
    PERMISOS_POR_ROL_SISTEMA
} = require('../src/database/models/roles.model');

describe('permiso entregar-plato-entero-kds', () => {
    test('está en App Cocina y activado en supervisor/admin (no cocinero)', () => {
        const p = PERMISOS_FUNDAMENTALES['entregar-plato-entero-kds'];
        expect(p).toBeDefined();
        expect(p.grupo).toBe('App Cocina');
        expect(p.nombre).toBe('Entregar plato entero');
        expect(PERMISOS_POR_ROL_SISTEMA.admin).toContain('entregar-plato-entero-kds');
        expect(PERMISOS_POR_ROL_SISTEMA.supervisor).toContain('entregar-plato-entero-kds');
        expect(PERMISOS_POR_ROL_SISTEMA.cocinero).not.toContain('entregar-plato-entero-kds');
        expect(PERMISOS_POR_ROL_SISTEMA.mozos).not.toContain('entregar-plato-entero-kds');
        expect(PERMISOS_POR_ROL_SISTEMA.cajero).toContain('entregar-plato-entero-kds');
    });

    test('cajero = supervisor + ver/ejecutar caja; supervisor no ve caja', () => {
        const cajaOnly = ['ver-cierre-caja', 'ejecutar-cierre-caja'];
        for (const p of PERMISOS_POR_ROL_SISTEMA.supervisor) {
            expect(PERMISOS_POR_ROL_SISTEMA.cajero).toContain(p);
        }
        for (const p of cajaOnly) {
            expect(PERMISOS_POR_ROL_SISTEMA.cajero).toContain(p);
            expect(PERMISOS_POR_ROL_SISTEMA.supervisor).not.toContain(p);
        }
    });
});

describe('notificarPermisosCocina', () => {
    const rolesRepository = require('../src/repository/roles.repository');

    test('no-op si no hay emitter', async () => {
        const prev = global.emitPermisosActualizados;
        delete global.emitPermisosActualizados;
        await expect(rolesRepository.notificarPermisosCocina('abc')).resolves.toBeUndefined();
        global.emitPermisosActualizados = prev;
    });
});
