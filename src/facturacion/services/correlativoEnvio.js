/**
 * Reserva RC-YYYYMMDD-N o RA-YYYYMMDD-N. El $inc es atómico por emisor, tipo y día.
 * @module facturacion/services/correlativoEnvio
 */

const CorrelativoEnvio = require('../models/correlativoEnvio.model');

class ErrorEnvio extends Error {
    constructor(mensaje, codigo) {
        super(mensaje);
        this.name = 'ErrorEnvio';
        this.codigo = codigo;
        this.statusCode = 422;
    }
}

/**
 * @param {{ ruc: string, tipo: 'RC'|'RA', fecha: string }} params fecha YYYY-MM-DD o YYYYMMDD
 * @param {{ Modelo?: import('mongoose').Model }} [deps]
 */
async function reservarEnvio({ ruc, tipo, fecha }, { Modelo = CorrelativoEnvio } = {}) {
    if (tipo !== 'RC' && tipo !== 'RA') throw new ErrorEnvio(`Tipo de envío ${tipo} no admitido`, 'TIPO_ENVIO');
    const ymd = String(fecha || '').replace(/-/g, '');
    if (!/^\d{8}$/.test(ymd)) throw new ErrorEnvio('Fecha de envío inválida', 'FECHA_ENVIO');
    const doc = await Modelo.findOneAndUpdate(
        { ruc, tipo, fecha: ymd },
        { $inc: { ultimo: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return { id: `${tipo}-${ymd}-${doc.ultimo}`, numero: doc.ultimo, fecha: ymd };
}

module.exports = { reservarEnvio, ErrorEnvio };
