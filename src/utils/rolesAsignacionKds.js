/**
 * Quién puede figurar en auto-asignación KDS de platos.
 *
 * Misma regla que App Cocina (ComandaStyleSupervi / MenuPage):
 *   hasRole(['supervisor', 'admin']) || hasPermission('ver-vista-supervisor-cocina')
 * más todos los usuarios con rol `cocinero` (destinatarios habituales).
 */

const PERMISO_TABLA_KDS_SUPERVISOR = 'ver-vista-supervisor-cocina';

/** Roles de sistema con acceso a la tabla KDS de supervisores (sin Mongo). */
function rolesElegiblesAsignacionAutomaticaBase() {
    return ['cocinero', 'supervisor', 'admin'];
}

/**
 * Incluye roles personalizados activos con `ver-vista-supervisor-cocina`.
 * Los roles de sistema usan el mapa estático (igual que el login JWT).
 */
async function nombresRolesElegiblesAsignacionAutomatica() {
    const rolesModel = require('../database/models/roles.model');
    const { ROLES_SISTEMA, PERMISOS_POR_ROL_SISTEMA } = rolesModel;

    const porPermisoSistema = (ROLES_SISTEMA || []).filter((r) =>
        (PERMISOS_POR_ROL_SISTEMA[r] || []).includes(PERMISO_TABLA_KDS_SUPERVISOR)
    );

    const custom = await rolesModel.find({
        activo: true,
        esSistema: { $ne: true },
        permisos: PERMISO_TABLA_KDS_SUPERVISOR
    }).select('nombre').lean();

    return [...new Set([
        ...rolesElegiblesAsignacionAutomaticaBase(),
        ...porPermisoSistema,
        ...custom.map((r) => r.nombre).filter(Boolean)
    ])];
}

module.exports = {
    PERMISO_TABLA_KDS_SUPERVISOR,
    rolesElegiblesAsignacionAutomaticaBase,
    nombresRolesElegiblesAsignacionAutomatica
};
