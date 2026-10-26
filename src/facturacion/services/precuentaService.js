/**
 * Pre-cuenta / estado de cuenta. No es un comprobante: no reserva serie,
 * no calcula hash y no se envía a SUNAT.
 * @module facturacion/services/precuenta
 */

const { compilar, CMD } = require('../print/escpos');

const TITULO = 'CONTROL INTERNO - NO VALIDO COMO COMPROBANTE';

class ErrorPreCuenta extends Error {
    /** @param {string} mensaje */
    constructor(mensaje) {
        super(mensaje);
        this.name = 'ErrorPreCuenta';
        this.codigo = 'PRECUENTA';
        this.statusCode = 422;
    }
}

/**
 * @param {Object} cuenta
 * @param {string} [cuenta.mesa]
 * @param {string} [cuenta.mozo]
 * @param {string} [cuenta.emisor]
 * @param {{ cantidad: number, descripcion: string, importe: number }[]} cuenta.items
 * @returns {{ titulo: string, texto: string, buffer: Buffer, fiscal: false }}
 */
function construirPreCuenta(cuenta) {
    const items = cuenta?.items || [];
    if (items.length === 0) throw new ErrorPreCuenta('La pre-cuenta necesita el consumo de la mesa');
    const lineas = [
        CMD.CENTRO + CMD.NEGRITA_ON + (cuenta.emisor || 'Las Gambusinas'),
    ];
    if (cuenta.ruc) lineas.push(`RUC ${cuenta.ruc}`);
    if (cuenta.direccion) lineas.push(String(cuenta.direccion));
    if (cuenta.telefono) lineas.push(`Tel. ${cuenta.telefono}`);
    lineas.push(
        TITULO,
        'PRE-CUENTA / ESTADO DE CUENTA',
        CMD.NEGRITA_OFF + CMD.IZQUIERDA,
        `Mesa: ${cuenta.mesa ?? '-'}    Mozo: ${cuenta.mozo ?? '-'}`,
        `Fecha: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`,
        '--------------------------------',
    );
    let totalCent = 0;
    for (const item of items) {
        const importe = Number(item.importe);
        if (!item.descripcion || !Number.isFinite(importe) || importe < 0) throw new ErrorPreCuenta('Ítem de pre-cuenta inválido');
        totalCent += Math.round(importe * 100);
        lineas.push(`${item.cantidad} ${item.descripcion}`);
        lineas.push(`  S/ ${importe.toFixed(2)}`);
    }
    lineas.push('--------------------------------');
    lineas.push(CMD.NEGRITA_ON + `TOTAL  S/ ${(totalCent / 100).toFixed(2)}` + CMD.NEGRITA_OFF);
    lineas.push('Documento no tributario.');
    lineas.push('El comprobante se emite al cobrar.');
    const buffer = compilar(lineas, { gaveta: false });
    return { titulo: TITULO, texto: buffer.toString('latin1'), buffer, fiscal: false };
}

module.exports = { construirPreCuenta, TITULO, ErrorPreCuenta };
