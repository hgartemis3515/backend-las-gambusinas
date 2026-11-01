/**
 * Estructura del ticket 80 mm (boleta y factura), tomada del comprobante de referencia.
 * @module facturacion/print/vistaComprobante
 */

const { codigoQr } = require('../services/firmaService');

const TITULOS = {
    '01': 'FACTURA ELECTRÓNICA',
    '03': 'BOLETA DE VENTA ELECTRÓNICA',
    '07': 'NOTA DE CRÉDITO ELECTRÓNICA',
};

const TITULOS_PIE = {
    '01': 'Factura Electrónica',
    '03': 'Boleta de Venta Electrónica',
    '07': 'Nota de Crédito Electrónica',
};

const DOC_CLIENTE = {
    0: 'DOC.',
    1: 'D.N.I.',
    4: 'C.E.',
    6: 'R.U.C.',
    7: 'PASAPORTE',
};

const CONSULTA = process.env.CPE_CONSULTA_URL || 'https://lasgambusinas.pe/cpe';
const EMISOR_SISTEMA = 'lasgambusinas.pe';

const n2 = (n) => Number(n || 0).toFixed(2);
const soles = (n) => `S/ ${n2(n)}`;

function sinAcento(texto) {
    return String(texto ?? '').normalize('NFD').replace(/\p{M}/gu, '');
}

/** @param {Date|string} fecha */
function fechaEmision(fecha) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h12',
    }).formatToParts(new Date(fecha)).map((p) => [p.type, p.value]));
    const ampm = String(parts.dayPeriod || '').replace(/\./g, '').toUpperCase();
    return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${ampm}`;
}

function serieVisible(doc) {
    const numero = doc.numero != null ? String(doc.numero) : '';
    return `${doc.serie || ''} - ${numero}`.trim();
}

function cantidadVisible(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return String(n ?? '');
    return Number.isInteger(v) ? String(v) : n2(v);
}

/** Precio de línea: entero sin decimales, como en el ticket de referencia. */
function precioVisible(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return n2(0);
    return Number.isInteger(v) ? String(v) : n2(v);
}

/**
 * @param {Object} doc
 * @returns {Object}
 */
function datosTicket(doc) {
    const emisor = doc.emisor || {};
    const receptor = doc.receptor || {};
    const totales = doc.totales || {};
    const titulo = TITULOS[doc.tipo] || 'COMPROBANTE';
    const cabecera = [];
    const comercial = String(emisor.nombreComercial || '').trim();
    const razon = String(emisor.razonSocial || '').trim();
    if (comercial) cabecera.push({ texto: comercial, bold: true });
    if (razon && razon !== comercial) cabecera.push({ texto: razon, bold: true });
    if (!cabecera.length && razon) cabecera.push({ texto: razon, bold: true });
    cabecera.push({ texto: `R.U.C.: ${emisor.ruc || doc.ruc || ''}` });
    if (emisor.direccion) cabecera.push({ texto: emisor.direccion });
    if (emisor.telefono) cabecera.push({ texto: `Telf.: ${emisor.telefono}` });
    if (emisor.email) cabecera.push({ texto: `Email: ${emisor.email}` });
    cabecera.push({ texto: 'Restaurante', italic: true });

    const etiquetaDoc = DOC_CLIENTE[receptor.tipoDoc] || 'DOC.';
    const filas = [
        { k: 'Fecha de Emisión:', v: fechaEmision(doc.fechaEmision) },
        { k: 'Nombre:', v: receptor.nombre || '-' },
        { k: etiquetaDoc, v: receptor.numDoc || '-' },
        { k: 'Dirección:', v: receptor.direccion || '-' },
        { k: 'Forma de pago:', v: String(doc.formaPago?.tipo || 'Contado').toUpperCase() },
    ];

    const items = (doc.items || []).map((it) => ({
        cant: cantidadVisible(it.cantidad),
        desc: it.descripcion || '',
        precio: precioVisible(it.precioUnitario),
        importe: n2(it.precioTotal),
    }));

    const pct = n2(doc.porcentajeIgv);
    const descuento = Number(totales.descuentosItem || 0) + Number(totales.descuentoGlobal || 0);
    const totalesFilas = [
        { label: 'Gravada:', monto: soles(totales.gravadas) },
    ];
    if (Number(totales.exoneradas) > 0) totalesFilas.push({ label: 'Exonerada:', monto: soles(totales.exoneradas) });
    if (Number(totales.inafectas) > 0) totalesFilas.push({ label: 'Inafecta:', monto: soles(totales.inafectas) });
    if (Number(totales.gratuitas) > 0) totalesFilas.push({ label: 'Gratuita:', monto: soles(totales.gratuitas) });
    totalesFilas.push(
        { label: `IGV (${pct}%):`, monto: soles(totales.igv) },
        { label: 'Descuento Total:', monto: soles(descuento) },
        { label: 'Total:', monto: soles(totales.importeTotal), fuerte: true },
    );

    const letras = (doc.leyendas || []).find((l) => l.codigo === '1000')?.valor || '';
    const pie = [
        `Representación Impresa de la ${TITULOS_PIE[doc.tipo] || titulo}`,
        'Consulte su Documento en:',
        CONSULTA,
        `HASH: ${doc.hash || ''}`,
        `VENDEDOR: ${doc.cajero || '-'}`,
        `Emitido por: ${EMISOR_SISTEMA}`,
    ];

    let qrTexto = '';
    if (doc.hash) {
        try { qrTexto = codigoQr(doc, doc.hash); } catch { qrTexto = ''; }
    }

    return {
        titulo,
        serie: serieVisible(doc),
        cabecera,
        filas,
        items,
        totalesFilas,
        letras: letras ? `Importe en Letras: ${letras}` : '',
        pie,
        qrTexto,
    };
}

const ANCHO = 42;

function derecha(texto) {
    const t = String(texto);
    if (t.length >= ANCHO) return t;
    return ' '.repeat(ANCHO - t.length) + t;
}

const RAYA = '-'.repeat(ANCHO);

function columnas(cant, desc, precio, imp) {
    const c = String(cant).padEnd(4).slice(0, 4);
    const p = String(precio).padStart(7);
    const im = String(imp).padStart(8);
    const hueco = ANCHO - 4 - 7 - 8 - 2;
    const texto = String(desc);
    const trozos = [];
    let resto = texto;
    while (resto.length > hueco) {
        trozos.push(resto.slice(0, hueco));
        resto = resto.slice(hueco);
    }
    trozos.push(resto);
    return trozos.map((parte, i) => (
        i === 0 ? `${c}${parte.padEnd(hueco)} ${p} ${im}` : `${' '.repeat(4)}${parte}`
    ));
}

/** Bloques ESC/POS en el mismo orden que el ticket impreso. */
function bloquesTicket(doc) {
    const v = datosTicket(doc);
    const bloques = [];
    const centro = (texto, extra) => bloques.push({ texto: sinAcento(texto), centro: true, ...extra });
    for (const linea of v.cabecera) centro(linea.texto, { negrita: Boolean(linea.bold) });
    bloques.push({ texto: RAYA });
    bloques.push({ texto: sinAcento(v.titulo), negrita: true });
    bloques.push({ texto: sinAcento(v.serie), negrita: true });
    for (const f of v.filas) bloques.push({ texto: sinAcento(`${f.k} ${f.v}`) });
    bloques.push({ texto: RAYA });
    for (const linea of columnas('Cant', 'Descripcion', 'Precio', 'Importe')) {
        bloques.push({ texto: linea, negrita: true });
    }
    for (const it of v.items) {
        for (const linea of columnas(it.cant, sinAcento(it.desc), it.precio, it.importe)) {
            bloques.push({ texto: linea });
        }
    }
    bloques.push({ texto: RAYA });
    for (const t of v.totalesFilas) {
        bloques.push({ texto: sinAcento(derecha(`${t.label} ${t.monto}`)), negrita: Boolean(t.fuerte) });
    }
    if (v.letras) bloques.push({ texto: sinAcento(v.letras) });
    bloques.push({ qr: true });
    for (const linea of v.pie) centro(linea);
    return bloques;
}

module.exports = { datosTicket, bloquesTicket, TITULOS };
