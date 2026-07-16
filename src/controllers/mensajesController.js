/**
 * MENSAJES CONTROLLER
 * Sistema de mensajería interna (texto + voz) — reemplaza stub anterior.
 *
 * Jerarquía de permisos:
 *  - ver-mensajes: abrir inbox/canales
 *  - enviar-mensajes: escribir texto
 *  - enviar-mensajes-voz: grabar/subir audio
 *  - enviar-anuncios: broadcasts
 *  - gestionar-canales-mensajes: crear/editar canales
 *  - forzar-prioridad-mensajes: usar urgente/critica
 *  - ver-mensajes-todos: supervisor (compliance)
 *
 * Entidades:
 *  - Conversacion (directo | canal | anuncio)
 *  - Mensaje (texto | voz | sistema)
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { adminAuth, checkPermission } = require('../middleware/adminAuth');
const rolesRepository = require('../repository/roles.repository');
const Conversacion = require('../database/models/conversacion.model');
const Mensaje = require('../database/models/mensaje.model');
const Mozos = require('../database/models/mozos.model');
const mensajeriaService = require('../services/mensajeriaService');

// Auth en todas las rutas
router.use(adminAuth);

// Configuración multer para audio de voz
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'mensajes');
if (!fs.existsSync(UPLOAD_DIR)) {
  try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (_) { /* ya existe */ }
}

const MAX_DURACION_MS = 60 * 1000; // 60 s
const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // 2 MB
const MIME_AUDIO_PERMITIDOS = ['audio/mp4', 'audio/m4a', 'audio/webm', 'audio/ogg', 'audio/aac'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (file.originalname || '').split('.').pop() || 'm4a';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_AUDIO_BYTES },
  fileFilter: (req, file, cb) => {
    const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
    if (MIME_AUDIO_PERMITIDOS.includes(mime) || mime.startsWith('audio/')) return cb(null, true);
    // Algunos móviles envían application/octet-stream
    if (mime === 'application/octet-stream' && /\.(webm|m4a|mp4|ogg|aac|mp3)$/i.test(file.originalname || '')) {
      return cb(null, true);
    }
    return cb(new Error(`Mime no permitido: ${file.mimetype}`));
  }
});

// Helper: extrae info del token JWT
function userInfo(req) {
  const admin = req.admin || {};
  return {
    id: admin.id || admin._id || admin.userId,
    rol: admin.rol || '',
    permisos: admin.permisos || [],
    name: admin.name || admin.nombre || 'Usuario'
  };
}

// Helper: valida permiso (con fallback a BD)
async function tienePermiso(user, permiso) {
  if (user.rol === 'admin') return true;
  if (user.permisos.includes(permiso)) return true;
  try {
    return await rolesRepository.tienePermiso(user.id, permiso);
  } catch {
    return false;
  }
}

/**
 * GET /api/mensajes/conversaciones
 * Devuelve inbox del usuario (DMs + canales por rol + anuncios visibles).
 * Query: soloNoLeidos=true|false, tipo=directo|canal|anuncio
 */
router.get('/mensajes/conversaciones', async (req, res) => {
  try {
    const user = userInfo(req);
    if (!(await tienePermiso(user, 'ver-mensajes'))) {
      return res.status(403).json({ error: 'Sin permiso: ver-mensajes' });
    }

    const { soloNoLeidos = 'false', tipo } = req.query;
    const userId = user.id;
    const rol = user.rol;

    // Query: conversaciones donde es participante O canal por rol O admin/supervisor (ver todos)
    const or = [
      { 'participantes.usuario': userId },
      { rolesPermitidos: rol }
    ];
    if (rol === 'admin' || rol === 'supervisor') {
      // admin/supervisor ven todos los canales/anuncios
      or.push({ tipo: { $in: ['canal', 'anuncio'] } });
    }

    const query = { activo: true, $or: or };
    if (tipo) query.tipo = tipo;

    const conversaciones = await Conversacion.find(query)
      .sort({ ultimoMensajeAt: -1 })
      .populate('ultimoMensajeRemitente', 'name rol')
      .populate('participantes.usuario', 'name rol')
      .lean();

    // Mapear usando flags del participante (noLeidos desnormalizado, pineado, silenciado, archivado)
    const result = [];
    for (const c of conversaciones) {
      const part = (c.participantes || []).find(p => {
        const pid = p.usuario?._id || p.usuario;
        return pid?.toString?.() === userId?.toString?.();
      });
      if (part?.archivado) continue;

      // noLeidos: si el participante está listado usar el contador desnormalizado, sino contar
      let noLeidos = part?.noLeidos;
      if (noLeidos == null) {
        noLeidos = await Mensaje.countDocuments({
          conversacionId: c._id,
          remitenteId: { $ne: userId },
          'leidoPor.usuario': { $ne: userId }
        });
      }
      if (soloNoLeidos === 'true' && noLeidos === 0) continue;

      // DM sin título fijo: mostrar el nombre del otro participante
      let titulo = c.titulo;
      if (c.tipo === 'directo' && !titulo) {
        const otro = (c.participantes || []).find(p => {
          const pid = p.usuario?._id || p.usuario;
          return pid?.toString?.() !== userId?.toString?.();
        });
        titulo = otro?.usuario?.name || 'Conversación';
      }

      result.push({
        _id: c._id,
        tipo: c.tipo,
        titulo,
        ultimoMensajePreview: c.ultimoMensajePreview,
        ultimoMensajeAt: c.ultimoMensajeAt,
        ultimoMensajeRemitente: c.ultimoMensajeRemitente,
        noLeidos,
        ultimoLeidoAt: part?.ultimoLeidoAt || null,
        pineado: !!part?.pineado,
        pineadoEn: part?.pineadoEn || null,
        silenciado: !!part?.silenciado,
        archivado: false,
        rolesPermitidos: c.rolesPermitidos,
        prioridadMinima: c.prioridadMinima || 0,
        entidadTipo: c.entidadTipo || null,
        entidadId: c.entidadId || null
      });
    }

    // Ordenar final: pineado primero, luego por ultimoMensajeAt
    result.sort((a, b) => {
      if (a.pineado && !b.pineado) return -1;
      if (!a.pineado && b.pineado) return 1;
      if (a.pineado && b.pineado) return new Date(b.pineadoEn) - new Date(a.pineadoEn);
      return new Date(b.ultimoMensajeAt) - new Date(a.ultimoMensajeAt);
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[mensajería] GET conversaciones', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /api/mensajes/conversaciones
 * Crea un DM o un canal (requiere gestionar-canales-mensajes para canal).
 * Body: { tipo: 'directo'|'canal', destinatarioId?, titulo?, rolesPermitidos? }
 */
router.post('/mensajes/conversaciones', async (req, res) => {
  try {
    const user = userInfo(req);
    if (!(await tienePermiso(user, 'ver-mensajes'))) {
      return res.status(403).json({ error: 'Sin permiso: ver-mensajes' });
    }

    const { tipo, destinatarioId, titulo, rolesPermitidos } = req.body;

    if (tipo === 'directo') {
      if (!destinatarioId) return res.status(400).json({ error: 'destinatarioId requerido' });
      const conv = await mensajeriaService.obtenerOCrearDM(user.id, destinatarioId);
      const dest = await Mozos.findById(destinatarioId).select('name rol').lean();
      const data = conv.toObject ? conv.toObject() : { ...conv };
      data.titulo = dest?.name || data.titulo || 'Conversación';
      return res.json({ success: true, data });
    }

    if (tipo === 'canal') {
      if (!(await tienePermiso(user, 'gestionar-canales-mensajes'))) {
        return res.status(403).json({ error: 'Sin permiso: gestionar-canales-mensajes' });
      }
      if (!titulo) return res.status(400).json({ error: 'titulo requerido' });
      const conv = await Conversacion.create({
        tipo: 'canal',
        titulo,
        rolesPermitidos: rolesPermitidos || [],
        creadoPor: user.id,
        ultimoMensajeAt: new Date()
      });
      return res.json({ success: true, data: conv });
    }

    return res.status(400).json({ error: 'tipo inválido (directo|canal)' });
  } catch (error) {
    logger.error('[mensajería] POST conversacion', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /api/mensajes/conversaciones/:id
 * Detalle de la conversación (valida acceso).
 */
router.get('/mensajes/conversaciones/:id', async (req, res) => {
  try {
    const user = userInfo(req);
    if (!(await tienePermiso(user, 'ver-mensajes'))) {
      return res.status(403).json({ error: 'Sin permiso: ver-mensajes' });
    }
    const conv = await Conversacion.findById(req.params.id).populate('participantes.usuario', 'name rol');
    if (!conv) return res.status(404).json({ error: 'No encontrada' });

    if (!mensajeriaService.usuarioPuedeAccederConversacion(user.id, user.rol, conv)) {
      return res.status(403).json({ error: 'Sin acceso a esta conversación' });
    }

    res.json({ success: true, data: conv });
  } catch (error) {
    logger.error('[mensajería] GET conversacionById', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /api/mensajes/conversaciones/:id/mensajes
 * Lista paginada por cursor (before = ISO date | messageId).
 * Query: before, limit (default 50)
 */
router.get('/mensajes/conversaciones/:id/mensajes', async (req, res) => {
  try {
    const user = userInfo(req);
    if (!(await tienePermiso(user, 'ver-mensajes'))) {
      return res.status(403).json({ error: 'Sin permiso: ver-mensajes' });
    }
    const conv = await Conversacion.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'No encontrada' });
    if (!mensajeriaService.usuarioPuedeAccederConversacion(user.id, user.rol, conv)) {
      return res.status(403).json({ error: 'Sin acceso' });
    }

    const { before, limit = 50 } = req.query;
    const q = { conversacionId: conv._id, eliminado: false };
    if (before) {
      try {
        // Si es ObjectId válido, usar createdAt < del mensaje
        if (mongoose.Types.ObjectId.isValid(before)) {
          const ref = await Mensaje.findById(before).select('createdAt').lean();
          if (ref) q.createdAt = { $lt: ref.createdAt };
        } else {
          q.createdAt = { $lt: new Date(before) };
        }
      } catch (_) { /* ignorar before inválido */ }
    }

    const mensajes = await Mensaje.find(q)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit) || 50, 100))
      .populate('remitenteId', 'name rol fotoUrl')
      .lean();

    res.json({ success: true, data: mensajes.reverse() });
  } catch (error) {
    logger.error('[mensajería] GET mensajes', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /api/mensajes/conversaciones/:id/mensajes
 * Envía un mensaje de texto.
 * Body: { texto, prioridadCodigo?, entidadTipo?, entidadId? }
 */
router.post('/mensajes/conversaciones/:id/mensajes', async (req, res) => {
  try {
    const user = userInfo(req);
    if (!(await tienePermiso(user, 'enviar-mensajes'))) {
      return res.status(403).json({ error: 'Sin permiso: enviar-mensajes' });
    }
    const { texto, prioridadCodigo = 'normal', entidadTipo = null, entidadId = null, respuestaA = null } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'texto requerido' });

    const result = await mensajeriaService.crearMensaje({
      conversacionId: req.params.id,
      remitenteId: user.id,
      remitenteNombre: user.name,
      remitenteRol: user.rol,
      remitentePermisos: user.permisos,
      tipoContenido: 'texto',
      texto: texto.trim(),
      prioridadCodigo,
      entidadTipo,
      entidadId,
      respuestaA
    });

    res.json({ success: true, data: result.mensaje, warning: result.warning });
  } catch (error) {
    const code = error.statusCode || 500;
    logger.error('[mensajería] POST mensaje texto', { error: error.message });
    res.status(code).json({ error: error.message });
  }
});

/**
 * POST /api/mensajes/conversaciones/:id/mensajes/voz
 * Sube audio multipart (campo "audio") + optional caption (texto) + prioridadCodigo.
 * Requiere enviar-mensajes-voz.
 */
router.post('/mensajes/conversaciones/:id/mensajes/voz', upload.single('audio'), async (req, res) => {
  try {
    const user = userInfo(req);
    if (!(await tienePermiso(user, 'enviar-mensajes'))) {
      return res.status(403).json({ error: 'Sin permiso: enviar-mensajes' });
    }
    if (!(await tienePermiso(user, 'enviar-mensajes-voz'))) {
      return res.status(403).json({ error: 'Sin permiso: enviar-mensajes-voz' });
    }
    if (!req.file) return res.status(400).json({ error: 'Archivo de audio requerido' });

    const { prioridadCodigo = 'normal', texto: caption = '', entidadTipo = null, entidadId = null } = req.body;

    // Duración si viene en header o body
    let duracionMs = parseInt(req.body.duracionMs || req.headers['x-audio-duracion-ms'] || 0, 10);
    if (duracionMs > MAX_DURACION_MS) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: `Audio excede ${MAX_DURACION_MS / 1000}s` });
    }

    const audio = {
      url: `/uploads/mensajes/${req.file.filename}`,
      duracionMs,
      mimeType: req.file.mimetype,
      tamanioBytes: req.file.size
    };

    const result = await mensajeriaService.crearMensaje({
      conversacionId: req.params.id,
      remitenteId: user.id,
      remitenteNombre: user.name,
      remitenteRol: user.rol,
      remitentePermisos: user.permisos,
      tipoContenido: 'voz',
      texto: caption,
      prioridadCodigo,
      audio,
      entidadTipo,
      entidadId
    });

    res.json({ success: true, data: result.mensaje, warning: result.warning });
  } catch (error) {
    const code = error.statusCode || 500;
    if (req.file) fs.unlink(req.file.path, () => {});
    logger.error('[mensajería] POST mensaje voz', { error: error.message });
    res.status(code).json({ error: error.message });
  }
});

/**
 * PATCH /api/mensajes/conversaciones/:id/leido
 * Marca mensajes como leídos hasta ahora (o hasta mensajeId).
 * Body: { mensajeId? }
 */
router.patch('/mensajes/conversaciones/:id/leido', async (req, res) => {
  try {
    const user = userInfo(req);
    const result = await mensajeriaService.marcarLeidosConversacion(
      req.params.id,
      user.id,
      req.body.mensajeId || null
    );
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[mensajería] PATCH leido', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /api/mensajes/anuncios
 * Broadcast. Requiere enviar-anuncios.
 * Body: { texto, prioridadCodigo?, rolesDestinatarios?: string[] }
 */
router.post('/mensajes/anuncios', async (req, res) => {
  try {
    const user = userInfo(req);
    if (!(await tienePermiso(user, 'enviar-anuncios'))) {
      return res.status(403).json({ error: 'Sin permiso: enviar-anuncios' });
    }
    const { texto, prioridadCodigo = 'alta', rolesDestinatarios = [] } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'texto requerido' });

    // Crear conversación tipo anuncio
    const title = `📢 Anuncio de ${user.name}`;
    const conv = await Conversacion.create({
      tipo: 'anuncio',
      titulo: title,
      rolesPermitidos: rolesDestinatarios.length ? rolesDestinatarios : ['admin', 'supervisor', 'mozos', 'capitanMozos', 'cocinero', 'cajero'],
      creadoPor: user.id,
      prioridadMinima: mensajeriaService.PRIORIDADES[prioridadCodigo] || 5,
      ultimoMensajeAt: new Date()
    });

    const result = await mensajeriaService.crearMensaje({
      conversacionId: conv._id,
      remitenteId: user.id,
      remitenteNombre: user.name,
      remitenteRol: user.rol,
      remitentePermisos: user.permisos,
      tipoContenido: 'texto',
      texto: texto.trim(),
      prioridadCodigo
    });

    res.json({ success: true, data: { conversacion: conv, mensaje: result.mensaje }, warning: result.warning });
  } catch (error) {
    const code = error.statusCode || 500;
    logger.error('[mensajería] POST anuncio', { error: error.message });
    res.status(code).json({ error: error.message });
  }
});

/**
 * GET /api/mensajes/no-leidos/count
 * Reemplaza al stub anterior (/api/mensajes-no-leidos).
 */
router.get('/mensajes/no-leidos/count', async (req, res) => {
  try {
    const user = userInfo(req);
    if (!(await tienePermiso(user, 'ver-mensajes'))) {
      return res.json({ success: true, data: { count: 0 } });
    }

    // Contar conversaciones accesibles con al menos 1 mensaje no leído
    const or = [
      { 'participantes.usuario': user.id },
      { rolesPermitidos: user.rol }
    ];
    if (user.rol === 'admin' || user.rol === 'supervisor') {
      or.push({ tipo: { $in: ['canal', 'anuncio'] } });
    }

    const conversaciones = await Conversacion.find({ activo: true, $or: or }).select('_id').lean();
    const convIds = conversaciones.map(c => c._id);

    if (convIds.length === 0) return res.json({ success: true, data: { count: 0 } });

    const count = await Mensaje.countDocuments({
      conversacionId: { $in: convIds },
      remitenteId: { $ne: user.id },
      'leidoPor.usuario': { $ne: user.id }
    });

    res.json({ success: true, data: { count } });
  } catch (error) {
    logger.error('[mensajería] GET no-leidos count', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * DELETE /api/mensajes/:id
 * Soft delete: autor o admin.
 */
router.delete('/mensajes/:id', async (req, res) => {
  try {
    const user = userInfo(req);
    const mensaje = await Mensaje.findById(req.params.id);
    if (!mensaje) return res.status(404).json({ error: 'No encontrado' });

    const esAutor = mensaje.remitenteId?.toString?.() === user.id?.toString?.();
    if (!esAutor && user.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo el autor o admin' });
    }

    mensaje.eliminado = true;
    await mensaje.save();
    res.json({ success: true });
  } catch (error) {
    logger.error('[mensajería] DELETE mensaje', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

// Legacy: mantener compatibilidad con stub anterior
router.get('/mensajes-no-leidos', async (req, res) => {
  try {
    const user = userInfo(req);
    if (!(await tienePermiso(user, 'ver-mensajes'))) {
      return res.json([]);
    }

    const or = [
      { 'participantes.usuario': user.id },
      { rolesPermitidos: user.rol }
    ];
    if (user.rol === 'admin' || user.rol === 'supervisor') {
      or.push({ tipo: { $in: ['canal', 'anuncio'] } });
    }

    const conversaciones = await Conversacion.find({ activo: true, $or: or }).select('_id').lean();
    const convIds = conversaciones.map(c => c._id);

    if (convIds.length === 0) return res.json([]);

    const mensajes = await Mensaje.find({
      conversacionId: { $in: convIds },
      remitenteId: { $ne: user.id },
      'leidoPor.usuario': { $ne: user.id }
    })
      .sort({ prioridad: -1, createdAt: -1 })
      .limit(20)
      .populate('remitenteId', 'name rol')
      .lean();

    const out = mensajes.map(m => ({
      _id: m._id,
      remitente: m.remitenteId?.name || 'Sistema',
      mensaje: m.tipoContenido === 'voz' ? '🎤 Nota de voz' : m.texto,
      fecha: m.createdAt,
      leido: (m.leidoPor || []).some(l => l.usuario?.toString?.() === user.id?.toString?.()),
      tipo: m.tipoContenido === 'voz' ? 'voz' : (m.prioridadCodigo || 'normal'),
      prioridad: m.prioridad
    }));

    res.json(out);
  } catch (error) {
    logger.error('[mensajería] legacy mensajes-no-leidos', { error: error.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

// Seed canales al primer request (lazy, idempotente)
let seedPendiente = false;
router.get('/mensajes/seed', async (req, res) => {
  try {
    const user = userInfo(req);
    if (user.rol !== 'admin' && user.rol !== 'supervisor') {
      return res.status(403).json({ error: 'Solo admin/supervisor' });
    }
    const creados = await mensajeriaService.seedCanales(user.id);
    res.json({ success: true, data: { creados: creados.length } });
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// =====================================
// Endpoints v2 — silenciar, fijar, archivar, anclar, typing, canales
// =====================================

/**
 * PATCH /api/mensajes/conversaciones/:id/silenciar
 * Body: { silenciado: true|false }
 */
router.patch('/mensajes/conversaciones/:id/silenciar', async (req, res) => {
  try {
    const user = userInfo(req);
    const { silenciado = true } = req.body;
    const r = await mensajeriaService.setSilenciado(req.params.id, user.id, silenciado);
    res.json({ success: true, data: r });
  } catch (e) {
    logger.error('[mensajería] PATCH silenciar', { error: e.message });
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * PATCH /api/mensajes/conversaciones/:id/fijar
 * Body: { pineado: true|false }
 */
router.patch('/mensajes/conversaciones/:id/fijar', async (req, res) => {
  try {
    const user = userInfo(req);
    const { pineado = true } = req.body;
    const r = await mensajeriaService.setPineado(req.params.id, user.id, pineado);
    res.json({ success: true, data: r });
  } catch (e) {
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * PATCH /api/mensajes/conversaciones/:id/archivar
 * Body: { archivado: true|false }
 */
router.patch('/mensajes/conversaciones/:id/archivar', async (req, res) => {
  try {
    const user = userInfo(req);
    const { archivado = true } = req.body;
    const r = await mensajeriaService.setArchivado(req.params.id, user.id, archivado);
    res.json({ success: true, data: r });
  } catch (e) {
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /api/mensajes/conversaciones/:id/anclar
 * Body: { mensajeId }
 */
router.post('/mensajes/conversaciones/:id/anclar', async (req, res) => {
  try {
    const user = userInfo(req);
    const { mensajeId } = req.body;
    if (!mensajeId) return res.status(400).json({ error: 'mensajeId requerido' });
    const r = await mensajeriaService.anclarMensaje(req.params.id, mensajeId, user.id);
    res.json({ success: true, data: r });
  } catch (e) {
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * DELETE /api/mensajes/conversaciones/:id/anclar/:mensajeId
 */
router.delete('/mensajes/conversaciones/:id/anclar/:mensajeId', async (req, res) => {
  try {
    const r = await mensajeriaService.desanclarMensaje(req.params.id, req.params.mensajeId);
    res.json({ success: true, data: r });
  } catch (e) {
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /api/mensajes/conversaciones/:id/typing
 * El cliente emite typing; el server difunde vía socket a los demás participantes.
 * Body: { remitenteNombre? }
 */
router.post('/mensajes/conversaciones/:id/typing', async (req, res) => {
  try {
    const user = userInfo(req);
    mensajeriaService.emitTyping(req.params.id, user.id, user.name || req.body.remitenteNombre || 'Usuario');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * PATCH /api/mensajes/conversaciones/:id/canal
 * Actualiza rolesPermitidos de un canal (gestionar-canales-mensajes).
 * Body: { rolesPermitidos: string[] }
 */
router.patch('/mensajes/conversaciones/:id/canal', async (req, res) => {
  try {
    const user = userInfo(req);
    if (!(await tienePermiso(user, 'gestionar-canales-mensajes'))) {
      return res.status(403).json({ error: 'Sin permiso: gestionar-canales-mensajes' });
    }
    const { rolesPermitidos } = req.body;
    const r = await mensajeriaService.actualizarRolesCanal(req.params.id, rolesPermitidos);
    res.json({ success: true, data: r });
  } catch (e) {
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * PATCH /api/mensajes/conversaciones/:id/activo
 * Archiva/reabre un canal a nivel global (gestionar-canales-mensajes).
 * Body: { activo: true|false }
 */
router.patch('/mensajes/conversaciones/:id/activo', async (req, res) => {
  try {
    const user = userInfo(req);
    if (!(await tienePermiso(user, 'gestionar-canales-mensajes'))) {
      return res.status(403).json({ error: 'Sin permiso: gestionar-canales-mensajes' });
    }
    const { activo = true } = req.body;
    const r = await mensajeriaService.setCanalActivo(req.params.id, activo);
    res.json({ success: true, data: r });
  } catch (e) {
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /api/mensajes/conversaciones/:id/anclados
 * Lista mensajes anclados de una conversación.
 */
router.get('/mensajes/conversaciones/:id/anclados', async (req, res) => {
  try {
    const conv = await Conversacion.findById(req.params.id).select('anclados tipo titulo').lean();
    if (!conv) return res.status(404).json({ error: 'No encontrada' });
    const ids = (conv.anclados || []).map(a => a.mensajeId);
    const mensajes = ids.length
      ? await Mensaje.find({ _id: { $in: ids }, eliminado: false }).populate('remitenteId', 'name rol').lean()
      : [];
    res.json({ success: true, data: mensajes, anclados: conv.anclados });
  } catch (e) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// Auto-seed al cargar el controlador (fire-and-forget)
if (!seedPendiente) {
  seedPendiente = true;
  setImmediate(async () => {
    try {
      if (mongoose.connection.readyState === 1) {
        await mensajeriaService.seedCanales();
      } else {
        mongoose.connection.once('connected', () => {
          mensajeriaService.seedCanales().catch(() => {});
        });
      }
    } catch (_) { /* ignorar */ }
  });
}

module.exports = router;