/**
 * Registro de Ventas e Ingresos Electrónico (RVIE / formato 14.1) para el contador.
 * El sufijo del nombre de archivo sigue el anexo PLE y se puede cambiar con
 * FACTURACION_SIRE_SUFIJO si SUNAT ajusta el indicador final.
 * @module facturacion/services/sireRvie
 */

const SUFIJO_DEFECTO = '00140100001111';

const COLUMNAS_EXCEL = [
    'Fecha', 'Tipo', 'Serie', 'Número', 'Tipo Doc Cliente', 'RUC/DNI', 'Razón Social',
    'Base Gravada', 'Exonerada', 'Inafecta', 'IGV', 'ICBPER', 'Otros Cargos', 'Total',
    'Estado CDR', 'Código de Hash',
];

/** @param {number} n */
const monto = (n) => (Number(n) || 0).toFixed(2);

/** @param {Date|string} fecha */
function fechaSunat(fecha) {
    const d = new Date(fecha);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * @param {{ ruc: string, anio: number, mes: number, sufijo?: string }} meta
 * @returns {string}
 */
function nombreArchivoRvie({ ruc, anio, mes, sufijo = process.env.FACTURACION_SIRE_SUFIJO || SUFIJO_DEFECTO }) {
    const periodo = `${anio}${String(mes).padStart(2, '0')}`;
    return `LE${ruc}${periodo}${sufijo}.txt`;
}

/**
 * Una línea del formato 14.1 (35 campos, separados por |, termina en |).
 * @param {Object} c comprobante
 * @param {number} orden
 * @param {string} periodo AAAAMM00
 */
function linea14(c, orden, periodo) {
    const ref = c.referencia || {};
    const anulado = c.estado === 'ANULADO_NC' || c.estado === 'DE_BAJA';
    const montoOCero = (n) => monto(anulado ? 0 : n);
    const campos = [
        periodo,
        String(orden).padStart(8, '0'),
        `M${String(orden).padStart(4, '0')}`,
        fechaSunat(c.fechaEmision),
        '',
        c.tipo,
        c.serie,
        c.numero,
        '',
        c.receptor?.tipoDoc === '0' ? '' : (c.receptor?.tipoDoc || ''),
        c.receptor?.tipoDoc === '0' ? '' : (c.receptor?.numDoc || ''),
        c.receptor?.nombre || '',
        '0.00',
        montoOCero(c.totales?.gravadas),
        montoOCero(c.totales?.descuentoGlobal),
        montoOCero(c.totales?.igv),
        '0.00',
        montoOCero(c.totales?.exoneradas),
        montoOCero(c.totales?.inafectas),
        '0.00',
        '0.00',
        '0.00',
        montoOCero(c.totales?.icbper),
        montoOCero(c.totales?.cargos),
        montoOCero(c.totales?.importeTotal),
        c.moneda || 'PEN',
        '1.000',
        ref.fechaEmision ? fechaSunat(ref.fechaEmision) : '',
        ref.tipo || '',
        ref.serie || '',
        ref.numero || '',
        '',
        '',
        anulado ? '2' : '1',
        '',
    ];
    return `${campos.join('|')}|`;
}

/** @param {Object} c */
function filaExcel(c) {
    const anulado = c.estado === 'ANULADO_NC' || c.estado === 'DE_BAJA';
    const valor = (n) => monto(anulado ? 0 : n);
    return [
        fechaSunat(c.fechaEmision), c.tipo, c.serie, c.numero,
        c.receptor?.tipoDoc || '', c.receptor?.numDoc || '', c.receptor?.nombre || '',
        valor(c.totales?.gravadas), valor(c.totales?.exoneradas), valor(c.totales?.inafectas),
        valor(c.totales?.igv), valor(c.totales?.icbper), valor(c.totales?.cargos), valor(c.totales?.importeTotal),
        c.estado || '', c.hash || '',
    ];
}

function csvCelda(valor) {
    const texto = String(valor ?? '');
    return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * @param {Object[]} comprobantes del mes, ya filtrados
 * @param {{ ruc: string, anio: number, mes: number }} meta
 */
function generarRvie(comprobantes, meta) {
    const periodo = `${meta.anio}${String(meta.mes).padStart(2, '0')}00`;
    const ordenados = [...comprobantes].sort((a, b) => new Date(a.fechaEmision) - new Date(b.fechaEmision));
    const txt = ordenados.map((c, i) => linea14(c, i + 1, periodo)).join('\n');
    const csv = [COLUMNAS_EXCEL.join(';'), ...ordenados.map((c) => filaExcel(c).map(csvCelda).join(';'))].join('\n');
    return {
        filename: nombreArchivoRvie(meta),
        filenameCsv: `ventas-${meta.anio}-${String(meta.mes).padStart(2, '0')}.csv`,
        txt,
        csv,
        columnas: COLUMNAS_EXCEL,
    };
}

module.exports = { generarRvie, nombreArchivoRvie, COLUMNAS_EXCEL, SUFIJO_DEFECTO };
