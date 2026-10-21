'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const router = express.Router();
const { adminAuth, checkPermission, JWT_SECRET } = require('../middleware/adminAuth');
const repo = require('../repository/noticias.repository');
const { ymdOperativo } = require('../utils/diaOperativoRestaurante');
const logger = require('../utils/logger');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'noticias');
if (!fs.existsSync(UPLOAD_DIR)) {
    try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (_) { /* ya existe */ }
}

const MIME_IMG = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
        filename: (_req, file, cb) => {
            const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
            const ext = MIME_IMG[mime] || 'jpg';
            cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`);
        },
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
        if (MIME_IMG[mime]) return cb(null, true);
        cb(new Error('Solo JPEG, PNG o WebP'));
    },
});

function requireJwt(req, res, next) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Token no proporcionado' });
    try {
        const decoded = jwt.verify(header.slice(7), JWT_SECRET);
        req.usuario = decoded;
        next();
    } catch (_) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

function puedePublicar(req, res, next) {
    const rol = req.admin?.rol;
    if (rol === 'admin' || rol === 'supervisor' || rol === 'cajero') return next();
    return checkPermission('publicar-noticias')(req, res, next);
}

function emitirDirigido(evento, payload, destino = {}) {
    const io = global.io;
    if (!io) return;
    const aviso = { ...payload, ...destino };
    const cocina = io.of('/cocina');
    const mozos = io.of('/mozos');
    try {
        const alcance = destino.cocinaAlcance || 'todas';
        if ((destino.destinos || ['cocina']).includes('cocina')) {
            if (alcance === 'kds' || alcance === 'todas') {
                cocina.emit(evento, { ...aviso, canal: alcance === 'kds' ? 'kds' : 'todas' });
            }
            if (alcance === 'pantallas') {
                (destino.pantallas || []).forEach((n) => {
                    cocina.to(`pantalla-${n}`).emit(evento, { ...aviso, canal: 'pantallas', pantalla: n });
                });
            }
        }
        const quienes = destino.mozosAlcance || 'todos';
        if ((destino.destinos || ['mozos']).includes('mozos')) {
            if (quienes === 'algunos') {
                (destino.mozoIds || []).forEach((id) => mozos.to(`mozo-${id}`).emit(evento, aviso));
            } else if (quienes !== 'ninguno') {
                mozos.emit(evento, aviso);
            }
        }
    } catch (error) {
        logger.warn('No se avisó la noticia', { error: error.message });
    }
}

function emitirNoticia(accion = 'creada', noticia = null) {
    const payload = {
        fechaOperativa: ymdOperativo(),
        accion,
        noticiaId: noticia?._id ? String(noticia._id) : null,
        titulo: noticia?.titulo || '',
        cuerpoHtml: noticia?.cuerpoHtml || '',
        segundosEnPantalla: noticia?.segundosEnPantalla || 15,
        destinos: noticia?.destinos || ['cocina', 'mozos'],
        cocinaAlcance: noticia?.cocinaAlcance || 'todas',
        pantallas: noticia?.pantallas || [],
        mozosAlcance: noticia?.mozosAlcance || 'todos',
        mozoIds: noticia?.mozoIds || [],
    };
    emitirDirigido('noticia-publicada', payload, payload);
}

function autorDe(req) {
    return { id: req.admin?.id, nombre: req.admin?.name, rol: req.admin?.rol };
}

router.get('/noticias/top-semana', requireJwt, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await repo.topSemana());
    } catch (error) {
        logger.error('Error TOP semana', { error: error.message });
        res.status(500).json({ error: 'No se pudo calcular el TOP' });
    }
});

router.get('/noticias/hoy', requireJwt, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        const data = await repo.listarHoy();
        const app = req.usuario?.app;
        const id = String(req.usuario?.id || req.usuario?._id || '');
        data.noticias = (data.noticias || []).filter((n) => {
            const dest = n.destinos?.length ? n.destinos : ['cocina', 'mozos'];
            if (app === 'cocina') return dest.includes('cocina');
            if (!dest.includes('mozos')) return false;
            if ((n.mozosAlcance || 'todos') === 'algunos') return (n.mozoIds || []).map(String).includes(id);
            return true;
        });
        res.json(data);
    } catch (error) {
        logger.error('Error noticias de hoy', { error: error.message });
        res.status(500).json({ error: 'No se pudieron leer las noticias' });
    }
});

router.get('/noticias', adminAuth, puedePublicar, async (req, res) => {
    try {
        res.json({ noticias: await repo.listarArchivo() });
    } catch (error) {
        logger.error('Error archivo de noticias', { error: error.message });
        res.status(500).json({ error: 'No se pudo leer el archivo' });
    }
});

router.post('/noticias/imagen', adminAuth, puedePublicar, (req, res) => {
    upload.single('imagen')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Imagen no válida' });
        if (!req.file) return res.status(400).json({ error: 'Falta la imagen' });
        res.json({ url: `/uploads/noticias/${req.file.filename}` });
    });
});

router.post('/noticias/temporal', adminAuth, puedePublicar, (req, res) => {
    try {
        const aviso = repo.prepararTemporal(req.body, autorDe(req));
        emitirDirigido('noticia-temporal', aviso, aviso);
        res.json({ enviado: true });
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message || 'No se pudo enviar' });
    }
});

router.post('/noticias', adminAuth, puedePublicar, async (req, res) => {
    try {
        const noticia = await repo.crearNoticia(req.body, autorDe(req));
        emitirNoticia('creada', noticia);
        res.status(201).json(noticia);
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message || 'No se pudo publicar' });
    }
});

router.put('/noticias/:id', adminAuth, puedePublicar, async (req, res) => {
    try {
        const noticia = await repo.actualizarNoticia(req.params.id, req.body);
        emitirNoticia('editada', noticia);
        res.json(noticia);
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message || 'No se pudo guardar' });
    }
});

router.patch('/noticias/:id/retirar', adminAuth, puedePublicar, async (req, res) => {
    try {
        const noticia = await repo.retirarNoticia(req.params.id);
        emitirNoticia('retirada', noticia);
        res.json(noticia);
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message || 'No se pudo retirar' });
    }
});

module.exports = router;
module.exports.invalidarTopSemana = repo.invalidarTopSemana;
