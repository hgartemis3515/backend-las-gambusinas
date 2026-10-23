/**
 * Totales que muestra comandas.html.
 *
 * precioTotal, después de un descuento, es la base neta sin IGV
 * (subtotalSinIGV × lo que queda del total). No es la suma de los platos.
 * Reescalar con ese número infla el subtotal: 348 × (348 / 224.43) = 539.61.
 * Solo se reduce el subtotal cuando el monto guardado todavía incluye platos eliminados.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TotalesVistaComanda = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function cerca(a, b) {
    return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= 0.05;
  }

  function yaEsLaSumaActiva(bruto, activos, tasaIgv) {
    if (!(activos > 0) || !(bruto > 0)) return false;
    if (bruto <= activos + 0.05) return true;
    const tasa = Number(tasaIgv) > 1 ? Number(tasaIgv) : 0;
    if (!(tasa > 1)) return false;
    const esperado = activos * tasa;
    return Math.abs(bruto - esperado) <= Math.max(0.1, esperado * 0.02);
  }

  /**
   * @returns {{ bruto: number, ratio: number, escalado: boolean }}
   */
  function ajustePorEliminados({
    totalActivos,
    totalTodos,
    precioTotal,
    brutoGuardado,
    hayEliminados,
    tasaIgv,
  } = {}) {
    const activos = Math.max(0, Number(totalActivos) || 0);
    const todos = Math.max(activos, Number(totalTodos) || 0);
    const bruto = Number(brutoGuardado) || 0;
    const pt = Number(precioTotal);
    const ptOk = Number.isFinite(pt) && pt > 0;

    if (!hayEliminados || !(bruto > 0) || yaEsLaSumaActiva(bruto, activos, tasaIgv)) {
      return { bruto: round2(bruto), ratio: 1, escalado: false };
    }

    if (todos > activos + 0.05 && bruto > activos + 0.05) {
      let base = todos;
      if (ptOk && pt > activos + 0.05 && (cerca(pt, todos) || cerca(pt, bruto))) {
        base = pt;
      }
      if (base > activos + 0.05) {
        const ratio = activos / base;
        return { bruto: round2(bruto * ratio), ratio, escalado: true };
      }
    }

    return { bruto: round2(bruto), ratio: 1, escalado: false };
  }

  /**
   * Base del descuento en el editor. No multiplica la suma de platos por
   * bruto/precioTotal cuando precioTotal ya es la base neta del descuento.
   */
  function brutoParaDescuento({ sumaLineas, brutoGuardado, precioTotal, tasaIgv } = {}) {
    const suma = Math.max(0, Number(sumaLineas) || 0);
    const bruto = Number(brutoGuardado) || 0;
    const pt = Number(precioTotal) || 0;
    const tasa = Number(tasaIgv) > 1 ? Number(tasaIgv) : 1;
    if (bruto > 0 && suma > 0 && Math.abs(suma - bruto) <= 0.05) return round2(bruto);
    if (bruto > 0 && pt > 0 && suma > 0 && pt > suma && Math.abs(suma - pt) > 0.05) {
      const factor = bruto / pt;
      const pareceIgv = Math.abs(factor - 1) < 0.03 || (tasa > 1 && Math.abs(factor - tasa) / tasa < 0.05);
      if (pareceIgv) return round2(suma * factor);
    }
    if (suma > 0) return round2(suma);
    return round2(bruto);
  }

  return { ajustePorEliminados, brutoParaDescuento, round2 };
});
