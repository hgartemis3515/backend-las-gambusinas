/**
 * Mensajería Service — Backend Las Gambusinas
 *
 * Lógica de negocio para mensajería interna (texto + voz):
 *  - Validación de permisos por rol (cap de prioridad)
 *  - Persistencia de Conversacion + Mensaje
 *  - Entrega en tiempo real vía Socket.io (rooms personales)
 *  - Creación de Notificacion (tipo 'mensaje') para dashboard/inbox mixto
 *  - Push Expo a mozos cuando corresponde
 *
 * Referencia lógica: Messenger / chat corporativo.
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const Conversacion = require('../database/models/conversacion.model');
const Mensaje = require('../database/models/mensaje.model');
const Notificacion = require('../database/models/notificacion.model');

// Prioridades (alineadas con Notificacion.prioridad 0–10)
const PRIORIDADES = {
  baja: 2,
  normal: 5,
  alta: 7,
  urgente: 9,
  critica: 10
};

const PRIORIDAD_A_CODIGO = {};
Object.entries(PRIORIDADES).forEach(([k, v]) => { PRIORIDAD_A_CODIGO[v] = k; });

// Cap de prioridad por rol: qué código máximo puede asignar cada rol.
const CAP_PRIORIDAD_ROL = {
  admin: 10,        // puede critica
  supervisor: 7,    // hasta alta (urgente/critica requiere forzar-prioridad-mensajes)
  capitanMozos: 5,  // normal
  cocinero: 5,     // normal
  mozos: 5,        // normal
  cajero: 5        // normal
};

const CANALES_SEED = [
  { titulo: '#general', rolesPermitidos: ['admin', 'supervisor', 'mozos', 'capitanMozos', 'cocinero', 'cajero'] },
  { titulo: '#cocina', rolesPermitidos: ['admin', 'supervisor', 'cocinero'] },
  { titulo: '#sala', rolesPermitidos: ['admin', 'supervisor', 'mozos', 'capitanMozos'] },
  { titulo: '#caja', rolesPermitidos: ['admin', 'supervisor', 'cajero'] },
  { titulo: '#sala-cocina', rolesPermitidos: ['admin', 'supervisor', 'mozos', 'capitanMozos', 'cocinero'] }
];

/**
 * Valida que el usuario pueda usar una prioridad.
 * @param {string} rol - Rol del emisor
 * @param {string[]} permisos - Permisos del emisor (JWT)
 * @param {string} prioridadCodigo - 'baja'|'normal'|'alta'|'urgente'|'critica'
 * @returns {{ok: boolean, valor: number, codigo: string, error?: string}}
 */
function validarPrioridad(rol, permisos, prioridadCodigo) {
  const valor = PRIORIDADES[prioridadCodigo];
  if (valor == null) {
    return { ok: false, valor: 5, codigo: 'normal', error: `Prioridad inválida: ${prioridadCodigo}` };
  }

  // admin puede todo; otros requieren 'forzar-prioridad-mensajes' para > cap base
  const cap = rol === 'admin' ? 10 : (CAP_PRIORIDAD_ROL[rol] ?? 5);

  if (valor <= cap) {
    return { ok: true, valor, codigo: prioridadCodigo };
  }

  // Si el cap del rol no alcanza, solo se permite si tiene 'forzar-prioridad-mensajes'
  if (permisos.includes('forzar-prioridad-mensajes')) {
    return { ok: true, valor, codigo: prioridadCodigo };
  }

  // Reasignar al cap del rol en lugar de rechazar (graceful degradation)
  const rebajadoCodigo = PRIORIDAD_A_CODIGO[cap] || 'normal';
  return {
    ok: true,
    valor: cap,
    codigo: rebajadoCodigo,
    warning: `Prioridad rebajada a '${rebajadoCodigo}' (rol ${rol} sin forzar-prioridad-mensajes)`
  };
}

/**
 * Verifica si un usuario es participante o tiene acceso por rol a una conversación.
 */
function usuarioPuedeAccederConversacion(usuarioId, rol, conversacion) {
  // Admin / supervisor con ver-mensajes-todos puede ver todo
  if (rol === 'admin' || rol === 'supervisor') return true;

  // Participante explícito
  const esParticipante = (conversacion.participantes || []).some(
    p => p.usuario?.toString?.() === usuarioId?.toString?.() || p.usuario === usuarioId
  );
  if (esParticipante) return true;

  // Canal abierto por rol
  if (conversacion.rolesPermitidos?.length) {
    if (conversacion.rolesPermitidos.includes(rol)) return true;
  }

  return false;
}

/**
 * Obtiene los IDs de usuarios destinatarios de una conversación
 * (participantes explícitos + miembros por rol de la BD).
 * @returns {Promise<string[]>} Array de ObjectId strings
 */
async function obtenerDestinatarios(conversacion) {
  const ids = new Set();
  for (const p of conversacion.participantes || []) {
    if (p.usuario) ids.add(p.usuario.toString());
  }
  // Canales por rol: buscar usuarios con esos roles
  if (conversacion.rolesPermitidos?.length) {
    const Mozos = mongoose.models.Mozo || require('../database/models/mozos.model');
    const usuariosRol = await Mozos.find({
      rol: { $in: conversacion.rolesPermitidos },
      activo: { $ne: false }
    }).select('_id').lean();
    for (const u of usuariosRol) {
      ids.add(u._id.toString());
    }
  }
  return Array.from(ids);
}

/**
 * Crea un mensaje, actualiza la conversación (preview), emite sockets y
 * opcionalmente crea Notificacion + push.
 *
 * @param {object} params
 * @param {string} params.conversacionId
 * @param {string} params.remitenteId
 * @param {string} params.remitenteNombre
 * @param {string} params.remitenteRol
 * @param {string[]} params.remitentePermisos
 * @param {'texto'|'voz'} params.tipoContenido
 * @param {string} params.texto
 * @param {string} [params.prioridadCodigo='normal']
 * @param {object} [params.audio] - { url, duracionMs, mimeType, tamanioBytes }
 * @param {string} [params.entidadTipo]
 * @param {string} [params.entidadId]
 * @returns {Promise<{mensaje: object, conversacion: object, destinatarios: string[], warning?: string}>}
 */
async function crearMensaje(params) {
  const {
    conversacionId, remitenteId, remitenteNombre, remitenteRol, remitentePermisos,
    tipoContenido, texto, prioridadCodigo = 'normal', audio = null,
    entidadTipo = null, entidadId = null, respuestaA = null
  } = params;

  const conversacion = await Conversacion.findById(conversacionId);
  if (!conversacion) throw new Error('Conversación no encontrada');
  if (!conversacion.activo) throw new Error('Conversación archivada');

  // Validar acceso del remitente
  if (!usuarioPuedeAccederConversacion(remitenteId, remitenteRol, conversacion)) {
    throw new Error('No tiene acceso a esta conversación');
  }

  // Validar prioridad
  const prioridad = validarPrioridad(remitenteRol, remitentePermisos, prioridadCodigo);
  if (!prioridad.ok) {
    const err = new Error(prioridad.error || 'Prioridad no permitida');
    err.statusCode = 403;
    throw err;
  }

  // Crear mensaje con estado 'enviado' y respuestaA opcional
  const mensaje = await Mensaje.create({
    conversacionId: conversacion._id,
    remitenteId,
    tipoContenido,
    texto: (texto || '').slice(0, 2000),
    prioridad: prioridad.valor,
    prioridadCodigo: prioridad.codigo,
    audio: audio || undefined,
    entidadTipo,
    entidadId,
    respuestaA: respuestaA || undefined,
    estado: 'enviado'
  });

  // Preview
  const previewRaw = tipoContenido === 'voz'
    ? '🎤 Nota de voz'
    : (texto || '').slice(0, 120);

  conversacion.ultimoMensajeAt = new Date();
  conversacion.ultimoMensajePreview = previewRaw;
  conversacion.ultimoMensajeRemitente = remitenteId;
  await conversacion.save();

  // Destinatarios (sin incluir al remitente para sockets/notif)
  const destinatarios = (await obtenerDestinatarios(conversacion))
    .filter(id => id !== remitenteId?.toString?.());

  // Incrementar contador noLeidos por participante (desnormalización para inbox rápido)
  await incrementarNoLeidos(conversacion._id, destinatarios);

  // Emit sockets a rooms personales de cada destinatario (estado: entregado)
  emitMensajeAParticipantes(destinatarios, mensaje, conversacion);
  // Marcar como entregado a esos destinatarios (asumimos socket emit = entregado)
  await marcarEntregadoA(mensaje._id, destinatarios);

  // Notificacion + push si prioridad >= normal y hay destinatarios
  if (prioridad.valor >= 5 && destinatarios.length > 0) {
    try {
      await crearNotificacionMensaje(conversacion, mensaje, remitenteNombre, destinatarios, prioridad.codigo);
      await sendPushMensajes(destinatarios, mensaje, conversacion, remitenteNombre, prioridad.codigo);
    } catch (e) {
      logger.warn('[mensajería] Error creando notificación/push', { error: e.message });
    }
  }

  const result = { mensaje, conversacion, destinatarios };
  if (prioridad.warning) result.warning = prioridad.warning;
  return result;
}

/**
 * Incrementa el contador noLeidos de cada participante en una conversación.
 * Usa update atómico por cada participante para no sobreescribir otros campos.
 */
async function incrementarNoLeidos(conversacionId, destinatarioIds) {
  if (!destinatarioIds?.length) return;
  const id = new mongoose.Types.ObjectId(conversacionId);
  for (const uid of destinatarioIds) {
    try {
      await Conversacion.updateOne(
        { _id: id, 'participantes.usuario': uid },
        { $inc: { 'participantes.$.noLeidos': 1 } }
      );
    } catch (_) { /* participante no listado, ignorar */ }
  }
}

/**
 * Marca un mensaje como entregado a una lista de destinatarios (socket emit).
 */
async function marcarEntregadoA(mensajeId, destinatarioIds) {
  if (!destinatarioIds?.length) return;
  const entradas = destinatarioIds.map(uid => ({
    usuario: uid,
    at: new Date()
  }));
  try {
    await Mensaje.updateOne(
      { _id: mensajeId },
      { $addToSet: { entregadoA: { $each: entradas } }, $set: { estado: 'entregado' } }
    );
    // Emitir `mensaje:entregado` al remitente (para doble check gris en su UI)
    const io = global.io;
    const mensaje = await Mensaje.findById(mensajeId).lean();
    if (io && mensaje) {
      const remitenteId = mensaje.remitenteId?.toString?.();
      const ns = io.of('/mozos'); if (ns && remitenteId) ns.to(`mozo-${remitenteId}`).emit('mensaje:entregado', { mensajeId, conversacionId: mensaje.conversacionId, entregadoA: destinatarioIds });
      const ns2 = io.of('/admin'); if (ns2 && remitenteId) ns2.to(`user-${remitenteId}`).emit('mensaje:entregado', { mensajeId, conversacionId: mensaje.conversacionId, entregadoA: destinatarioIds });
      const ns3 = io.of('/cocina'); if (ns3 && remitenteId) ns3.to(`cocinero-${remitenteId}`).emit('mensaje:entregado', { mensajeId, conversacionId: mensaje.conversacionId, entregadoA: destinatarioIds });
    }
  } catch (e) {
    logger.warn('[mensajería] Error marcando entregado', { error: e.message });
  }
}

/**
 * Emite `mensaje:typing` a los demás participantes de una conversación.
 * El cliente emite `typing` al servidor; el server difunde `mensaje:typing`.
 */
function emitTyping(conversacionId, remitenteId, remitenteNombre, conversacionRolesPermitidos = []) {
  const io = global.io;
  if (!io) return;
  // Obtener participantes desde la conversación
  Conversacion.findById(conversacionId).select('participantes rolesPermitidos').lean().then(conv => {
    if (!conv) return;
    const ids = (conv.participantes || [])
      .map(p => p.usuario?.toString?.())
      .filter(id => id && id !== remitenteId?.toString?.());
    const payload = { conversacionId, remitenteId, remitenteNombre, timestamp: Date.now() };
    for (const id of ids) {
      if (io.of('/mozos')) io.of('/mozos').to(`mozo-${id}`).emit('mensaje:typing', payload);
      if (io.of('/admin')) io.of('/admin').to(`user-${id}`).emit('mensaje:typing', payload);
      if (io.of('/cocina')) io.of('/cocina').to(`cocinero-${id}`).emit('mensaje:typing', payload);
    }
    // Para canales por rol, también emitir al room de rol aproximado (losadmins/sups ya están como participantes o por su rol)
    for (const rol of conv.rolesPermitidos || []) {
      if (io.of('/admin')) io.of('/admin').to(`rol-${rol}`).emit('mensaje:typing', payload);
    }
  });
}

/**
 * Emite el evento socket 'mensaje:nuevo' a los destinatarios.
 * Usa global.io (3 namespaces) para intentar llegar al destinatario en la app que tenga abierta.
 */
function emitMensajeAParticipantes(destinatarioIds, mensaje, conversacion) {
  const io = global.io;
  if (!io) return;

  const payload = {
    mensajeId: mensaje._id,
    conversacionId: conversacion._id,
    tipoConversacion: conversacion.tipo,
    titulo: conversacion.titulo,
    remitenteId: mensaje.remitenteId,
    tipoContenido: mensaje.tipoContenido,
    texto: mensaje.texto,
    prioridad: mensaje.prioridad,
    prioridadCodigo: mensaje.prioridadCodigo,
    audio: mensaje.audio,
    entidadTipo: mensaje.entidadTipo,
    entidadId: mensaje.entidadId,
    createdAt: mensaje.createdAt
  };

  for (const id of destinatarioIds) {
    // Rooms personales: mozo-{id}, cocinero-{id}, user-{id}
    if (io.of('/mozos')) io.of('/mozos').to(`mozo-${id}`).emit('mensaje:nuevo', payload);
    if (io.of('/cocina')) io.of('/cocina').to(`cocinero-${id}`).emit('mensaje:nuevo', payload);
    if (io.of('/admin')) io.of('/admin').to(`user-${id}`).emit('mensaje:nuevo', payload);
  }
  // Room de conversación (clientes que hicieron join-conversacion)
  if (io.of('/admin')) io.of('/admin').to(`conv-${conversacion._id}`).emit('mensaje:nuevo', payload);
  if (io.of('/cocina')) io.of('/cocina').to(`conv-${conversacion._id}`).emit('mensaje:nuevo', payload);
  if (io.of('/mozos')) io.of('/mozos').to(`conv-${conversacion._id}`).emit('mensaje:nuevo', payload);
}

/**
 * Crea una Notificacion (tipo 'mensaje') dirigida.
 * Una por destinatario para tracking de leído individual.
 */
async function crearNotificacionMensaje(conversacion, mensaje, remitenteNombre, destinatarios, prioridadCodigo) {
  const prioridadValor = PRIORIDADES[prioridadCodigo] ?? 5;
  const titulo = conversacion.tipo === 'directo'
    ? (remitenteNombre || 'Mensaje directo')
    : `${remitenteNombre || 'Sistema'} → ${conversacion.titulo || 'Chat'}`;
  const body = mensaje.tipoContenido === 'voz'
    ? '🎤 Nota de voz'
    : (mensaje.texto || '').slice(0, 100);

  const docs = destinatarios.map(uid => ({
    tipo: 'mensaje',
    titulo,
    mensaje: body,
    icono: prioridadValor >= 9 ? '📢' : (prioridadValor >= 7 ? '⚠️' : '💬'),
    entidadId: mensaje._id,
    entidadTipo: 'mensaje',
    destinatario: uid,
    rolesDestinatarios: [],
    accion: {
      tipo: 'navegar',
      url: `?abrirChat=1&c=${conversacion._id}`,
      datos: { conversacionId: conversacion._id, mensajeId: mensaje._id, prioridad: prioridadValor }
    },
    prioridad: prioridadValor,
    generadoPor: mensaje.remitenteId,
    metadata: { conversacionId: conversacion._id, mensajeId: mensaje._id }
  }));

  await Notificacion.insertMany(docs);

  // Emitir 'nueva-notificacion' al namespace admin para refrescar dashboard
  const io = global.io;
  if (io?.of?.('/admin')) {
    for (const uid of destinatarios) {
      io.of('/admin').to(`user-${uid}`).emit('nueva-notificacion', {
        tipo: 'mensaje', titulo, mensaje: body, prioridad: prioridadValor,
        conversacionId: conversacion._id
      });
    }
  }
}

/**
 * Envía push (Expo) a destinatarios que sean mozos con pushToken.
 * Reusa sendPushToMozos del servicio de push existente.
 */
async function sendPushMensajes(destinatarios, mensaje, conversacion, remitenteNombre, prioridadCodigo) {
  try {
    const { sendPushToMozos } = require('./pushNotifications');
    const prio = prioridadCodigo === 'critica' || prioridadCodigo === 'urgente';
    await sendPushToMozos(destinatarios, {
      title: `💬 ${remitenteNombre || 'Mensaje'} — ${conversacion.titulo || ''}`,
      body: mensaje.tipoContenido === 'voz' ? '🎤 Nota de voz' : (mensaje.texto || '').slice(0, 100),
      data: {
        tipo: 'mensaje',
        conversacionId: conversacion._id?.toString?.(),
        mensajeId: mensaje._id?.toString?.(),
        prioridad: mensaje.prioridad
      },
      channelId: prio ? 'mensajes-urgentes' : 'mensajes'
    });
  } catch (e) {
    logger.warn('[mensajería] Push no enviado', { error: e.message });
  }
}

/**
 * Marca mensajes de una conversación como leídos por un usuario.
 * Actualiza ultimoLeidoAt del participante.
 */
async function marcarLeidosConversacion(conversacionId, usuarioId, hastaMensajeId = null) {
  const conversacion = await Conversacion.findById(conversacionId);
  if (!conversacion) return;

  // Actualizar participantes: ultimoLeidoAt + reset noLeidos
  const partIdx = (conversacion.participantes || []).findIndex(
    p => p.usuario?.toString?.() === usuarioId?.toString?.()
  );
  if (partIdx >= 0) {
    conversacion.participantes[partIdx].ultimoLeidoAt = new Date();
    conversacion.participantes[partIdx].noLeidos = 0;
    await conversacion.save();
  }

  // Marcar como leídos en Mensaje (solo los del remitente != usuario)
  await Mensaje.updateMany(
    {
      conversacionId,
      remitenteId: { $ne: usuarioId },
      'leidoPor.usuario': { $ne: usuarioId },
      createdAt: { $lte: new Date() }
    },
    { $addToSet: { leidoPor: { usuario: usuarioId, at: new Date() } }, $set: { estado: 'leido' } }
  );

  // Emitir `mensaje:leido` al remitente original (para doble check azul)
  try {
    const io = global.io;
    if (io) {
      const ultimo = await Mensaje.findOne({
        conversacionId, remitenteId: { $ne: usuarioId }
      }).sort({ createdAt: -1 }).select('remitenteId conversacionId').lean();
      if (ultimo) {
        const remId = ultimo.remitenteId?.toString?.();
        const payload = { conversacionId, leidoPor: usuarioId, mensajeIdHasta: hastaMensajeId || null };
        if (io.of('/mozos')) io.of('/mozos').to(`mozo-${remId}`).emit('mensaje:leido', payload);
        if (io.of('/admin')) io.of('/admin').to(`user-${remId}`).emit('mensaje:leido', payload);
        if (io.of('/cocina')) io.of('/cocina').to(`cocinero-${remId}`).emit('mensaje:leido', payload);
      }
    }
  } catch (_) { /* no crítico */ }

  return { ok: true };
}

/**
 * Silencia o deja de silenciar una conversación para un usuario.
 */
async function setSilenciado(conversacionId, usuarioId, silenciado) {
  const res = await Conversacion.updateOne(
    { _id: conversacionId, 'participantes.usuario': usuarioId },
    { $set: { 'participantes.$.silenciado': !!silenciado } }
  );
  return res;
}

/**
 * Fija (pineado) o despinja una conversación para un usuario.
 */
async function setPineado(conversacionId, usuarioId, pineado) {
  const set = { 'participantes.$.pineado': !!pineado };
  if (pineado) set['participantes.$.pineadoEn'] = new Date();
  else set['participantes.$.pineadoEn'] = null;
  const res = await Conversacion.updateOne(
    { _id: conversacionId, 'participantes.usuario': usuarioId },
    { $set: set }
  );
  return res;
}

/**
 * Archiva o desarchiva una conversación para un usuario (oculta de la lista principal).
 */
async function setArchivado(conversacionId, usuarioId, archivado) {
  const res = await Conversacion.updateOne(
    { _id: conversacionId, 'participantes.usuario': usuarioId },
    { $set: { 'participantes.$.archivado': !!archivado } }
  );
  return res;
}

/**
 * Ancla un mensaje globalmente en la conversación.
 */
async function anclarMensaje(conversacionId, mensajeId, usuarioId) {
  return await Conversacion.updateOne(
    { _id: conversacionId },
    { $addToSet: { anclados: { mensajeId, ancladoPor: usuarioId, ancladoEn: new Date() } } }
  );
}

async function desanclarMensaje(conversacionId, mensajeId) {
  return await Conversacion.updateOne(
    { _id: conversacionId },
    { $pull: { anclados: { mensajeId } } }
  );
}

/**
 * Archiva (o reabre) un canal a nivel global (activo=false/true).
 * Requiere gestionar-canales-mensajes (validado en el controller).
 */
async function setCanalActivo(conversacionId, activo) {
  return await Conversacion.updateOne(
    { _id: conversacionId, tipo: 'canal' },
    { $set: { activo: !!activo } }
  );
}

/**
 * Añade o quita roles de un canal.
 */
async function actualizarRolesCanal(conversacionId, rolesPermitidos) {
  return await Conversacion.updateOne(
    { _id: conversacionId, tipo: 'canal' },
    { $set: { rolesPermitidos: rolesPermitidos || [] } }
  );
}

/**
 * Crea o recupera un DM entre dos usuarios (canal directo).
 */
async function obtenerOCrearDM(usuarioAId, usuarioBId) {
  const ids = [usuarioAId, usuarioBId].sort((a, b) =>
    a.toString().localeCompare(b.toString())
  );

  // Buscar conversación existente
  let conv = await Conversacion.findOne({
    tipo: 'directo',
    'participantes.usuario': { $all: ids },
    activo: true
  });

  if (conv) return conv;

  // Crear
  conv = await Conversacion.create({
    tipo: 'directo',
    participantes: [
      { usuario: usuarioAId },
      { usuario: usuarioBId }
    ],
    creadoPor: usuarioAId,
    ultimoMensajeAt: new Date()
  });

  return conv;
}

/**
 * Crea las conversaciones semilla (canales) si aún no existen.
 */
async function seedCanales(creadoPor = null) {
  const resultados = [];
  for (const seed of CANALES_SEED) {
    const existe = await Conversacion.findOne({ tipo: 'canal', titulo: seed.titulo, activo: true });
    if (!existe) {
      const conv = await Conversacion.create({
        tipo: 'canal',
        titulo: seed.titulo,
        rolesPermitidos: seed.rolesPermitidos,
        creadoPor,
        ultimoMensajeAt: new Date()
      });
      resultados.push(conv);
    }
  }
  if (resultados.length) {
    logger.info('[mensajería] Canales semilla creados', { cantidad: resultados.length });
  }
  return resultados;
}

module.exports = {
  PRIORIDADES,
  PRIORIDAD_A_CODIGO,
  CAP_PRIORIDAD_ROL,
  CANALES_SEED,
  validarPrioridad,
  usuarioPuedeAccederConversacion,
  obtenerDestinatarios,
  crearMensaje,
  incrementarNoLeidos,
  marcarEntregadoA,
  emitTyping,
  marcarLeidosConversacion,
  setSilenciado,
  setPineado,
  setArchivado,
  anclarMensaje,
  desanclarMensaje,
  setCanalActivo,
  actualizarRolesCanal,
  obtenerOCrearDM,
  seedCanales
};