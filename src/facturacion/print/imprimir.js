/**
 * Bridge de impresión. El navegador no habla ESC/POS.
 * - tcp: socket al puerto 9100 de una ticketera Ethernet/Wi-Fi.
 * - agente: POST al mini servicio de la PC de caja (USB).
 * @module facturacion/print/imprimir
 */

const net = require('net');

/**
 * @param {string} [valor]  "tcp://192.168.1.50:9100" o "agente://127.0.0.1:9101"
 * @returns {{ modo: 'tcp'|'agente', host: string, puerto: number }|null}
 */
function destinoDesdeEnv(valor = process.env.FACTURACION_IMPRESORA) {
    if (!valor) return null;
    const coincidencia = /^(tcp|agente):\/\/([^:]+):(\d+)$/.exec(valor);
    if (!coincidencia) throw new Error('FACTURACION_IMPRESORA debe ser tcp://IP:9100 o agente://127.0.0.1:9101');
    return { modo: coincidencia[1], host: coincidencia[2], puerto: Number(coincidencia[3]) };
}

/**
 * @param {Buffer} buffer
 * @param {{ host: string, puerto?: number, timeoutMs?: number }} destino
 */
function imprimirTcp(buffer, { host, puerto = 9100, timeoutMs = 3000 }) {
    return new Promise((resolve, reject) => {
        const socket = net.connect({ host, port: puerto });
        const fallo = (err) => { socket.destroy(); reject(err); };
        socket.setTimeout(timeoutMs);
        socket.on('timeout', () => fallo(Object.assign(new Error(`La ticketera ${host}:${puerto} no respondió`), { codigo: 'IMPRESORA_TIMEOUT' })));
        socket.on('error', fallo);
        socket.on('connect', () => {
            socket.end(buffer, () => resolve({ modo: 'tcp', host, puerto }));
        });
    });
}

/**
 * @param {Buffer} buffer
 * @param {{ modo: 'tcp'|'agente', host: string, puerto: number }} destino
 * @param {{ fetch?: typeof fetch }} [deps]
 */
async function imprimir(buffer, destino, deps = {}) {
    if (!destino) throw Object.assign(new Error('No hay ticketera configurada'), { codigo: 'SIN_IMPRESORA', statusCode: 422 });
    if (destino.modo === 'tcp') return imprimirTcp(buffer, destino);
    if (destino.modo === 'agente') {
        const fetchFn = deps.fetch || fetch;
        const res = await fetchFn(`http://${destino.host}:${destino.puerto}/imprimir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: buffer,
        });
        if (!res.ok) throw Object.assign(new Error('El agente de impresión rechazó el ticket'), { codigo: 'AGENTE_IMPRESION', statusCode: 502 });
        return { modo: 'agente', host: destino.host, puerto: destino.puerto };
    }
    throw Object.assign(new Error(`Modo de impresión desconocido: ${destino.modo}`), { codigo: 'MODO_IMPRESION', statusCode: 422 });
}

module.exports = { destinoDesdeEnv, imprimirTcp, imprimir };
