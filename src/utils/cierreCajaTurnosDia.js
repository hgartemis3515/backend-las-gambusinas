'use strict';

const moment = require('moment-timezone');
const { FILTRO_CIERRE_VIGENTE } = require('./cierreCajaReversion');
const { TZ, boundsDiaOperativo, ymdOperativo } = require('./diaOperativoRestaurante');

function boundsLimaDay(now = new Date()) {
  return boundsDiaOperativo(now);
}

/**
 * Período a cerrar: día operativo 04:00–04:00 Lima (como reportes «Hoy»),
 * sin volver a incluir lo ya cerrado.
 * Si ya hubo un cierre en este ciclo, el período empieza en ese periodoFin.
 */
function resolverPeriodoPendienteCierre(ultimoCierre, now = new Date()) {
  const { inicio: inicioHoy } = boundsLimaDay(now);
  const periodoFin = moment.tz(now, TZ).toDate();
  const finUltimo = ultimoCierre?.periodoFin ? new Date(ultimoCierre.periodoFin) : null;
  const periodoInicio = (finUltimo && finUltimo.getTime() > inicioHoy.getTime())
    ? finUltimo
    : inicioHoy;
  return { periodoInicio, periodoFin };
}

/**
 * Cierres vigentes del día operativo 04:00–04:00 Lima.
 * El corte DIA/NOCHE es el primer cierre vigente de ese ciclo.
 */
async function obtenerTurnosDia(CierreModel, now = new Date()) {
  const { limaYMD, inicio, fin } = boundsLimaDay(now);
  const cierres = await CierreModel.find({
    ...FILTRO_CIERRE_VIGENTE,
    fechaCierre: { $gte: inicio, $lte: fin }
  })
    .sort({ fechaCierre: 1 })
    .select('fechaCierre')
    .lean();

  return {
    limaYMD,
    cantidad: cierres.length,
    hayCierreHoy: cierres.length >= 1,
    primerCierreAt: cierres[0] ? cierres[0].fechaCierre : null
  };
}

module.exports = { TZ, boundsLimaDay, resolverPeriodoPendienteCierre, obtenerTurnosDia, ymdOperativo };
