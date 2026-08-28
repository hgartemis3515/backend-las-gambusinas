'use strict';

const calculosPrecios = require('./calculosPrecios');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function errorDescuento(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Reparte un monto en céntimos según pesos (método del resto mayor).
 * La suma de las partes es exactamente el monto (2 decimales).
 */
function repartirCentesimos(pesos, montoTotal) {
  const vals = (pesos || []).map((p) => Math.max(0, Number(p) || 0));
  const cents = Math.round(round2(montoTotal) * 100);
  if (!vals.length || cents <= 0) return vals.map(() => 0);
  const totalPesos = vals.reduce((s, p) => s + p, 0);
  if (totalPesos <= 0) return vals.map(() => 0);

  const raw = vals.map((p) => (p / totalPesos) * cents);
  const floors = raw.map((x) => Math.floor(x + 1e-9));
  let resto = cents - floors.reduce((s, x) => s + x, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x + 1e-9) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < resto; k++) {
    floors[order[k % order.length].i] += 1;
  }
  return floors.map((c) => c / 100);
}

/**
 * Totales de comanda con descuento.
 * Monto fijo se resta del TOTAL con IGV (sin pasar por % a 2 decimales).
 *
 * @param {number} subtotalActual suma precio*cantidad de platos activos
 * @param {{ porcentaje?: number, monto?: number }} opts
 * @param {object} [configMoneda]
 */
function calcularTotalesConDescuento(subtotalActual, opts = {}, configMoneda) {
  const sub = Number(subtotalActual) || 0;
  const totalesOriginales = calculosPrecios.calcularTotales(sub, configMoneda);
  const totalSinDescuento = round2(totalesOriginales.total);
  const subtotalSinIGV = totalesOriginales.subtotalSinIGV;
  const montoFijo = Number(opts.monto);
  const usarMonto = Number.isFinite(montoFijo) && montoFijo > 0;

  let descuentoNum = Number(opts.porcentaje);
  if (!Number.isFinite(descuentoNum)) descuentoNum = 0;

  let totalCalculado = totalSinDescuento;
  let montoDescuento = 0;
  let descuentoMontoFijo = null;

  if (usarMonto) {
    if (totalSinDescuento <= 0) {
      throw errorDescuento('No hay total para aplicar un descuento por monto');
    }
    const aplicar = round2(Math.min(montoFijo, totalSinDescuento));
    totalCalculado = round2(totalSinDescuento - aplicar);
    montoDescuento = round2(totalSinDescuento - totalCalculado);
    descuentoNum = totalSinDescuento > 0
      ? Number(((aplicar / totalSinDescuento) * 100).toFixed(4))
      : 0;
    descuentoMontoFijo = aplicar;
  } else if (descuentoNum > 0) {
    if (descuentoNum > 100) {
      throw errorDescuento('El descuento debe estar entre 0 y 100');
    }
    if (descuentoNum === 100 || totalSinDescuento <= 0) {
      totalCalculado = 0;
      montoDescuento = totalSinDescuento;
    } else {
      const aplicar = round2(totalSinDescuento * (descuentoNum / 100));
      totalCalculado = round2(totalSinDescuento - aplicar);
      montoDescuento = aplicar;
    }
  }

  if (descuentoNum < 0 || descuentoNum > 100) {
    throw errorDescuento('El descuento debe estar entre 0 y 100');
  }

  const ratio = totalSinDescuento > 0 ? totalCalculado / totalSinDescuento : 0;
  const precioTotal = round2(subtotalSinIGV * ratio);
  const igv = round2((totalesOriginales.igv || 0) * ratio);

  return {
    descuentoNum,
    descuentoMontoFijo,
    totalSinDescuento,
    totalCalculado,
    montoDescuento,
    precioTotal,
    igv,
    subtotalSinIGV,
  };
}

module.exports = {
  round2,
  repartirCentesimos,
  calcularTotalesConDescuento,
};
