/**
 * Control atómico de series y correlativos.
 *
 * La reserva solo se permite dentro de una transacción Mongo activa: si la
 * transacción se aborta, el `$inc` se revierte y el correlativo no avanza.
 * Con varias cajas cobrando a la vez, Mongo serializa las escrituras sobre el
 * documento de la serie (WriteConflict → `withTransaction` reintenta).
 *
 * @module facturacion/services/serieService
 */

const SerieComprobante = require('../models/serieComprobante.model');
const { REGEX_SERIE } = require('../constants/catalogosSunat');

const MAX_CORRELATIVO = 99999999;

class ErrorSerie extends Error {
    /** @param {string} mensaje @param {string} codigo @param {number} [statusCode=422] */
    constructor(mensaje, codigo, statusCode = 422) {
        super(mensaje);
        this.name = 'ErrorSerie';
        this.codigo = codigo;
        this.statusCode = statusCode;
    }
}

/**
 * Valida el formato de la serie según el tipo de comprobante.
 * Factura `^F[A-Z0-9]{3}$`, Boleta `^B[A-Z0-9]{3}$`, NC `^FC\d{2}$` | `^BC\d{2}$`.
 * @param {string} tipo
 * @param {string} serie
 * @param {{tipo: string}|null} [referencia] Para NC: el comprobante que modifica
 */
function validarSerie(tipo, serie, referencia = null) {
    const regex = REGEX_SERIE[tipo];
    if (!regex) throw new ErrorSerie(`Tipo de comprobante no soportado: ${tipo}`, 'TIPO_INVALIDO');
    if (typeof serie !== 'string' || !regex.test(serie)) {
        throw new ErrorSerie(`Serie ${serie} inválida para el tipo ${tipo}`, 'SERIE_INVALIDA');
    }
    if (tipo === '07' && referencia) {
        const esperado = referencia.tipo === '01' ? 'FC' : 'BC';
        if (!serie.startsWith(esperado)) {
            throw new ErrorSerie(`La NC de un comprobante ${referencia.tipo} debe usar serie ${esperado}##`, 'SERIE_NC_INCOMPATIBLE');
        }
    }
}

/** @param {number} n @returns {string} */
const formatearNumero = (n) => String(n).padStart(8, '0');

/**
 * Reserva el siguiente correlativo de la serie dentro de la transacción recibida.
 * @param {Object} params
 * @param {string} params.ruc
 * @param {string} params.tipo
 * @param {string} params.serie
 * @param {import('mongoose').ClientSession} params.session  Obligatoria y con transacción activa
 * @param {Object} [deps]
 * @param {import('mongoose').Model} [deps.Modelo]
 * @returns {Promise<{serie: string, numero: string, idCompleto: string, correlativo: number}>}
 */
async function reservarCorrelativo({ ruc, tipo, serie, session }, { Modelo = SerieComprobante } = {}) {
    if (!session) throw new ErrorSerie('Se requiere una sesión de Mongo para reservar correlativos', 'SESION_REQUERIDA', 500);
    if (typeof session.inTransaction === 'function' && !session.inTransaction()) {
        throw new ErrorSerie('La reserva de correlativos debe ejecutarse dentro de una transacción', 'TRANSACCION_REQUERIDA', 500);
    }
    validarSerie(tipo, serie);

    const doc = await Modelo.findOneAndUpdate(
        { ruc, tipo, serie, activa: true, ultimoNumero: { $lt: MAX_CORRELATIVO } },
        { $inc: { ultimoNumero: 1 } },
        { new: true, session }
    );
    if (!doc) {
        throw new ErrorSerie(`Serie ${serie} no existe, está inactiva o agotó su correlativo`, 'SERIE_NO_DISPONIBLE', 409);
    }
    const numero = formatearNumero(doc.ultimoNumero);
    return { serie, numero, idCompleto: `${serie}-${numero}`, correlativo: doc.ultimoNumero };
}

/**
 * Crea una serie (idempotente por ruc+tipo+serie).
 * @param {{ruc: string, tipo: string, serie: string, sucursal?: string, terminal?: string}} datos
 * @param {Object} [deps]
 */
async function asegurarSerie(datos, { Modelo = SerieComprobante } = {}) {
    validarSerie(datos.tipo, datos.serie);
    return Modelo.findOneAndUpdate(
        { ruc: datos.ruc, tipo: datos.tipo, serie: datos.serie },
        { $setOnInsert: { sucursal: datos.sucursal || 'principal', terminal: datos.terminal || null, ultimoNumero: 0, activa: true } },
        { upsert: true, new: true, runValidators: true }
    );
}

module.exports = { reservarCorrelativo, asegurarSerie, validarSerie, formatearNumero, ErrorSerie, MAX_CORRELATIVO };
