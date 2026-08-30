'use strict';

const FILTRO_CIERRE_VIGENTE = { estado: { $ne: 'revertido' } };

function normalizarMotivoReversion(raw) {
  const motivo = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (motivo.length < 8) {
    const err = new Error('Indica un motivo de reversión (mínimo 8 caracteres) para la auditoría');
    err.statusCode = 400;
    throw err;
  }
  if (motivo.length > 500) {
    const err = new Error('El motivo no puede superar 500 caracteres');
    err.statusCode = 400;
    throw err;
  }
  return motivo;
}

async function obtenerUltimoCierreVigente(CierreModel, select = 'fechaCierre periodoFin estado') {
  return CierreModel.findOne(FILTRO_CIERRE_VIGENTE)
    .sort({ fechaCierre: -1 })
    .select(select)
    .lean();
}

module.exports = {
  FILTRO_CIERRE_VIGENTE,
  normalizarMotivoReversion,
  obtenerUltimoCierreVigente
};
