/**
 * Emite una factura de prueba contra SUNAT beta.
 * Uso: npm run test:sunat:beta
 * Sale con código 0 solo si el CDR trae ResponseCode 0.
 */

require('dotenv').config();
const motor = require('../src/facturacion/services/motorTributario');
const { construir, nombreArchivo, partesLima } = require('../src/facturacion/services/ublBuilder');
const { firmarXml, codigoQr } = require('../src/facturacion/services/firmaService');
const SunatDirecto = require('../src/facturacion/providers/sunatDirecto');

async function main() {
    if (!process.env.CERT_PATH) throw new Error('Falta CERT_PATH. Ejecute npm run setup:cert:demo');
    const calculo = motor.calcular({
        tipoComprobante: '01',
        items: [
            { descripcion: 'Lomo saltado', cantidad: 1, precioUnitario: 45 },
            { descripcion: 'Chicha morada', cantidad: 2, precioUnitario: 8 },
        ],
        config: { tasaIgv: Number(process.env.IGV_PORCENTAJE || 10.5), preciosIncluyenIGV: true },
        pagos: [{ medio: 'efectivo', monto: 61 }],
    });
    const fechaEmision = new Date();
    const doc = {
        ruc: process.env.SUNAT_RUC || '20000000001',
        tipo: '01',
        serie: 'F001',
        numero: '00000001',
        idCompleto: 'F001-00000001',
        fechaEmision,
        tipoOperacion: '0101',
        moneda: 'PEN',
        porcentajeIgv: calculo.porcentajeIgv,
        emisor: {
            ruc: process.env.SUNAT_RUC || '20000000001',
            razonSocial: process.env.SUNAT_RAZON_SOCIAL || 'EMPRESA DEMO',
            nombreComercial: 'DEMO',
            direccion: 'Lima',
            ubigeo: '150101',
            codigoEstablecimiento: '0000',
        },
        receptor: { tipoDoc: '6', numDoc: '20100066603', nombre: 'EMPRESA CLIENTE SAC', direccion: 'Av. Prueba 123' },
        items: calculo.items,
        totales: calculo.totales,
        leyendas: calculo.leyendas,
        formaPago: calculo.formaPago,
        mediosPago: calculo.mediosPago,
    };
    const t0 = Date.now();
    const firmado = firmarXml(construir(doc));
    console.log(`Firma local en ${Date.now() - t0} ms`);
    console.log(`Fecha Lima ${partesLima(fechaEmision).fecha}`);
    console.log(`Hash ${firmado.hash}`);
    console.log(`QR ${codigoQr(doc, firmado.hash)}`);
    const cdr = await new SunatDirecto().sendBill(nombreArchivo(doc), firmado.xml);
    console.log(`CDR ${cdr.codigo} ${cdr.descripcion}`);
    if (cdr.codigo !== '0') process.exit(1);
    console.log(`[OK] Factura aceptada por SUNAT Beta. ResponseCode: 0 - ${cdr.descripcion}`);
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
