/**
 * Quién puede figurar en auto-asignación KDS de platos (platos.html / cocineros.html).
 * Todos los usuarios excepto roles de salón: mozos, cajeros y capitán de mozos.
 * El permiso `asignacion-automatica-kds` queda documentado en roles.html; no filtra el listado.
 */

const PERMISO_ASIGNACION_AUTOMATICA_KDS = 'asignacion-automatica-kds';

const ROLES_EXCLUIDOS_ASIGNACION_KDS = ['mozos', 'cajero', 'capitanMozos'];

/** Roles de sistema que siempre pueden asignarse (sin Mongo). */
function rolesElegiblesAsignacionAutomaticaBase() {
    return ['cocinero', 'supervisor', 'admin'];
}

function esRolExcluidoAsignacionKds(rol) {
    return ROLES_EXCLUIDOS_ASIGNACION_KDS.includes(String(rol || '').trim());
}

/**
 * Sistema + roles personalizados activos, menos salón (mozos / cajero / capitanMozos).
 */
async function nombresRolesElegiblesAsignacionAutomatica() {
    const rolesModel = require('../database/models/roles.model');
    const { ROLES_SISTEMA } = rolesModel;

    const custom = await rolesModel.find({
        activo: true,
        esSistema: { $ne: true }
    }).select('nombre').lean();

    return [...new Set([
        ...rolesElegiblesAsignacionAutomaticaBase(),
        ...(ROLES_SISTEMA || []),
        ...custom.map((r) => r.nombre).filter(Boolean)
    ])].filter((r) => !esRolExcluidoAsignacionKds(r));
}

module.exports = {
    PERMISO_ASIGNACION_AUTOMATICA_KDS,
    ROLES_EXCLUIDOS_ASIGNACION_KDS,
    esRolExcluidoAsignacionKds,
    rolesElegiblesAsignacionAutomaticaBase,
    nombresRolesElegiblesAsignacionAutomatica
};
