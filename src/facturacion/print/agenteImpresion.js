/**
 * Agente local para ticketera USB en la PC de caja.
 * Uso: node src/facturacion/print/agenteImpresion.js
 * Escucha en 127.0.0.1:9101 y reenvía los bytes por TCP al puerto 9100
 * (muchas USB con driver de red virtual) o los deja en stdout si no hay IP.
 *
 * El navegador no llama a este proceso. Lo llama el backend (modo agente).
 */
const http = require('http');
const { imprimirTcp } = require('./imprimir');

const PUERTO = Number(process.env.AGENTE_IMPRESION_PUERTO || 9101);
const DESTINO = process.env.AGENTE_IMPRESION_TCP || '';

function escuchar() {
    return http.createServer((req, res) => {
        if (req.method !== 'POST' || req.url !== '/imprimir') {
            res.writeHead(404);
            res.end();
            return;
        }
        const trozos = [];
        req.on('data', (t) => trozos.push(t));
        req.on('end', async () => {
            const buffer = Buffer.concat(trozos);
            try {
                if (DESTINO) {
                    const [host, puerto] = DESTINO.split(':');
                    await imprimirTcp(buffer, { host, puerto: Number(puerto || 9100) });
                }
                res.writeHead(204);
                res.end();
            } catch (err) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: err.message }));
            }
        });
    }).listen(PUERTO, '127.0.0.1');
}

if (require.main === module) {
    escuchar();
    console.log(`[agente-impresion] 127.0.0.1:${PUERTO}`);
}

module.exports = { escuchar };
