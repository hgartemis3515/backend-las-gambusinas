/**
 * Detecta saltos de correlativo (existe el 10 y el 12, no el 11).
 * Un comprobante anulado sigue ocupando su número: no es un hueco.
 * @module facturacion/services/auditoriaGaps
 */

const TOPE_DETALLE = 50;

/**
 * @param {Array<number|string>} numeros
 * @returns {{ faltantes: number[], rangos: { desde: number, hasta: number, cantidad: number }[] }}
 */
function detectarSaltos(numeros) {
    const ordenados = [...new Set(numeros.map((n) => Number(n)))].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
    const faltantes = [];
    const rangos = [];
    for (let i = 1; i < ordenados.length; i += 1) {
        const anterior = ordenados[i - 1];
        const actual = ordenados[i];
        if (actual === anterior + 1) continue;
        const desde = anterior + 1;
        const hasta = actual - 1;
        const cantidad = hasta - desde + 1;
        rangos.push({ desde, hasta, cantidad });
        if (faltantes.length < TOPE_DETALLE) {
            for (let n = desde; n <= hasta && faltantes.length < TOPE_DETALLE; n += 1) faltantes.push(n);
        }
    }
    return { faltantes, rangos };
}

/**
 * Revisa cada serie y devuelve solo las que tienen saltos.
 * @param {import('mongoose').Model} Modelo
 * @param {{ ruc?: string }} [filtro]
 */
async function auditarSeries(Modelo, filtro = {}) {
    const match = filtro.ruc ? { ruc: filtro.ruc } : {};
    const grupos = await Modelo.aggregate([
        { $match: match },
        { $group: { _id: { ruc: '$ruc', tipo: '$tipo', serie: '$serie' }, numeros: { $push: '$numero' } } },
    ]);
    return grupos
        .map((g) => ({ ...g._id, ...detectarSaltos(g.numeros) }))
        .filter((g) => g.rangos.length > 0);
}

module.exports = { detectarSaltos, auditarSeries, TOPE_DETALLE };
