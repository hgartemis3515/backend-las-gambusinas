/**
 * Cálculo autoritativo de propina (backend único de verdad)
 */

const MAX_PORCENTAJE_PROPINA = Number(process.env.MAX_PORCENTAJE_PROPINA) || 40;
const MAX_MONTO_FIJO_PROPINA = Number(process.env.MAX_MONTO_FIJO_PROPINA) || 1_000_000;

function resolverTotalBoucher(boucher) {
    if (!boucher) return 0;
    const tieneDescuento =
        (boucher.montoDescuento || 0) > 0 || (boucher.descuentos && boucher.descuentos.length > 0);
    if (tieneDescuento && boucher.totalConDescuento != null) {
        return Math.max(0, Number(boucher.totalConDescuento));
    }
    return Math.max(0, Number(boucher.total != null ? boucher.total : 0));
}

/**
 * @param {string} tipo — 'monto' | 'porcentaje' | 'ninguna'
 * @param {number} totalBoucher
 * @param {number|null} montoFijo
 * @param {number|null} porcentaje
 */
function calcularMontoPropina(tipo, totalBoucher, montoFijo, porcentaje) {
    const tb = Math.max(0, Number(totalBoucher) || 0);
    if (tipo === 'ninguna') {
        return { monto: 0, error: null };
    }
    if (tipo === 'monto') {
        const m = Number(montoFijo);
        if (m == null || Number.isNaN(m) || m < 0) {
            return { monto: 0, error: 'montoFijo inválido' };
        }
        if (m > MAX_MONTO_FIJO_PROPINA) {
            return { monto: 0, error: `montoFijo no puede superar ${MAX_MONTO_FIJO_PROPINA}` };
        }
        return { monto: Math.round(m * 100) / 100, error: null };
    }
    if (tipo === 'porcentaje') {
        const p = Number(porcentaje);
        if (p == null || Number.isNaN(p) || p <= 0) {
            return { monto: 0, error: 'porcentaje debe ser mayor a 0' };
        }
        if (p > MAX_PORCENTAJE_PROPINA) {
            return { monto: 0, error: `porcentaje máximo permitido: ${MAX_PORCENTAJE_PROPINA}%` };
        }
        const monto = Math.round((tb * (p / 100)) * 100) / 100;
        return { monto, error: null };
    }
    return { monto: 0, error: 'tipo inválido' };
}

function idsCoinciden(a, b) {
    if (a == null || b == null) return false;
    const sa = typeof a === 'object' && a.toString ? a.toString() : String(a);
    const sb = typeof b === 'object' && b.toString ? b.toString() : String(b);
    return sa === sb;
}

module.exports = {
    MAX_PORCENTAJE_PROPINA,
    MAX_MONTO_FIJO_PROPINA,
    resolverTotalBoucher,
    calcularMontoPropina,
    idsCoinciden
};
