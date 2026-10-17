/**
 * ZIP de un solo XML en la raíz, compatible con el Java de SUNAT.
 * @module facturacion/providers/zipSunat
 */

const AdmZip = require('adm-zip');

/** @param {string} nombre nombre de archivo, sin carpetas */
function nombreEnRaiz(nombre) {
    const limpio = String(nombre).replace(/\\/g, '/').split('/').pop();
    if (!limpio || limpio.includes('..')) throw new Error('Nombre de archivo ZIP inválido');
    return limpio;
}

/** @param {string} nombre @param {string|Buffer} contenido @returns {Buffer} */
function comprimir(nombre, contenido) {
    const zip = new AdmZip();
    const data = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');
    zip.addFile(nombreEnRaiz(nombre), data);
    return zip.toBuffer();
}

/** @param {Buffer} buffer @returns {{ nombre: string, contenido: Buffer }} */
function descomprimir(buffer) {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntries().find((item) => !item.isDirectory);
    if (!entry) throw new Error('ZIP de SUNAT vacío');
    return { nombre: entry.entryName, contenido: entry.getData() };
}

module.exports = { comprimir, descomprimir, nombreEnRaiz };
