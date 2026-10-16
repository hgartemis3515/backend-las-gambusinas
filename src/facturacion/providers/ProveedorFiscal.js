/**
 * Interfaz base de proveedores fiscales (OSE/PSE o SUNAT SEE directo).
 * Cada adaptador debe extender esta clase e implementar todos los métodos.
 * @module facturacion/providers/ProveedorFiscal
 */

/**
 * @typedef {Object} RespuestaCdr
 * @property {boolean} aceptado
 * @property {string} codigo             '0' aceptado; 2000–3999 rechazo; 4000+ observación
 * @property {string} descripcion
 * @property {string[]} observaciones
 * @property {string|null} hash          DigestValue (base64)
 * @property {string|null} xmlNombre
 * @property {string|null} xmlBase64     ZIP del XML firmado
 * @property {string|null} cdrBase64     ZIP del CDR
 */

/**
 * @typedef {Object} RespuestaTicket
 * @property {string} ticket
 */

class ProveedorFiscal {
    /** @param {Object} [opciones] */
    constructor(opciones = {}) {
        if (new.target === ProveedorFiscal) {
            throw new TypeError('ProveedorFiscal es abstracta; use un adaptador concreto');
        }
        this.opciones = opciones;
    }

    /** @returns {string} identificador del proveedor */
    get nombre() {
        throw new Error('Adaptador debe definir `nombre`');
    }

    /**
     * Genera XML UBL, firma y envía un comprobante individual (01, 07, 03 si se envía individual).
     * @param {Object} comprobante Documento `Comprobante` serializado
     * @returns {Promise<RespuestaCdr>}
     */
    // eslint-disable-next-line no-unused-vars
    async emitir(comprobante) {
        throw new Error(`${this.constructor.name}.emitir() no implementado`);
    }

    /**
     * Envía el Resumen Diario de boletas (RC).
     * @param {Object} resumen
     * @returns {Promise<RespuestaTicket>}
     */
    // eslint-disable-next-line no-unused-vars
    async enviarResumen(resumen) {
        throw new Error(`${this.constructor.name}.enviarResumen() no implementado`);
    }

    /**
     * Consulta el estado de un ticket asíncrono (resumen o baja).
     * @param {string} ticket
     * @returns {Promise<RespuestaCdr>}
     */
    // eslint-disable-next-line no-unused-vars
    async consultarTicket(ticket) {
        throw new Error(`${this.constructor.name}.consultarTicket() no implementado`);
    }

    /**
     * Envía la Comunicación de Baja (RA).
     * @param {Object} baja
     * @returns {Promise<RespuestaTicket>}
     */
    // eslint-disable-next-line no-unused-vars
    async comunicarBaja(baja) {
        throw new Error(`${this.constructor.name}.comunicarBaja() no implementado`);
    }

    /**
     * Consulta el estado/CDR de un comprobante ya enviado.
     * @param {{ruc: string, tipo: string, serie: string, numero: string}} identificador
     * @returns {Promise<RespuestaCdr>}
     */
    // eslint-disable-next-line no-unused-vars
    async consultarEstado(identificador) {
        throw new Error(`${this.constructor.name}.consultarEstado() no implementado`);
    }
}

module.exports = ProveedorFiscal;
