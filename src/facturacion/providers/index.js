/**
 * Factory del proveedor fiscal según `FACTURACION_PROVEEDOR` (por defecto `mock`).
 * @module facturacion/providers
 */

const MockFiscalAdapter = require('./mockFiscal.adapter');
const SunatDirecto = require('./sunatDirecto');

const ADAPTADORES = {
    mock: () => new MockFiscalAdapter(),
    sunat: () => new SunatDirecto(),
};

/** @type {import('./ProveedorFiscal')|null} */
let instancia = null;

/** @returns {import('./ProveedorFiscal')} */
function obtenerProveedorFiscal() {
    if (instancia) return instancia;
    const nombre = (process.env.FACTURACION_PROVEEDOR || 'mock').toLowerCase();
    const crear = ADAPTADORES[nombre];
    if (!crear) throw new Error(`Proveedor fiscal desconocido: ${nombre}`);
    if (nombre === 'mock' && process.env.NODE_ENV === 'production') {
        throw new Error('El proveedor fiscal mock no puede usarse en producción');
    }
    instancia = crear();
    return instancia;
}

/** Solo para tests. @param {import('./ProveedorFiscal')|null} proveedor */
function establecerProveedorFiscal(proveedor) {
    instancia = proveedor;
}

module.exports = { obtenerProveedorFiscal, establecerProveedorFiscal };
