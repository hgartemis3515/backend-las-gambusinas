/**
 * Firma XMLDSig enveloped (RSA-SHA256, C14N exclusiva) sobre el UBL.
 * El DigestValue de esa firma es el hash del QR. No llama a SUNAT.
 * @module facturacion/services/firmaService
 */

const fs = require('fs');
const forge = require('node-forge');
const { SignedXml } = require('xml-crypto');
const { partesLima, correlativo } = require('./ublBuilder');

const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

/**
 * @param {string} ruta
 * @param {string} [password]
 * @returns {{ key: string, certPem: string, certB64: string }}
 */
function cargarCertificado(ruta = process.env.CERT_PATH, password = process.env.CERT_PASSWORD || '') {
    if (!ruta) throw new Error('CERT_PATH no está definido');
    const buf = fs.readFileSync(ruta);
    const texto = buf.toString('utf8');
    if (texto.includes('BEGIN')) {
        const key = texto.match(/-----BEGIN [\w\s]+PRIVATE KEY-----[\s\S]+?-----END [\w\s]+PRIVATE KEY-----/);
        const cert = texto.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
        if (!key || !cert) throw new Error('El PEM debe incluir clave privada y certificado');
        return { key: key[0], certPem: cert[0], certB64: cert[0].replace(/-----[^-]+-----/g, '').replace(/\s/g, '') };
    }
    const asn1 = forge.asn1.fromDer(buf.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
    const clave = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
    const cert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0]?.cert;
    if (!clave || !cert) throw new Error('El PFX no tiene clave privada o certificado');
    const certPem = forge.pki.certificateToPem(cert);
    return {
        key: forge.pki.privateKeyToPem(clave),
        certPem,
        certB64: certPem.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''),
    };
}

/**
 * @param {string} xml UBL sin firmar, con ExtensionContent vacío
 * @param {{ key: string, certPem: string }} cert
 * @returns {{ xml: string, hash: string }}
 */
function firmarXml(xml, cert = cargarCertificado()) {
    const sig = new SignedXml({
        privateKey: cert.key,
        publicCert: cert.certPem,
        canonicalizationAlgorithm: C14N,
        signatureAlgorithm: RSA_SHA256,
    });
    sig.addReference({
        xpath: '/*',
        digestAlgorithm: SHA256,
        transforms: [ENVELOPED, C14N],
        isEmptyUri: true,
    });
    sig.computeSignature(xml, {
        prefix: 'ds',
        location: { reference: "//*[local-name(.)='ExtensionContent']", action: 'append' },
    });
    const firmado = sig.getSignedXml();
    const hash = (firmado.match(/<(?:\w+:)?DigestValue>([^<]+)<\/(?:\w+:)?DigestValue>/) || [])[1];
    if (!hash) throw new Error('La firma no produjo DigestValue');
    return { xml: firmado, hash };
}

/**
 * QR SUNAT: RUC|TIPO|SERIE|NUMERO|IGV|TOTAL|FECHA|TIPODOC|NUMDOC|HASH|
 * @param {Object} comprobante
 * @param {string} hash
 */
function codigoQr(comprobante, hash) {
    const { fecha } = partesLima(comprobante.fechaEmision);
    const receptor = comprobante.receptor || {};
    const num = receptor.tipoDoc === '0' ? '-' : (receptor.numDoc || '-');
    return [
        comprobante.ruc,
        comprobante.tipo,
        comprobante.serie,
        correlativo(comprobante.numero),
        (Number(comprobante.totales.igv) || 0).toFixed(2),
        (Number(comprobante.totales.importeTotal) || 0).toFixed(2),
        fecha,
        receptor.tipoDoc === '0' ? '0' : receptor.tipoDoc,
        num,
        hash,
        '',
    ].join('|');
}

module.exports = { cargarCertificado, firmarXml, codigoQr };
