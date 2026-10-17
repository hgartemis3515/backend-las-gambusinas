/**
 * Agente de caja. Sin hardware usa el último cobro en memoria (`POS_MODO=mock`).
 * USB: POS_MODO=usb y POS_COM=COM3. Wi-Fi: POS_MODO=wifi, POS_HOST y POS_PORT.
 * Arranque: node agente-pos/index.js
 */

const http = require('http');
const net = require('net');

let ultima = null;

function responder(res, codigo, cuerpo) {
    res.writeHead(codigo, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cuerpo));
}

async function leerCuerpo(req) {
    const trozos = [];
    for await (const t of req) trozos.push(t);
    return JSON.parse(Buffer.concat(trozos).toString() || '{}');
}

function cobrarMock(body) {
    if (process.env.POS_MOCK === 'rechazo') {
        ultima = { ...body, estado: 'rechazada', motivo: 'fondos insuficientes' };
        return ultima;
    }
    ultima = {
        ...body,
        estado: 'aprobada',
        authCode: '128491',
        numOperacion: '004821',
        ultimos4: '1234',
        marca: 'VISA',
    };
    return ultima;
}

function cobrarWifi(body) {
    return new Promise((resolve, reject) => {
        const socket = net.connect(Number(process.env.POS_PORT || 5000), process.env.POS_HOST, () => {
            socket.write(JSON.stringify(body));
        });
        let buf = '';
        socket.on('data', (d) => { buf += d; });
        socket.on('end', () => {
            ultima = JSON.parse(buf);
            resolve(ultima);
        });
        socket.setTimeout(90000, () => {
            socket.destroy();
            reject(new Error('Timeout del POS'));
        });
        socket.on('error', reject);
    });
}

async function cobrar(body) {
    if (process.env.POS_MODO === 'wifi') return cobrarWifi(body);
    if (process.env.POS_MODO === 'usb') {
        throw new Error('El modo USB requiere el paquete serialport y un puerto COM. Use POS_MODO=mock para pruebas.');
    }
    return cobrarMock(body);
}

function consultar(body) {
    if (!ultima) return { estado: 'sin_operacion' };
    const mismoMonto = Number(ultima.monto) === Number(body.monto);
    const mismaRef = ultima.referenciaInterna === body.referenciaInterna;
    if (!mismoMonto || !mismaRef) return { estado: 'sin_operacion', motivo: 'el último cobro es de otra operación' };
    return ultima;
}

function crearServidor() {
    return http.createServer(async (req, res) => {
        try {
            if (req.method === 'POST' && req.url === '/pos/transaccion') {
                return responder(res, 200, await cobrar(await leerCuerpo(req)));
            }
            if (req.method === 'POST' && req.url === '/pos/query-status') {
                return responder(res, 200, consultar(await leerCuerpo(req)));
            }
            return responder(res, 404, { message: 'Ruta no encontrada' });
        } catch (err) {
            return responder(res, 502, { estado: 'error', message: err.message });
        }
    });
}

if (require.main === module) {
    const puerto = Number(process.env.POS_AGENTE_PUERTO || 4040);
    crearServidor().listen(puerto, '127.0.0.1', () => {
        console.log(`[agente-pos] http://127.0.0.1:${puerto} modo ${process.env.POS_MODO || 'mock'}`);
    });
}

module.exports = { crearServidor, cobrarMock, consultar };
