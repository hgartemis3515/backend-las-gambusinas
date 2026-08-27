/**
 * Quién puede figurar en auto-asignación KDS de platos.
 * Permiso `asignacion-automatica-kds` (roles.html). Cocineros lo tienen por defecto.
 */

const PERMISO_ASIGNACION_AUTOMATICA_KDS = 'asignacion-automatica-kds';

/** Roles de sistema con el permiso (sin Mongo). Admin tiene todos. */
function rolesElegiblesAsignacionAutomaticaBase() {
    return ['cocinero', 'supervisor', 'admin'];
}

/**
 * Sistema: mapa estático (igual que el login JWT).
 * Personalizados: roles activos con `asignacion-automatica-kds`.
 */
async function nombresRolesElegiblesAsignacionAutomatica() {
    const rolesModel = require('../database/models/roles.model');
    const { ROLES_SISTEMA, PERMISOS_POR_ROL_SISTEMA } = rolesModel;

    const porPermisoSistema = (ROLES_SISTEMA || []).filter((r) =>
        (PERMISOS_POR_ROL_SISTEMA[r] || []).includes(PERMISO_ASIGNACION_AUTOMATICA_KDS)
    );

    const custom = await rolesModel.find({
        activo: true,
        esSistema: { $ne: true },
        permisos: PERMISO_ASIGNACION_AUTOMATICA_KDS
    }).select('nombre').lean();

    return [...new Set([
        'cocinero',
        ...porPermisoSistema,
        ...custom.map((r) => r.nombre).filter(Boolean)
    ])];
}

module.exports = {
    PERMISO_ASIGNACION_AUTOMATICA_KDS,
    rolesElegiblesAsignacionAutomaticaBase,
    nombresRolesElegiblesAsignacionAutomatica
};
