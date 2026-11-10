'use strict';

const CajaAdicional = require('../database/models/cajaAdicional.model');
const CierreCajaRestaurante = require('../database/models/cierreCajaRestaurante.model');
const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
const { obtenerTurnosDia } = require('../utils/cierreCajaTurnosDia');
const { boundsDiaOperativo } = require('../utils/diaOperativoRestaurante');
const { FILTRO_CIERRE_VIGENTE } = require('../utils/cierreCajaReversion');
const {
  tramosPendientes,
  segmentosDia,
  periodoActivo,
  siguienteNumero,
} = require('../utils/cajasAdicionalesTurno');
const logger = require('../utils/logger');

function publico(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    numero: doc.numero,
    fechaOperativa: doc.fechaOperativa,
    habilitadaAt: doc.habilitadaAt,
    motivo: doc.motivo || '',
    habilitadaPorNombre: doc.habilitadaPorNombre || '',
    estado: doc.estado,
    cerradaAt: doc.cerradaAt || null,
  };
}

async function cajasDelDia(limaYMD) {
  return CajaAdicional.find({ fechaOperativa: limaYMD }).sort({ numero: 1 }).lean();
}

async function resumenTurno(now = new Date()) {
  const base = await obtenerTurnosDia(CierreCajaRestaurante, now);
  const { inicio, fin } = boundsDiaOperativo(base.limaYMD);
  const cajas = base.hayCierreHoy ? await cajasDelDia(base.limaYMD) : [];
  const cajaAbierta = cajas.find((c) => c.estado === 'abierta' && !c.cerradaAt) || null;
  const segmentos = segmentosDia({
    inicioDia: inicio,
    finDia: fin,
    primerCierreAt: base.hayCierreHoy ? base.primerCierreAt : null,
    cajas,
    now,
  });
  return {
    ...base,
    segmentos,
    cajaAbierta: cajaAbierta ? publico(cajaAbierta) : null,
    puedeHabilitarCajaAdicional: !!(base.hayCierreHoy && !cajaAbierta),
    siguienteNumero: siguienteNumero(cajas),
    periodoActivo: periodoActivo({ hayCierre: base.hayCierreHoy, cajaAbierta }),
  };
}

async function tramosDelPendiente({ inicioDia, now, cajaForzada }) {
  const fin = now || new Date();
  const ymd = require('../utils/diaOperativoRestaurante').ymdOperativo(fin);
  const [cierres, cajas] = await Promise.all([
    CierreCajaRestaurante.find({
      ...FILTRO_CIERRE_VIGENTE,
      fechaCierre: { $gte: inicioDia, $lte: fin },
    }).select('periodoInicio periodoFin estado fechaCierre').lean(),
    cajasDelDia(ymd),
  ]);
  const cajaAbierta = cajaForzada || cajas.find((c) => c.estado === 'abierta' && !c.cerradaAt) || null;
  const tramos = tramosPendientes({ inicioDia, now: fin, cierres, cajaAbierta });
  return { tramos, cajaAbierta, cierres };
}

async function habilitar({ motivo, usuarioId, usuarioNombre, now = new Date() }) {
  const turno = await resumenTurno(now);
  if (!turno.hayCierreHoy) {
    const err = new Error('La caja adicional solo se habilita en Noche, después de cerrar la caja');
    err.statusCode = 400;
    throw err;
  }
  if (turno.cajaAbierta) {
    const err = new Error('Ya hay una caja adicional abierta. Ciérrala para volver a Noche');
    err.statusCode = 400;
    throw err;
  }
  const texto = String(motivo || '').trim().slice(0, 500);
  const doc = await CajaAdicional.create({
    fechaOperativa: turno.limaYMD,
    numero: turno.siguienteNumero,
    habilitadaAt: now,
    motivo: texto,
    habilitadaPor: usuarioId || undefined,
    habilitadaPorNombre: usuarioNombre || '',
    estado: 'abierta',
  });
  try {
    await AuditoriaAcciones.create({
      accion: 'CAJA_ADICIONAL_HABILITADA',
      entidadId: doc._id,
      entidadTipo: 'cierre_caja',
      usuario: usuarioId || undefined,
      usuarioNombre: usuarioNombre || '',
      motivo: texto,
      metadata: {
        numero: doc.numero,
        fechaOperativa: doc.fechaOperativa,
        habilitadaAt: doc.habilitadaAt,
        motivo: texto,
      },
    });
  } catch (e) {
    logger.warn('No se registró auditoría de caja adicional', { error: e.message });
  }
  return publico(doc);
}

async function cerrarAbierta(cajaId, cierreId, cerradaAt) {
  if (!cajaId) return null;
  return CajaAdicional.findOneAndUpdate(
    { _id: cajaId, estado: 'abierta' },
    { $set: { estado: 'cerrada', cerradaAt: cerradaAt || new Date(), cierreId } },
    { new: true }
  ).lean();
}

async function reabrirPorCierre(cierreId) {
  if (!cierreId) return null;
  return CajaAdicional.findOneAndUpdate(
    { cierreId, estado: 'cerrada' },
    { $set: { estado: 'abierta', cerradaAt: null, cierreId: null } },
    { new: true }
  ).lean();
}

module.exports = {
  resumenTurno,
  tramosDelPendiente,
  habilitar,
  cerrarAbierta,
  reabrirPorCierre,
  publico,
};
