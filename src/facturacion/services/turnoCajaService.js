/**
 * Arqueo de turno. La propina se suma aparte y no entra al comprobante.
 * @module facturacion/services/turnoCaja
 */

const n2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * @param {Object[]} pagos
 * @param {Object[]} comprobantes
 */
function totalesDesdeMovimientos(pagos = [], comprobantes = []) {
    const aprobados = pagos.filter((p) => p.estado === 'aprobada');
    const suma = (proveedor) => n2(aprobados.filter((p) => p.proveedor === proveedor).reduce((s, p) => s + Number(p.monto), 0));
    return {
        totalEfectivoEsperado: suma('efectivo'),
        totalNiubizEsperado: suma('niubiz'),
        totalIzipayEsperado: suma('izipay'),
        totalCulqiEsperado: suma('culqi'),
        totalPropinas: n2(aprobados.reduce((s, p) => s + Number(p.propina || 0), 0)),
        conteo: {
            boletas: comprobantes.filter((c) => c.tipo === '03').length,
            facturas: comprobantes.filter((c) => c.tipo === '01').length,
            notasCredito: comprobantes.filter((c) => c.tipo === '07').length,
            pendientesEnvio: comprobantes.filter((c) => ['EMITIDO_LOCAL', 'PENDIENTE_ENVIO', 'ENVIADO', 'FIRMADO'].includes(c.estado)).length,
            rechazados: comprobantes.filter((c) => c.estado === 'RECHAZADO').length,
        },
    };
}

/**
 * @param {{ efectivo: number, niubiz: number, izipay: number }} esperado
 * @param {{ efectivo: number, niubiz: number, izipay: number }} declarado
 */
/**
 * Efectivo que debe haber en la gaveta.
 * Fondo + ventas en efectivo + ingresos de caja − egresos de caja.
 * @param {{ fondoInicial?: number, ventasEfectivo?: number, movimientos?: {tipo: string, monto: number}[] }} datos
 */
function efectivoEnGaveta(datos = {}) {
    const movimientos = datos.movimientos || [];
    const totalIngresosCaja = n2(movimientos.filter((m) => m.tipo === 'INGRESO').reduce((s, m) => s + Number(m.monto), 0));
    const totalEgresosCaja = n2(movimientos.filter((m) => m.tipo === 'EGRESO').reduce((s, m) => s + Number(m.monto), 0));
    return {
        totalIngresosCaja,
        totalEgresosCaja,
        efectivoEnGaveta: n2(Number(datos.fondoInicial || 0) + Number(datos.ventasEfectivo || 0) + totalIngresosCaja - totalEgresosCaja),
    };
}

function cuadrarCierre(esperado, declarado) {
    const diferencias = {
        efectivo: n2(declarado.efectivo - esperado.efectivo),
        niubiz: n2(declarado.niubiz - esperado.niubiz),
        izipay: n2(declarado.izipay - esperado.izipay),
    };
    const requierePin = diferencias.efectivo !== 0 || diferencias.niubiz !== 0 || diferencias.izipay !== 0;
    return { diferencias, requierePin };
}

module.exports = { totalesDesdeMovimientos, efectivoEnGaveta, cuadrarCierre };
