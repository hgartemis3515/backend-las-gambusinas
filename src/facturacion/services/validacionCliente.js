/**
 * Validación del receptor del comprobante (Catálogo 06).
 * @module facturacion/services/validacionCliente
 */

const { TIPO_DOCUMENTO, TIPO_DOC_IDENTIDAD } = require('../constants/catalogosSunat');
const { aCentimos } = require('../utils/dinero');

const LIMITE_BOLETA_ANONIMA_DEFECTO = 700;
const PESOS_RUC = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const PREFIJOS_RUC = ['10', '15', '16', '17', '20'];

class ErrorCliente extends Error {
    /** @param {string} mensaje @param {string} codigo */
    constructor(mensaje, codigo) {
        super(mensaje);
        this.name = 'ErrorCliente';
        this.codigo = codigo;
        this.statusCode = 422;
    }
}

/**
 * RUC: 11 dígitos, prefijo válido y dígito verificador módulo 11.
 * @param {string} ruc
 * @returns {boolean}
 */
function esRucValido(ruc) {
    if (!/^\d{11}$/.test(ruc || '')) return false;
    if (!PREFIJOS_RUC.includes(ruc.slice(0, 2))) return false;
    const suma = PESOS_RUC.reduce((acc, peso, i) => acc + peso * Number(ruc[i]), 0);
    const dv = (11 - (suma % 11)) % 10;
    return dv === Number(ruc[10]);
}

/** @param {string} dni @returns {boolean} */
const esDniValido = (dni) => /^\d{8}$/.test(dni || '');

/**
 * @typedef {Object} ClienteEntrada
 * @property {string} [tipoDoc]   Catálogo 06
 * @property {string} [numDoc]
 * @property {string} [nombre]
 * @property {string} [direccion]
 * @property {string} [email]
 * @property {string} [celular]
 */

/**
 * Valida y normaliza el receptor.
 * - Factura: RUC válido (módulo 11), razón social y dirección fiscal.
 * - Boleta: anónima permitida hasta el límite; por encima exige DNI/CE/pasaporte.
 * @param {string} tipoComprobante
 * @param {ClienteEntrada|null|undefined} cliente
 * @param {number|string} importeTotal Soles
 * @param {{limiteBoletaAnonima?: number}} [config]
 * @returns {Object} receptor normalizado
 */
function validarCliente(tipoComprobante, cliente, importeTotal, config = {}) {
    const c = cliente || {};
    const numDoc = String(c.numDoc || '').trim();
    const nombre = String(c.nombre || '').trim();
    const extra = {
        direccion: String(c.direccion || '').trim(),
        email: c.email || null,
        celular: c.celular || null,
    };

    if (tipoComprobante === TIPO_DOCUMENTO.FACTURA) {
        if (c.tipoDoc && c.tipoDoc !== TIPO_DOC_IDENTIDAD.RUC) throw new ErrorCliente('La factura requiere RUC', 'FACTURA_REQUIERE_RUC');
        if (!esRucValido(numDoc)) throw new ErrorCliente('RUC inválido (11 dígitos y dígito verificador)', 'RUC_INVALIDO');
        if (!nombre) throw new ErrorCliente('La factura requiere razón social', 'RAZON_SOCIAL_REQUERIDA');
        if (!extra.direccion) throw new ErrorCliente('La factura requiere dirección fiscal', 'DIRECCION_REQUERIDA');
        return { tipoDoc: TIPO_DOC_IDENTIDAD.RUC, numDoc, nombre, ...extra, validacionPadron: c.validacionPadron || 'pendiente' };
    }

    if (tipoComprobante !== TIPO_DOCUMENTO.BOLETA) {
        throw new ErrorCliente(`Tipo de comprobante no soportado para validación: ${tipoComprobante}`, 'TIPO_INVALIDO');
    }

    const limite = aCentimos(config.limiteBoletaAnonima ?? LIMITE_BOLETA_ANONIMA_DEFECTO);
    const anonimo = !numDoc || c.tipoDoc === TIPO_DOC_IDENTIDAD.SIN_DOCUMENTO;

    if (anonimo) {
        if (aCentimos(importeTotal) > limite) {
            throw new ErrorCliente(`Boletas mayores a S/ ${limite / 100} requieren documento de identidad`, 'BOLETA_REQUIERE_DOCUMENTO');
        }
        return { tipoDoc: TIPO_DOC_IDENTIDAD.SIN_DOCUMENTO, numDoc: '-', nombre: nombre || 'CLIENTES VARIOS', ...extra, validacionPadron: 'no_aplica' };
    }

    const tipoDoc = c.tipoDoc || TIPO_DOC_IDENTIDAD.DNI;
    if (tipoDoc === TIPO_DOC_IDENTIDAD.DNI && !esDniValido(numDoc)) throw new ErrorCliente('DNI inválido (8 dígitos)', 'DNI_INVALIDO');
    if (tipoDoc === TIPO_DOC_IDENTIDAD.RUC && !esRucValido(numDoc)) throw new ErrorCliente('RUC inválido', 'RUC_INVALIDO');
    if ([TIPO_DOC_IDENTIDAD.CARNET_EXTRANJERIA, TIPO_DOC_IDENTIDAD.PASAPORTE].includes(tipoDoc) && !/^[A-Z0-9]{4,12}$/i.test(numDoc)) {
        throw new ErrorCliente('Documento de identidad inválido', 'DOCUMENTO_INVALIDO');
    }
    if (!Object.values(TIPO_DOC_IDENTIDAD).includes(tipoDoc)) throw new ErrorCliente(`Tipo de documento no soportado: ${tipoDoc}`, 'DOCUMENTO_INVALIDO');
    if (!nombre) throw new ErrorCliente('Nombre del cliente requerido cuando se identifica', 'NOMBRE_REQUERIDO');
    const padron = c.validacionPadron === 'ok' || c.validacionPadron === 'pendiente' ? c.validacionPadron : 'no_aplica';
    return { tipoDoc, numDoc: numDoc.toUpperCase(), nombre, ...extra, validacionPadron: padron };
}

module.exports = { validarCliente, esRucValido, esDniValido, ErrorCliente, LIMITE_BOLETA_ANONIMA_DEFECTO };
