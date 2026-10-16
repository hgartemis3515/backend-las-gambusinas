/**
 * PIN de supervisor. El contador de fallos vive aquí, no en el navegador.
 * @module facturacion/services/autorizarSupervisor
 */

const mozosModel = require('../../database/models/mozos.model');

const fallos = new Map();
const TOPE = 5;
const BLOQUEO_MS = 5 * 60 * 1000;

class ErrorPin extends Error {
    constructor(mensaje, codigo, statusCode = 401) {
        super(mensaje);
        this.name = 'ErrorPin';
        this.codigo = codigo;
        this.statusCode = statusCode;
    }
}

/** @param {string} clave */
function estado(clave) {
    const actual = fallos.get(clave);
    if (actual && actual.hasta > Date.now()) return actual;
    if (actual) fallos.delete(clave);
    return null;
}

/**
 * @param {{ pin: string, accion: string, motivo?: string, cajeroId?: string }} datos
 */
async function autorizarSupervisor(datos) {
    const clave = String(datos.cajeroId || 'caja');
    const bloqueado = estado(clave);
    if (bloqueado) throw new ErrorPin('PIN bloqueado 5 minutos', 'PIN_BLOQUEADO', 429);
    const pin = String(datos.pin || '');
    if (!/^\d{6,}$/.test(pin)) throw new ErrorPin('El PIN tiene al menos 6 dígitos', 'PIN_INVALIDO', 422);

    const porEnv = process.env.FACTURACION_PIN_SUPERVISOR && pin === process.env.FACTURACION_PIN_SUPERVISOR;
    let supervisor = null;
    if (!porEnv) {
        supervisor = await mozosModel.findOne({ pinAcceso: pin, activo: { $ne: false } }).select('_id name rol').lean();
        const rol = String(supervisor?.rol || '').toLowerCase();
        if (!supervisor || !/admin|supervisor/.test(rol)) {
            const previo = fallos.get(clave) || { n: 0, hasta: 0 };
            const n = previo.n + 1;
            fallos.set(clave, { n, hasta: n >= TOPE ? Date.now() + BLOQUEO_MS : 0 });
            throw new ErrorPin(n >= TOPE ? 'PIN bloqueado 5 minutos' : 'PIN incorrecto', n >= TOPE ? 'PIN_BLOQUEADO' : 'PIN_INCORRECTO', n >= TOPE ? 429 : 401);
        }
    }
    fallos.delete(clave);
    return {
        ok: true,
        accion: datos.accion,
        motivo: datos.motivo || null,
        supervisorId: supervisor ? String(supervisor._id) : 'env',
    };
}

module.exports = { autorizarSupervisor, ErrorPin };
