/**
 * Comandos ESC/POS mínimos (init, alineación, corte, gaveta).
 * El navegador no envía estos bytes: los manda el backend o el agente local.
 * @module facturacion/print/escpos
 */

const ESC = '\x1b';
const GS = '\x1d';

const CMD = Object.freeze({
    INIT: `${ESC}@`,
    CENTRO: `${ESC}a\x01`,
    IZQUIERDA: `${ESC}a\x00`,
    NEGRITA_ON: `${ESC}E\x01`,
    NEGRITA_OFF: `${ESC}E\x00`,
    /** Corte parcial. */
    CORTE: `${GS}V\x42\x00`,
    /** Pulso al cajón, pin 2. Solo en comprobante fiscal cobrado. */
    GAVETA: `${ESC}p\x00\x19\xfa`,
});

/**
 * @param {string[]} lineas
 * @param {{ gaveta?: boolean }} [opciones]
 * @returns {Buffer}
 */
function compilar(lineas, { gaveta = false } = {}) {
    const cuerpo = [CMD.INIT, ...lineas, '', '', CMD.CORTE];
    if (gaveta) cuerpo.push(CMD.GAVETA);
    return Buffer.from(cuerpo.join('\n'), 'latin1');
}

/** @param {string} texto @param {number} ancho */
function centrar(texto, ancho) {
    return `${CMD.CENTRO}${texto}${CMD.IZQUIERDA}`.length ? `${CMD.CENTRO}${texto}\n${CMD.IZQUIERDA}` : texto;
}

module.exports = { CMD, compilar, centrar };
