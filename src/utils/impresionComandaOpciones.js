/**
 * Opciones de impresión de comanda (Configuración → Pagos).
 *
 * imprimirSoloNombreComercial (default ON): el ticket muestra el nombre de carta
 * del plato, nunca el alias de cocina, y no lista guarniciones/complementos.
 */

function imprimirSoloNombreComercial(config) {
  return config?.tickets?.imprimirSoloNombreComercial !== false;
}

function nombreComercialLineaImpresion(p) {
  const plato = p?.plato && typeof p.plato === 'object' ? p.plato : null;
  const comercial = String(plato?.nombre || p?.nombreComercial || '').trim();
  const cocina = String(plato?.nombreCocina || p?.nombreCocina || '').trim();
  const snapshot = String(p?.nombre || '').trim();
  if (comercial) return comercial;
  if (snapshot && cocina && snapshot === cocina) return snapshot;
  if (snapshot) return snapshot;
  return cocina || 'Plato';
}

function aplicarOpcionesImpresionProductos(productos, opts = {}) {
  const solo = opts.soloNombreComercial !== false;
  return (productos || [])
    .filter((p) => p && !p.eliminado && !p.anulado)
    .map((p) => {
      const nombre = nombreComercialLineaImpresion(p);
      if (!solo) return { ...p, nombre };
      return {
        ...p,
        nombre,
        complementos: [],
        mostrarResumenComplementos: false,
      };
    });
}

module.exports = {
  imprimirSoloNombreComercial,
  nombreComercialLineaImpresion,
  aplicarOpcionesImpresionProductos,
};
