/**
 * Ticket térmico en bytes ESC/POS. La gaveta solo se abre si hubo efectivo.
 * @module facturacion/print/escposFormatter
 */

const ESC = 0x1b;
const GS = 0x1d;

const INIT = Buffer.from([ESC, 0x40]);
const CENTRO = Buffer.from([ESC, 0x61, 0x01]);
const IZQUIERDA = Buffer.from([ESC, 0x61, 0x00]);
const NEGRITA_ON = Buffer.from([ESC, 0x45, 0x01]);
const NEGRITA_OFF = Buffer.from([ESC, 0x45, 0x00]);
const DOBLE = Buffer.from([ESC, 0x21, 0x10]);
const NORMAL = Buffer.from([ESC, 0x21, 0x00]);
const CORTE = Buffer.from([GS, 0x56, 0x42, 0x00]);
const GAVETA = Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa]);

/** @param {string} data */
function comandoQr(data) {
    const store = Buffer.from(data, 'utf8');
    const largo = store.length + 3;
    return Buffer.concat([
        Buffer.from([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
        Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]),
        Buffer.from([GS, 0x28, 0x6b, largo & 0xff, (largo >> 8) & 0xff, 0x31, 0x50, 0x30]),
        store,
        Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),
    ]);
}

/** @param {string} texto */
const linea = (texto) => Buffer.from(`${texto}\n`, 'latin1');

/**
 * @param {{ precuenta?: boolean, montoEfectivo?: number, qr?: string, hash?: string, copia?: number, titulo?: string, lineas?: string[] }} ticket
 * @returns {Buffer}
 */
function formatearTicket(ticket) {
    const partes = [INIT, CENTRO, NEGRITA_ON];
    if (ticket.precuenta) {
        partes.push(DOBLE, linea('CONTROL INTERNO'), NORMAL, linea('NO VALIDO COMO COMPROBANTE'), NEGRITA_OFF);
    } else if (ticket.copia) {
        const n = String(ticket.copia).padStart(2, '0');
        partes.push(DOBLE, linea(`*** COPIA / REIMPRESION #${n} ***`), NORMAL);
    } else {
        partes.push(DOBLE, linea(ticket.titulo || 'COMPROBANTE'), NORMAL);
    }
    partes.push(NEGRITA_OFF, IZQUIERDA);
    for (const texto of ticket.lineas || []) partes.push(linea(texto));
    if (!ticket.precuenta && ticket.qr) {
        partes.push(CENTRO, comandoQr(ticket.qr), IZQUIERDA);
        if (ticket.hash) partes.push(linea(`HASH ${String(ticket.hash).slice(0, 28)}`));
    }
    partes.push(linea(''), CORTE);
    if (!ticket.precuenta && Number(ticket.montoEfectivo) > 0) partes.push(GAVETA);
    return Buffer.concat(partes);
}

module.exports = { formatearTicket, comandoQr, GAVETA, CORTE, INIT };
