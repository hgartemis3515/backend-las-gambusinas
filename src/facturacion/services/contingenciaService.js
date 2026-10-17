/**
 * Registro posterior de boletas físicas de contingencia.
 * No llama a serieService: el número lo puso el talonario, no el sistema.
 * @module facturacion/services/contingencia
 */

const Contingencia = require('../models/contingencia.model');
const { esRucValido } = require('./validacionCliente');

class ErrorContingencia extends Error {
    /** @param {string} mensaje @param {string} [codigo] */
    constructor(mensaje, codigo = 'CONTINGENCIA') {
        super(mensaje);
        this.name = 'ErrorContingencia';
        this.codigo = codigo;
        this.statusCode = 422;
    }
}

/**
 * @param {Object} datos
 * @param {{ Modelo?: import('mongoose').Model }} [deps]
 */
async function registrarContingencia(datos, { Modelo = Contingencia } = {}) {
    if (!esRucValido(datos.ruc)) throw new ErrorContingencia('RUC del emisor inválido', 'RUC_INVALIDO');
    if (!/^\d{1,4}$/.test(datos.serieTalonario || '')) throw new ErrorContingencia('La serie de talonario es numérica (ej. 0001)');
    if (!/^\d{1,8}$/.test(String(datos.numero || ''))) throw new ErrorContingencia('Número de talonario inválido');
    const items = datos.items || [];
    if (items.length === 0) throw new ErrorContingencia('Indique el consumo del talonario');
    const total = Math.round(items.reduce((s, it) => s + Number(it.importe || 0), 0) * 100) / 100;
    try {
        return await Modelo.create({
            ruc: datos.ruc,
            serieTalonario: datos.serieTalonario,
            numero: String(datos.numero).padStart(8, '0'),
            fechaEmision: new Date(datos.fechaEmision),
            motivo: datos.motivo,
            cliente: datos.cliente || undefined,
            items,
            total,
            registradoPor: datos.registradoPor || null,
        });
    } catch (err) {
        if (err?.code === 11000) throw new ErrorContingencia('Esa boleta de talonario ya fue registrada', 'DUPLICADA');
        throw err;
    }
}

module.exports = { registrarContingencia, ErrorContingencia };
