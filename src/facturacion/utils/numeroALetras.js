/**
 * Convierte importes a texto para la leyenda 1000 (Catálogo 52).
 * @module facturacion/utils/numeroALetras
 */

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const ESPECIALES = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

/** @param {number} n 0..999 @returns {string} */
function centenas(n) {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    const c = Math.floor(n / 100);
    const resto = n % 100;
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    let texto = CENTENAS[c];
    let dec;
    if (resto === 0) dec = '';
    else if (resto < 10) dec = UNIDADES[u];
    else if (resto < 20) dec = ESPECIALES[resto - 10];
    else if (d === 2 && u > 0) dec = `VEINTI${UNIDADES[u]}`;
    else dec = DECENAS[d] + (u > 0 ? ` Y ${UNIDADES[u]}` : '');
    return [texto, dec].filter(Boolean).join(' ');
}

/** @param {number} n entero >= 0 @returns {string} */
function enteroALetras(n) {
    if (n === 0) return 'CERO';
    const millones = Math.floor(n / 1e6);
    const miles = Math.floor((n % 1e6) / 1000);
    const resto = n % 1000;
    const partes = [];
    if (millones > 0) partes.push(millones === 1 ? 'UN MILLON' : `${centenas(millones).replace(/UNO$/, 'UN')} MILLONES`);
    if (miles > 0) partes.push(miles === 1 ? 'MIL' : `${centenas(miles).replace(/UNO$/, 'UN')} MIL`);
    if (resto > 0) partes.push(centenas(resto));
    return partes.join(' ');
}

/**
 * @param {number} centimos
 * @param {string} [moneda='SOLES']
 * @returns {string} p.ej. "CIENTO VEINTITRES CON 45/100 SOLES"
 */
function numeroALetras(centimos, moneda = 'SOLES') {
    const entero = Math.floor(Math.abs(centimos) / 100);
    const cent = String(Math.abs(centimos) % 100).padStart(2, '0');
    return `${enteroALetras(entero)} CON ${cent}/100 ${moneda}`;
}

module.exports = { numeroALetras };
