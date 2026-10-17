/**
 * Baja el certificado demo de Greenter (RUC 20000000001) a certs/certificado_demo.pem
 * y deja las variables de SUNAT beta en .env.
 * Uso: npm run setup:cert:demo
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DESTINO = path.join(__dirname, '..', 'certs', 'certificado_demo.pem');
const ENV = path.join(__dirname, '..', '.env');
const URLS = [
    'https://raw.githubusercontent.com/thegreenter/firststeps/master/certificate.pem',
    'https://raw.githubusercontent.com/thegreenter/xmldsig/master/tests/certificate.pem',
];

function bajar(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                bajar(res.headers.location).then(resolve, reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`${url} respondió ${res.statusCode}`));
                return;
            }
            const trozos = [];
            res.on('data', (c) => trozos.push(c));
            res.on('end', () => resolve(Buffer.concat(trozos).toString('utf8')));
        }).on('error', reject);
    });
}

function escribirEnv(texto) {
    const claves = {
        SUNAT_AMBIENTE: 'beta',
        SUNAT_BILL_SERVICE_URL: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
        SUNAT_RUC: '20000000001',
        SUNAT_SOL_USUARIO: 'MODDATOS',
        SUNAT_SOL_CLAVE: 'moddatos',
        CERT_PATH: 'certs/certificado_demo.pem',
        CERT_PASSWORD: '',
        IGV_PORCENTAJE: '10.5',
    };
    let cuerpo = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
    for (const [clave, valor] of Object.entries(claves)) {
        const linea = `${clave}=${valor}`;
        const re = new RegExp(`^${clave}=.*$`, 'm');
        cuerpo = re.test(cuerpo) ? cuerpo.replace(re, linea) : `${cuerpo.trim()}\n${linea}\n`;
    }
    fs.writeFileSync(ENV, cuerpo.endsWith('\n') ? cuerpo : `${cuerpo}\n`);
}

async function main() {
    fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
    let pem = '';
    let origen = '';
    for (const url of URLS) {
        try {
            const texto = await bajar(url);
            if (texto.includes('BEGIN CERTIFICATE') && texto.includes('PRIVATE KEY')) {
                pem = texto;
                origen = url;
                break;
            }
        } catch (err) {
            console.error(err.message);
        }
    }
    if (!pem) {
        console.error('No se encontró el PEM demo de Greenter. No genero un certificado autofirmado: SUNAT beta lo rechaza.');
        process.exit(1);
    }
    fs.writeFileSync(DESTINO, pem);
    escribirEnv();
    console.log(`Certificado demo guardado en ${DESTINO}`);
    console.log(`Origen: ${origen}`);
    console.log('CERT_PATH=certs/certificado_demo.pem y SUNAT beta quedaron en .env');
}

main();
