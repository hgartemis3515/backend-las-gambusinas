/**
 * Alerta Service — Backend Las Gambusinas
 *
 * Lógica de negocio para Alertas operativas (overlay forzado con duración/color/sonido):
 *  - Validación de permisos (enviar-anuncios, forzar-prioridad-mensajes)
 *  - Resolución de destinatarios (todos, roles, usuarios, cocineras → pantallas)
 *  - Persistencia (colección Alerta)
 *  - Entrega realtime a rooms personales (mozo-{id}, cocinero-{id}, user-{id})
 *    y rooms de pantallas de cocina (pantalla-{N}) — incluso en modo monitor (TVs).
 *
 * Eventos socket:
 *  - alerta:nueva      (server → client) — overlay en destinos
 *  - alerta:cancelada  (server → client) — cierra overlays activos
 *  - alerta:ack        (client → server) — el destino confirmó haberla visto
 *
 * Referencia: docs/PLAN_CHAT_GRUPAL_Y_ALERTAS.md
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const Alerta = require('../database/models/alerta.model');
const PantallaCocina = require('../database/models/pantallaCocina.model');
const { PRIORIDADES, PRIORIDAD_A_CODIGO } = require('./mensajeriaService');

// Catálogo de sonidos disponibles para las alertas. Las apps deben tener assets
// equivalentes a estas claves (v1: las apps reproducen localmente).
const ALERTA_SONIDOS = [
  { clave: 'beep',        label: 'Beep corto',        defaultDuracionMs: 15000 },
  { clave: 'doble-beep',  label: 'Doble beep',        defaultDuracionMs: 15000 },
  { clave: 'sirena',      label: 'Sirena (loop)',     defaultDuracionMs: 20000 },
  { clave: 'chime',       label: 'Campana suave',     defaultDuracionMs: 10000 },
  { clave: 'silencio',    label: 'Sin sonido',        defaultDuracionMs: 15000 }
];

const ALERTA_COLORES_PRESET = [
  { clave: 'info',      hex: '#3498db', label: 'Azul (info)' },
  { clave: 'atencion',  hex: '#f39c12', label: 'Naranja (atención)' },
  { clave: 'urgente',   hex: '#e74c3c', label: 'Rojo (urgente)' },
  { clave: 'critica',   hex: '#c0392b', label: 'Rojo oscuro (crítica)' },
  { clave: 'ok',        hex: '#27ae60', label: 'Verde (ok)' }
];

const DEFAULTS = {
  duracionMs: 15000,
  duracionMinMs: 1000,
  duracionMaxMs: 120000,
  colorHex: '#e74c3c',
  sonidoClave: 'sirena'
};

/**
 * Convierte un id a ObjectId si es un hex válido de 24 chars; si no, lo deja
 * como string. Permite que el servicio sea robusto tanto en producción (IDs
 * reales de Mongo) como en tests con ids simbólicos.
 */
function toObjectIdOrString(id) {
  try {
    if (mongoose.Types.ObjectId.isValid(String(id)) && String(id).length === 24) {
      return new mongoose.Types.ObjectId(String(id));
    }
  } catch (_) { /* noop */ }
  return id;
}

/**
 * Normaliza el body de creación de alerta aplicando defaults de catálogo.
 */
function normalizarEstilo(estilo = {}, prioridadCodigo) {
  const duracionMs = Math.min(
    Math.max(parseInt(estilo.duracionMs, 10) || DEFAULTS.duracionMs, DEFAULTS.duracionMinMs),
    DEFAULTS.duracionMaxMs
  );

  let colorHex = estilo.colorHex || DEFAULTS.colorHex;
  // Si vino un preset (info/atencion/...) resolver a hex
  const preset = ALERTA_COLORES_PRESET.find(p => p.clave === colorHex || p.clave === estilo.colorPreset);
  if (preset) colorHex = preset.hex;

  let sonidoClave = estilo.sonidoClave || DEFAULTS.sonidoClave;
  if (!ALERTA_SONIDOS.some(s => s.clave === sonidoClave)) {
    sonidoClave = DEFAULTS.sonidoClave;
  }

  return {
    duracionMs,
    colorHex,
    sonidoClave,
    requiereAck: !!estilo.requiereAck
  };
}

/**
 * Resuelve targeting -> objeto con:
 *   - usuarioIds: [] (ObjectId strings destinatarios humanos)
 *   - numerosPantalla: [] (TVs destino, ya resueltos)
 *
 * Si modo='todos', devuelve flags para emitir a namespaces completos.
 */
async function resolverTargeting(targeting = {}) {
  const modo = targeting.modo === 'todos' || targeting.todos ? 'todos' : 'seleccion';
  const out = {
    todos: modo === 'todos',
    usuarioIds: new Set(),
    numerosPantalla: new Set(),
    roles: targeting.roles || []
  };

  // Usuarios explícitos
  for (const u of targeting.usuarios || []) {
    if (u) out.usuarioIds.add(String(u));
  }
  // Cocineras explícitas -> añade como usuarias y resuelve sus pantallas
  for (const c of targeting.cocineras || []) {
    if (c) {
      out.usuarioIds.add(String(c));
    }
  }
  // Pantallas explícitas por número
  for (const n of targeting.numerosPantalla || []) {
    if (n) out.numerosPantalla.add(Number(n));
  }

  // Resolver PantallaCocina -> cocineroId y numeroPantalla
  // (caso clave: admin elige a Martha; backend resuelve su TV)
  const query = { activo: true };
  const cocineraIds = (targeting.cocineras || []).filter(Boolean).map(String);
  const numeros = (targeting.numerosPantalla || []).filter(Boolean).map(Number);

  if (modo === 'todos') {
    // No filtramos por cocinera: todas las pantallas activas
  } else if (cocineraIds.length && numeros.length) {
    query.$or = [
      { cocineroId: { $in: cocineraIds.map(toObjectIdOrString) } },
      { numeroPantalla: { $in: numeros } }
    ];
  } else if (cocineraIds.length) {
    query.cocineroId = { $in: cocineraIds.map(toObjectIdOrString) };
  } else if (numeros.length) {
    query.numeroPantalla = { $in: numeros };
  } else if (out.roles.length) {
    // Targeting por rol: resolvemos usuarios con ese rol abajo, no aquí pantallas
  } else if (!out.usuarioIds.size) {
    // Sin destinatarios explícitos y no es "todos": no resolvemos pantallas
    return {
      todos: false,
      usuarioIds: [],
      numerosPantalla: [],
      roles: out.roles
    };
  }

  // Si hay query útil, buscar pantallas; si es "todos", también
  if (modo === 'todos' || cocineraIds.length || numeros.length) {
    const pantallas = await PantallaCocina.find(query).select('numeroPantalla cocineroId').lean();
    for (const p of pantallas) {
      if (p.numeroPantalla) out.numerosPantalla.add(Number(p.numeroPantalla));
      if (p.cocineroId) out.usuarioIds.add(String(p.cocineroId));
    }
  }

  // Roles -> resolver usuarios (para emitir a rooms personales)
  if (out.roles.length) {
    const Mozos = mongoose.models.Mozo || require('../database/models/mozos.model');
    const users = await Mozos.find({ rol: { $in: out.roles }, activo: { $ne: false } }).select('_id').lean();
    for (const u of users) out.usuarioIds.add(String(u._id));
  }

  // En modo "todos" resolver también todos los usuarios activos (para rooms personales)
  if (modo === 'todos') {
    const Mozos = mongoose.models.Mozo || require('../database/models/mozos.model');
    const users = await Mozos.find({ activo: { $ne: false } }).select('_id rol').lean();
    for (const u of users) out.usuarioIds.add(String(u._id));
    const pantallas = await PantallaCocina.find({ activo: true }).select('numeroPantalla').lean();
    for (const p of pantallas) out.numerosPantalla.add(Number(p.numeroPantalla));
  }

  return {
    todos: out.todos,
    usuarioIds: Array.from(out.usuarioIds),
    numerosPantalla: Array.from(out.numerosPantalla),
    roles: out.roles
  };
}

/**
 * Crea y emite una alerta.
 *
 * @param {object} params
 * @param {string} params.remitenteId
 * @param {string} params.remitenteNombre
 * @param {string} params.texto
 * @param {string} [params.prioridadCodigo='urgente']
 * @param {object} [params.targeting]
 * @param {object} [params.estilo]
 * @returns {Promise<{alerta: object, resolucion: object, warning?: string}>}
 */
async function crearAlerta(params) {
  const {
    remitenteId, remitenteNombre,
    texto, prioridadCodigo = 'urgente',
    targeting = {}, estilo = {}
  } = params;

  if (!texto || !texto.trim()) throw new Error('texto requerido');

  // Prioridad válida
  const valor = PRIORIDADES[prioridadCodigo];
  if (valor == null) throw new Error(`Prioridad inválida: ${prioridadCodigo}`);

  const estiloNormalizado = normalizarEstilo(estilo, prioridadCodigo);
  const ahora = new Date();
  const expiraAt = new Date(ahora.getTime() + estiloNormalizado.duracionMs);

  const resolucion = await resolverTargeting(targeting);

  if (!resolucion.todos && !resolucion.usuarioIds.length && !resolucion.numerosPantalla.length) {
    throw new Error('La alerta no tiene destinatarios válidos');
  }

  const alerta = await Alerta.create({
    texto: texto.trim().slice(0, 500),
    creadoPor: remitenteId,
    creadoPorNombre: remitenteNombre || '',
    targeting: {
      modo: resolucion.todos ? 'todos' : 'seleccion',
      todos: resolucion.todos,
      roles: resolucion.roles,
      usuarios: resolucion.usuarioIds,
      cocineras: (targeting.cocineras || []).filter(Boolean),
      numerosPantalla: resolucion.numerosPantalla
    },
    estilo: estiloNormalizado,
    prioridad: valor,
    prioridadCodigo,
    estado: 'activa',
    emitidaAt: ahora,
    expiraAt,
    activo: true
  });

  emitAlerta(alerta, resolucion);

  return { alerta, resolucion };
}

/**
 * Emite `alerta:nueva` a las rooms correspondientes.
 * Rooms personales: mozo-{id} / cocinero-{id} / user-{id}
 * Rooms de TV:       pantalla-{N} (en namespace /cocina)
 *
 * El payload incluye el documento de alerta (sin acks pesados).
 */
function emitAlerta(alerta, resolucion) {
  const io = global.io;
  if (!io) {
    logger.warn('[alertas] global.io no disponible; la alerta se persistió pero no se emitió');
    return;
  }

  const payload = {
    alertaId: alerta._id,
    texto: alerta.texto,
    creadoPor: alerta.creadoPor,
    creadoPorNombre: alerta.creadoPorNombre,
    prioridad: alerta.prioridad,
    prioridadCodigo: alerta.prioridadCodigo,
    estilo: alerta.estilo,
    targeting: {
      todos: !!resolucion.todos,
      roles: resolucion.roles
    },
    emitidaAt: alerta.emitidaAt,
    expiraAt: alerta.expiraAt
  };

  // Caso "todos": emit a los 3 namespaces completos
  if (resolucion.todos) {
    if (io.of('/mozos')) io.of('/mozos').emit('alerta:nueva', payload);
    if (io.of('/cocina')) io.of('/cocina').emit('alerta:nueva', payload);
    if (io.of('/admin')) io.of('/admin').emit('alerta:nueva', payload);
    return;
  }

  // Rooms personales por usuario (cubre sesiones humanas en moz/cocina/admin)
  for (const uid of resolucion.usuarioIds) {
    if (io.of('/mozos')) io.of('/mozos').to(`mozo-${uid}`).emit('alerta:nueva', payload);
    if (io.of('/cocina')) io.of('/cocina').to(`cocinero-${uid}`).emit('alerta:nueva', payload);
    if (io.of('/admin')) io.of('/admin').to(`user-${uid}`).emit('alerta:nueva', payload);
  }

  // Rooms de pantallas de cocina (TVs/kiosk, incluso sin FAB de chat)
  for (const n of resolucion.numerosPantalla) {
    if (io.of('/cocina')) io.of('/cocina').to(`pantalla-${n}`).emit('alerta:nueva', payload);
  }
}

/**
 * Cancela una alerta activa y emite `alerta:cancelada` a sus destinos.
 */
async function cancelarAlerta(alertaId, canceladoPor) {
  const alerta = await Alerta.findById(alertaId);
  if (!alerta) throw new Error('Alerta no encontrada');
  if (alerta.estado !== 'activa') return { alerta, yaCancelada: true };

  alerta.estado = 'cancelada';
  alerta.canceladaAt = new Date();
  if (canceladoPor) alerta.canceladaPor = canceladoPor;
  await alerta.save();

  emitCancelacion(alerta);
  return { alerta };
}

function emitCancelacion(alerta) {
  const io = global.io;
  if (!io) return;
  const payload = { alertaId: alerta._id };

  if (alerta.targeting?.todos) {
    if (io.of('/mozos')) io.of('/mozos').emit('alerta:cancelada', payload);
    if (io.of('/cocina')) io.of('/cocina').emit('alerta:cancelada', payload);
    if (io.of('/admin')) io.of('/admin').emit('alerta:cancelada', payload);
    return;
  }

  for (const uid of alerta.targeting?.usuarios || []) {
    const id = String(uid);
    if (io.of('/mozos')) io.of('/mozos').to(`mozo-${id}`).emit('alerta:cancelada', payload);
    if (io.of('/cocina')) io.of('/cocina').to(`cocinero-${id}`).emit('alerta:cancelada', payload);
    if (io.of('/admin')) io.of('/admin').to(`user-${id}`).emit('alerta:cancelada', payload);
  }
  for (const n of alerta.targeting?.numerosPantalla || []) {
    if (io.of('/cocina')) io.of('/cocina').to(`pantalla-${n}`).emit('alerta:cancelada', payload);
  }
}

/**
 * Marca ack de un usuario o pantalla. No cambia el estado global de la alerta
 * (sigue activa para los demás) — solo registra para auditoría.
 */
async function ackAlerta(alertaId, { usuarioId = null, numeroPantalla = null } = {}) {
  const entrada = { en: new Date() };
  if (usuarioId) entrada.usuario = usuarioId;
  if (numeroPantalla) entrada.numeroPantalla = numeroPantalla;

  await Alerta.updateOne(
    { _id: alertaId },
    { $addToSet: { acks: entrada } }
  );
  return { ok: true };
}

/**
 * Marca como expiradas todas las alertas activas que ya pasaron expiraAt.
 * Llamar periódicamente (job o en cada GET /activas).
 */
async function expirarVencidas() {
  try {
    const res = await Alerta.updateMany(
      { estado: 'activa', expiraAt: { $lte: new Date() } },
      { $set: { estado: 'expirada' } }
    );
    if (res?.modified) {
      logger.info('[alertas] Alertas expiradas', { cantidad: res.modified });
    }
    return res;
  } catch (e) {
    logger.warn('[alertas] Error expirando', { error: e.message });
    return null;
  }
}

/**
 * Devuelve alertas activas dirigidas a un destinatario concreto:
 *  - usuarioId: aparece en targeting.usuarios, o targeting.todos, o tiene rol en targeting.roles
 *  - numeroPantalla: aparece en targeting.numerosPantalla, o targeting.todos
 *
 * Se usa para recuperar overlays tras reconexión.
 */
async function alertasActivasPara({ usuarioId = null, rol = null, numeroPantalla = null } = {}) {
  await expirarVencidas();

  const or = [];
  if (usuarioId) {
    or.push({ 'targeting.todos': true });
    or.push({ 'targeting.usuarios': usuarioId });
  }
  if (numeroPantalla) {
    or.push({ 'targeting.todos': true });
    or.push({ 'targeting.numerosPantalla': numeroPantalla });
  }
  if (rol) {
    or.push({ 'targeting.roles': rol });
  }
  if (!or.length) return [];

  return await Alerta.find({
    estado: 'activa',
    expiraAt: { $gt: new Date() },
    $or: or
  })
    .sort({ emitidaAt: -1 })
    .limit(10)
    .lean();
}

module.exports = {
  ALERTA_SONIDOS,
  ALERTA_COLORES_PRESET,
  DEFAULTS,
  PRIORIDADES,
  normalizarEstilo,
  resolverTargeting,
  crearAlerta,
  cancelarAlerta,
  ackAlerta,
  expirarVencidas,
  alertasActivasPara
};
