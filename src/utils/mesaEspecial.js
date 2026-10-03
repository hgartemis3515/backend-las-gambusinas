/**
 * Mesa especial: solo admin, autorización de uso, descuento y bloqueo al pago total.
 */

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/adminAuth');

function bool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function colorBarra(v, fallback) {
  const s = String(v || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return `#${s.toUpperCase()}`;
  return fallback;
}

function etiquetaMesa(mesa) {
  const nombre = String(mesa?.nombreMesa || '').trim();
  if (nombre) return nombre;
  const comb = String(mesa?.nombreCombinado || '').trim();
  if (comb) return comb;
  if (mesa?.nummesa != null && mesa.nummesa !== '') return `M${mesa.nummesa}`;
  return 'Mesa';
}

function funcionesDe(mesa) {
  return mesa?.funcionesEspeciales || {};
}

function esMesaInvitados(mesa) {
  return String(mesa?.nombreMesa || '').trim().toLowerCase() === 'invitados';
}

function exigeBloqueo(funciones, mesa) {
  if (esMesaInvitados(mesa)) return true;
  return Boolean(funciones?.requiereAutorizacion || funciones?.bloquearAlPagoTotal);
}

function estaBloqueada(mesa) {
  if (!mesa?.especial && !esMesaInvitados(mesa)) return false;
  if (!exigeBloqueo(funcionesDe(mesa), mesa)) return false;
  if (!mesa.usoEspecial || mesa.usoEspecial.bloqueada == null) return true;
  return mesa.usoEspecial.bloqueada === true;
}

function mesaPermiteDescuentoAdmin(mesa) {
  return mesa?.especial === true && funcionesDe(mesa).permiteDescuentoAdmin === true;
}

function rechazoUsoMesaEspecial({ mesa, rolJwt, rolDb, rolActor, esDueno }) {
  if (!mesa?.especial && !esMesaInvitados(mesa)) return null;
  const f = funcionesDe(mesa);
  const jwtRol = String(rolJwt || '').toLowerCase();
  const dbRol = String(rolDb || rolActor || '').toLowerCase();
  if (f.soloAdmin && !esMesaInvitados(mesa) && !esDueno) {
    if (jwtRol === 'admin') {
      // El admin opera la mesa. La comanda puede quedar a nombre de un mozo.
    } else if (jwtRol && jwtRol !== 'admin') {
      return {
        statusCode: 403,
        message: 'Solo un administrador puede usar esta mesa.',
      };
    } else if (dbRol !== 'admin') {
      return {
        statusCode: 403,
        message: 'Solo un administrador puede usar esta mesa.',
      };
    }
  }
  if (estaBloqueada(mesa)) {
    return {
      statusCode: 403,
      message: 'Un administrador debe autorizar el uso de esta mesa.',
    };
  }
  return null;
}

function rechazoDescuentoAdmin(mesa, rol) {
  const r = String(rol || '').toLowerCase();
  if (r !== 'admin') {
    return {
      statusCode: 403,
      message: 'Solo un administrador puede aplicar este descuento.',
    };
  }
  if (!mesaPermiteDescuentoAdmin(mesa)) {
    return {
      statusCode: 403,
      message: 'El descuento de administrador solo aplica en una mesa especial.',
    };
  }
  return null;
}

function identidadDesdeReq(req) {
  const h = req?.headers?.authorization || req?.headers?.Authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    const d = jwt.verify(h.substring(7), JWT_SECRET);
    return {
      id: d.id ? String(d.id) : '',
      rol: String(d.rol || '').toLowerCase(),
    };
  } catch {
    return null;
  }
}

function usoBloqueado() {
  return { bloqueada: true, autorizadaPor: null, autorizadaEn: null };
}

function usoLibre() {
  return { bloqueada: false, autorizadaPor: null, autorizadaEn: null };
}

/**
 * Normaliza especial / nombre / número / funciones para crear o editar.
 * @returns {{ set: object, unset: string[], nummesa: number|null|undefined }}
 */
function prepararDatosMesa(input, actual) {
  const src = input || {};
  const especial = src.especial !== undefined ? bool(src.especial) : Boolean(actual?.especial);

  let nombre = src.nombreMesa !== undefined ? src.nombreMesa : actual?.nombreMesa;
  nombre = String(nombre || '').trim();
  if (nombre.length > 24) {
    const e = new Error('El nombre de la mesa admite hasta 24 caracteres');
    e.statusCode = 400;
    throw e;
  }
  nombre = nombre || null;

  let nummesa;
  if (src.nummesa !== undefined) nummesa = src.nummesa;
  else if (src.numMesa !== undefined) nummesa = src.numMesa;
  else nummesa = actual?.nummesa;

  if (nummesa === '' || nummesa === null) nummesa = null;
  else if (nummesa !== undefined) {
    const n = Number(nummesa);
    if (!Number.isInteger(n) || n < 0) {
      const e = new Error('El número de mesa no es válido');
      e.statusCode = 400;
      throw e;
    }
    nummesa = n;
  }

  if (!especial && (nummesa === null || nummesa === undefined)) {
    const e = new Error('El número de mesa es requerido');
    e.statusCode = 400;
    throw e;
  }
  if (especial && !nombre && (nummesa === null || nummesa === undefined)) {
    const e = new Error('Una mesa especial necesita nombre o número');
    e.statusCode = 400;
    throw e;
  }

  let funciones;
  if (!especial) {
    funciones = {
      soloAdmin: false,
      permiteDescuentoAdmin: false,
      requiereAutorizacion: false,
      bloquearAlPagoTotal: false,
    };
  } else if (src.funcionesEspeciales && typeof src.funcionesEspeciales === 'object') {
    const f = src.funcionesEspeciales;
    funciones = {
      soloAdmin: bool(f.soloAdmin),
      permiteDescuentoAdmin: bool(f.permiteDescuentoAdmin),
      requiereAutorizacion: bool(f.requiereAutorizacion),
      bloquearAlPagoTotal: bool(f.bloquearAlPagoTotal),
    };
  } else if (actual?.funcionesEspeciales && src.especial === undefined) {
    const f = actual.funcionesEspeciales;
    funciones = {
      soloAdmin: Boolean(f.soloAdmin),
      permiteDescuentoAdmin: Boolean(f.permiteDescuentoAdmin),
      requiereAutorizacion: Boolean(f.requiereAutorizacion),
      bloquearAlPagoTotal: Boolean(f.bloquearAlPagoTotal),
    };
  } else {
    funciones = {
      soloAdmin: true,
      permiteDescuentoAdmin: true,
      requiereAutorizacion: true,
      bloquearAlPagoTotal: true,
    };
  }

  const set = { especial, nombreMesa: nombre, funcionesEspeciales: funciones };
  if (especial) {
    const barraSrc = src.barraEspecial || actual?.barraEspecial || {};
    set.barraEspecial = {
      colorA: colorBarra(barraSrc.colorA, '#D4AF37'),
      colorB: colorBarra(barraSrc.colorB, '#7A1F2B'),
    };
  }
  const unset = [];
  if (nummesa === null) unset.push('nummesa');
  else if (nummesa !== undefined) set.nummesa = nummesa;

  const eraEspecial = Boolean(actual?.especial);
  const antesExigia = exigeBloqueo(actual?.funcionesEspeciales, actual);
  const ahoraExige = exigeBloqueo(funciones, { ...actual, especial, nombreMesa: nombre });
  if (!especial) {
    set.usoEspecial = usoLibre();
  } else if ((!eraEspecial || !antesExigia) && ahoraExige) {
    set.usoEspecial = usoBloqueado();
  }

  return { set, unset, nummesa: nummesa === undefined ? actual?.nummesa : nummesa };
}

function aplicarBloqueoEnDocumento(mesa) {
  if ((!mesa?.especial && !esMesaInvitados(mesa)) || !exigeBloqueo(funcionesDe(mesa), mesa)) return false;
  mesa.usoEspecial = usoBloqueado();
  if (typeof mesa.markModified === 'function') mesa.markModified('usoEspecial');
  return true;
}

async function auditarMesaEspecial({ accion, mesaId, usuarioId, motivo }) {
  try {
    const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
    const mongoose = require('mongoose');
    const usuario = usuarioId && mongoose.Types.ObjectId.isValid(String(usuarioId))
      ? usuarioId
      : null;
    await AuditoriaAcciones.create({
      accion,
      entidadId: mesaId,
      entidadTipo: 'mesa',
      usuario,
      motivo: motivo || null,
      metadata: { motivo: motivo || null },
    });
  } catch (err) {
    console.error('Auditoría mesa especial:', err.message);
  }
}

async function bloquearMesaEspecial(mesaId, motivo) {
  if (!mesaId) return false;
  const mesas = require('../database/models/mesas.model');
  const mesa = await mesas.findById(mesaId).select('especial nombreMesa funcionesEspeciales usoEspecial').lean();
  if (!mesa?.especial && !esMesaInvitados(mesa)) return false;
  const f = funcionesDe(mesa);
  // Solo se bloquea al pago total la mesa cuya casilla "Se bloquea al pago total"
  // está marcada en mesas.html (funcionesEspeciales.bloquearAlPagoTotal).
  const porPago = motivo === 'pago_total' && f.bloquearAlPagoTotal === true;
  const porEliminacion = motivo === 'comanda_eliminada' && esMesaInvitados(mesa);
  const porLiberacion = motivo === 'liberacion' && exigeBloqueo(f, mesa);
  if (!porPago && !porLiberacion && !porEliminacion) return false;
  await mesas.updateOne(
    { _id: mesaId },
    {
      $set: {
        'usoEspecial.bloqueada': true,
        'usoEspecial.autorizadaPor': null,
        'usoEspecial.autorizadaEn': null,
      },
    }
  );
  await auditarMesaEspecial({
    accion: 'MESA_ESPECIAL_BLOQUEADA',
    mesaId,
    motivo,
  });
  if (global.emitMesaActualizada) {
    try {
      await global.emitMesaActualizada(mesaId);
    } catch (err) {
      console.error('emit mesa especial:', err.message);
    }
  }
  return true;
}

module.exports = {
  etiquetaMesa,
  estaBloqueada,
  mesaPermiteDescuentoAdmin,
  rechazoUsoMesaEspecial,
  rechazoDescuentoAdmin,
  identidadDesdeReq,
  prepararDatosMesa,
  aplicarBloqueoEnDocumento,
  auditarMesaEspecial,
  bloquearMesaEspecial,
};
