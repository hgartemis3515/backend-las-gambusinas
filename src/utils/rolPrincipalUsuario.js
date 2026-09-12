/**
 * Un usuario solo persiste un `rol` (string). usuarios.html permite marcar varios;
 * hay que elegir el de mayor rango, no el primero del array (cocinero+supervisor
 * quedaba como cocinero y la app de cocina perdía Vista Supervisor).
 */

const PRIORIDAD_ROL = {
    admin: 100,
    supervisor: 90,
    cajero: 85,
    capitanmozos: 50,
    cocinero: 40,
    mozos: 10,
};

/** Roles custom (p. ej. "martha") por encima de cocinero, debajo de supervisor. */
const PRIORIDAD_CUSTOM = 70;

function prioridadRol(rol) {
    const key = String(rol || '').trim().toLowerCase();
    if (!key) return 0;
    if (Object.prototype.hasOwnProperty.call(PRIORIDAD_ROL, key)) return PRIORIDAD_ROL[key];
    return PRIORIDAD_CUSTOM;
}

function rolPrincipalDeSeleccion(roles, fallback = 'mozos') {
    const list = (Array.isArray(roles) ? roles : [roles])
        .map((r) => String(r || '').trim())
        .filter(Boolean);
    if (!list.length) return fallback;
    return [...list].sort((a, b) => prioridadRol(b) - prioridadRol(a))[0];
}

/** Solo mozos (o vacío) se pueden promover a cocinero al asignar KDS. */
function debePromoverACocinero(rolActual) {
    const r = String(rolActual || '').trim().toLowerCase();
    return !r || r === 'mozos';
}

module.exports = {
    PRIORIDAD_ROL,
    PRIORIDAD_CUSTOM,
    prioridadRol,
    rolPrincipalDeSeleccion,
    debePromoverACocinero,
};
