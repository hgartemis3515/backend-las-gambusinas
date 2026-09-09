const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const {
    listarCategoriasGestion,
    listarCategoriasLigero,
    renombrarCategoria,
    setCodigoMozoCategoria,
    guardarCategoriasLote,
    setImagenCategoria,
    moverPlatos,
} = require('../repository/categoriaPlato.repository');
const logger = require('../utils/logger');
const { handleError } = require('../utils/errorHandler');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'categorias');
if (!fs.existsSync(UPLOAD_DIR)) {
    try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (_) { /* ya existe */ }
}

const MIME_IMG = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
        const fromMime = MIME_IMG[mime];
        const fromName = (file.originalname || '').split('.').pop();
        const ext = fromMime || (/^(jpe?g|png|webp)$/i.test(fromName || '') ? String(fromName).toLowerCase().replace('jpeg', 'jpg') : 'jpg');
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 1.5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
        if (MIME_IMG[mime]) return cb(null, true);
        if (mime === 'application/octet-stream' && /\.(jpe?g|png|webp)$/i.test(file.originalname || '')) {
            return cb(null, true);
        }
        return cb(new Error('Solo JPEG, PNG o WebP'));
    },
});

function unlinkLocalCategoria(url) {
    const p = String(url || '');
    if (!p.startsWith('/uploads/categorias/')) return;
    const abs = path.join(UPLOAD_DIR, path.basename(p));
    try { fs.unlinkSync(abs); } catch (_) { /* archivo ya no está */ }
}

router.get('/categorias-plato', async (req, res) => {
    try {
        if (req.query.ligero === '1' || req.query.ligero === 'true') {
            const data = await listarCategoriasLigero();
            return res.json(data);
        }
        const data = await listarCategoriasGestion(req.query.q);
        res.json(data);
    } catch (error) {
        logger.error('Error al listar categorías de plato', { error: error.message });
        handleError(error, res, logger);
    }
});

router.put('/categorias-plato/renombrar', async (req, res) => {
    try {
        const { from, to } = req.body || {};
        const data = await renombrarCategoria(from, to);
        res.json(data);
    } catch (error) {
        logger.error('Error al renombrar categoría', { error: error.message });
        handleError(error, res, logger);
    }
});

router.put('/categorias-plato/codigo-mozo', async (req, res) => {
    try {
        const { nombre, codigoMozo } = req.body || {};
        const data = await setCodigoMozoCategoria(nombre, codigoMozo);
        res.json(data);
    } catch (error) {
        logger.error('Error al guardar código de mozo de categoría', { error: error.message });
        handleError(error, res, logger);
    }
});

router.put('/categorias-plato/lote', async (req, res) => {
    try {
        const data = await guardarCategoriasLote((req.body || {}).items);
        res.json(data);
    } catch (error) {
        logger.error('Error al guardar categorías en lote', { error: error.message });
        handleError(error, res, logger);
    }
});

router.post('/categorias-plato/imagen', (req, res) => {
    upload.single('imagen')(req, res, async (err) => {
        if (err) {
            err.statusCode = 400;
            if (err.code === 'LIMIT_FILE_SIZE') err.message = 'La imagen supera 1.5 MB';
            return handleError(err, res, logger);
        }
        try {
            const nombre = (req.body && req.body.nombre) || '';
            if (!req.file) {
                const e = new Error('Falta el archivo de imagen');
                e.statusCode = 400;
                throw e;
            }
            const imagenUrl = `/uploads/categorias/${req.file.filename}`;
            const data = await setImagenCategoria(nombre, imagenUrl);
            if (data.anterior && data.anterior !== imagenUrl) unlinkLocalCategoria(data.anterior);
            res.json({ nombre: data.nombre, imagenUrl: data.imagenUrl });
        } catch (error) {
            if (req.file && req.file.path) {
                try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
            }
            logger.error('Error al subir imagen de categoría', { error: error.message });
            handleError(error, res, logger);
        }
    });
});

router.delete('/categorias-plato/imagen', async (req, res) => {
    try {
        const { nombre } = req.body || {};
        const data = await setImagenCategoria(nombre, '');
        unlinkLocalCategoria(data.anterior);
        res.json({ nombre: data.nombre, imagenUrl: '' });
    } catch (error) {
        logger.error('Error al quitar imagen de categoría', { error: error.message });
        handleError(error, res, logger);
    }
});

router.put('/categorias-plato/mover', async (req, res) => {
    try {
        const { platoIds, categoria } = req.body || {};
        const data = await moverPlatos(platoIds, categoria);
        res.json(data);
    } catch (error) {
        logger.error('Error al mover platos de categoría', { error: error.message });
        handleError(error, res, logger);
    }
});

module.exports = router;
