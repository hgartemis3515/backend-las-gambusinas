const fs = require('fs');
const os = require('os');
const path = require('path');
const forge = require('node-forge');
const { construir, nombreArchivo } = require('../../src/facturacion/services/ublBuilder');
const { firmarXml, codigoQr } = require('../../src/facturacion/services/firmaService');
const { comprimir, descomprimir } = require('../../src/facturacion/providers/zipSunat');
const { envelope, leerCdr } = require('../../src/facturacion/providers/sunatDirecto');

const doc = {
    ruc: '20000000001',
    tipo: '03',
    serie: 'B001',
    numero: '00000001',
    fechaEmision: new Date('2026-10-15T19:00:00Z'),
    tipoOperacion: '0101',
    moneda: 'PEN',
    porcentajeIgv: 10.5,
    emisor: { ruc: '20000000001', razonSocial: 'EMPRESA DEMO', nombreComercial: 'DEMO', direccion: 'Lima', ubigeo: '150101', codigoEstablecimiento: '0000' },
    receptor: { tipoDoc: '0', numDoc: '-', nombre: 'CLIENTES VARIOS', direccion: '' },
    items: [{
        orden: 1, codigo: 'CEV', descripcion: 'Ceviche', unidad: 'NIU', cantidad: 1,
        tipoAfectacionIgv: '10', gratuita: false, valorUnitario: 90.5, precioUnitario: 100,
        valorReferencialUnitario: null, porcentajeIgv: 10.5, baseImponible: 90.5, igv: 9.5,
        valorVenta: 90.5, precioTotal: 100,
    }],
    totales: { gravadas: 90.5, exoneradas: 0, inafectas: 0, gratuitas: 0, igvGratuitas: 0, igv: 9.5, valorVenta: 90.5, importeTotal: 100 },
    leyendas: [{ codigo: '1000', valor: 'SON CIEN CON 00/100 SOLES' }],
    formaPago: { tipo: 'Contado' },
    mediosPago: [{ medio: 'efectivo', codigoSunat: '001', monto: 100 }],
};

function pemDePrueba() {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    const attrs = [{ name: 'commonName', value: 'Demo' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    return forge.pki.privateKeyToPem(keys.privateKey) + forge.pki.certificateToPem(cert);
}

describe('ubl y firma local', () => {
    test('el XML deja el nodo de firma vacío y no manda la propina', () => {
        const xml = construir(doc);
        expect(xml).toContain('ExtensionContent');
        expect(xml).toContain('>03<');
        expect(xml).toContain('PaymentMeansCode');
        expect(xml).not.toContain('>46<');
        expect(nombreArchivo(doc)).toBe('20000000001-03-B001-00000001');
    });

    test('firma RSA-SHA256 y el QR lleva el DigestValue', () => {
        const ruta = path.join(os.tmpdir(), `cert-demo-${process.pid}.pem`);
        fs.writeFileSync(ruta, pemDePrueba());
        const firmado = firmarXml(construir(doc), require('../../src/facturacion/services/firmaService').cargarCertificado(ruta, ''));
        expect(firmado.hash).toMatch(/^[A-Za-z0-9+/=]+$/);
        expect(firmado.xml).toContain('SignatureValue');
        const qr = codigoQr(doc, firmado.hash);
        expect(qr.startsWith('20000000001|03|B001|00000001|9.50|100.00|')).toBe(true);
        expect(qr.endsWith(`${firmado.hash}|`)).toBe(true);
        fs.unlinkSync(ruta);
    });
});

describe('zip y SOAP', () => {
    test('un ZIP de un XML se lee de vuelta', () => {
        const zip = comprimir('20000000001-01-F001-00000001.xml', '<Invoice/>');
        const leido = descomprimir(zip);
        expect(leido.nombre).toBe('20000000001-01-F001-00000001.xml');
        expect(leido.contenido.toString()).toBe('<Invoice/>');
    });

    test('el envelope usa RUC+MODDATOS y el CDR 0 se lee', () => {
        process.env.SUNAT_RUC = '20000000001';
        process.env.SUNAT_SOL_USUARIO = 'MODDATOS';
        process.env.SUNAT_SOL_CLAVE = 'moddatos';
        const xml = envelope('sendBill', '<fileName>x.zip</fileName>');
        expect(xml).toContain('<wsse:Username>20000000001MODDATOS</wsse:Username>');
        expect(leerCdr('<cbc:ResponseCode>0</cbc:ResponseCode><cbc:Description>Aceptado</cbc:Description>').codigo).toBe('0');
    });
});
