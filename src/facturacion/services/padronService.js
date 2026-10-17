/**
 * Consulta de padrón RUC/DNI. Si no hay servicio o no responde, el cajero escribe a mano.
 * @module facturacion/services/padronService
 */

const { esRucValido, esDniValido, ErrorCliente } = require('./validacionCliente');

/**
 * @param {string} tipo Catálogo 06: 1 DNI, 6 RUC
 * @param {string} numero
 * @param {{ fetchImpl?: typeof fetch }} [deps]
 */
async function consultarPadron(tipo, numero, deps = {}) {
    const tipoDoc = String(tipo || '');
    const numDoc = String(numero || '').trim();
    if (tipoDoc === '1' && !esDniValido(numDoc)) throw new ErrorCliente('DNI inválido (8 dígitos)', 'DNI_INVALIDO');
    if (tipoDoc === '6' && !esRucValido(numDoc)) throw new ErrorCliente('RUC inválido (11 dígitos y dígito verificador)', 'RUC_INVALIDO');
    if (tipoDoc !== '1' && tipoDoc !== '6') throw new ErrorCliente('El padrón consulta DNI o RUC', 'TIPO_PADRON');

    const vacio = {
        tipoDoc,
        numDoc,
        nombre: '',
        direccion: '',
        estado: null,
        condicion: null,
        validacionPadron: 'pendiente',
        encontrado: false,
    };
    const base = process.env.FACTURACION_PADRON_URL;
    if (!base) return vacio;

    const fetchImpl = deps.fetchImpl || fetch;
    try {
        const res = await fetchImpl(`${String(base).replace(/\/$/, '')}/${tipoDoc}/${numDoc}`, {
            signal: AbortSignal.timeout(2500),
        });
        if (!res.ok) return vacio;
        const data = await res.json();
        const nombre = String(data.nombre || data.razonSocial || '').trim();
        return {
            tipoDoc,
            numDoc,
            nombre,
            direccion: String(data.direccion || '').trim(),
            estado: data.estado || null,
            condicion: data.condicion || null,
            validacionPadron: nombre ? 'ok' : 'pendiente',
            encontrado: Boolean(nombre),
        };
    } catch {
        return vacio;
    }
}

module.exports = { consultarPadron };
