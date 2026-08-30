'use strict';

const moment = require('moment-timezone');
const { FILTRO_CIERRE_VIGENTE } = require('./cierreCajaReversion');

const TZ = 'America/Lima';

function boundsLimaDay(now = new Date()) {
  const m = moment.tz(now, TZ);
  return {
    limaYMD: m.format('YYYY-MM-DD'),
    inicio: m.clone().startOf('day').toDate(),
    fin: m.clone().endOf('day').toDate()
  };
}

/**
 * Cierres vigentes del día calendario Lima (no importa la hora del cierre).
 * El corte DIA/NOCHE es el primer cierre vigente de ese día.
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

module.exports = { TZ, boundsLimaDay, obtenerTurnosDia };
