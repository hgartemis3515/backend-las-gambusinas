/**
 * Empareja la selección del mozo (PPA) con una línea de comanda.
 * El frontend envía platoSubdocId / platoIndex; el backend también acepta platoLineaId.
 */
function idsIguales(a, b) {
  return String(a || '').trim() === String(b || '').trim();
}

function platoEstaSeleccionadoPpa(seleccionados, comanda, platoItem) {
  const comandaId = String(comanda?._id || '');
  const lineaId = String(platoItem?._id || '');
  const idx = (comanda?.platos || []).findIndex((p) => idsIguales(p._id, platoItem?._id));
  return (seleccionados || []).find((ps) => {
    if (!ps || !idsIguales(ps.comandaId, comandaId)) return false;
    if (lineaId && (idsIguales(ps.platoLineaId, lineaId) || idsIguales(ps.platoSubdocId, lineaId))) {
      return true;
    }
    if (ps.platoIndex != null && idx >= 0 && Number(ps.platoIndex) === idx) return true;
    return false;
  }) || null;
}

function lineaEnSnapshotPpa(ticketPlatos, plato) {
  const lineaId = String(plato?._id || '').trim();
  if (!lineaId) return false;
  return (ticketPlatos || []).some((tp) => {
    if (!tp) return false;
    if (tp.platoLineaId && idsIguales(tp.platoLineaId, lineaId)) return true;
    if (tp.platoSubdocId && idsIguales(tp.platoSubdocId, lineaId)) return true;
    return false;
  });
}

module.exports = {
  idsIguales,
  platoEstaSeleccionadoPpa,
  lineaEnSnapshotPpa,
};
