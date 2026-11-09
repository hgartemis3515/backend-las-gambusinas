// HTTPS para la red local: el navegador solo permite micrófono/cámara en
// contextos seguros (HTTPS o localhost). Genera un certificado autofirmado
// una vez (data/certs) que cubre localhost y las IPs de esta PC.
const fs = require('fs');
const os = require('os');
const path = require('path');
const forge = require('node-forge');

const DIR = path.join(__dirname, '..', '..', 'data', 'certs');
const KEY = path.join(DIR, 'local-key.pem');
const CERT = path.join(DIR, 'local-cert.pem');

function ipsLocales() {
  const ips = new Set(['127.0.0.1']);
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista || []) {
      if (i.family === 'IPv4' || i.family === 4) ips.add(i.address);
    }
  }
  if (process.env.IP?.trim()) ips.add(process.env.IP.trim());
  return [...ips];
}

function generar(ips) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 825 * 24 * 3600 * 1000);
  const attrs = [{ name: 'commonName', value: 'Las Gambusinas Local' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        ...ips.map((ip) => ({ type: 7, ip })),
      ],
    },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(KEY, forge.pki.privateKeyToPem(keys.privateKey));
  fs.writeFileSync(CERT, forge.pki.certificateToPem(cert));
  fs.writeFileSync(path.join(DIR, 'ips.json'), JSON.stringify(ips.sort()));
}

function obtenerCredenciales() {
  // Certificado propio (p. ej. mkcert) si se define en .env
  if (process.env.HTTPS_KEY && process.env.HTTPS_CERT) {
    return { key: fs.readFileSync(process.env.HTTPS_KEY), cert: fs.readFileSync(process.env.HTTPS_CERT) };
  }
  const ips = ipsLocales().sort();
  let previas = [];
  try { previas = JSON.parse(fs.readFileSync(path.join(DIR, 'ips.json'), 'utf8')); } catch (_) {}
  const faltaIp = ips.some((ip) => !previas.includes(ip));
  if (!fs.existsSync(KEY) || !fs.existsSync(CERT) || faltaIp) {
    generar([...new Set([...previas, ...ips])]);
  }
  return { key: fs.readFileSync(KEY), cert: fs.readFileSync(CERT) };
}

module.exports = { obtenerCredenciales, ipsLocales };
