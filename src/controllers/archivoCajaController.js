const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { adminAuth } = require('../middleware/adminAuth');
const logger = require('../utils/logger');
const { nombreSeguro, validarPaquete } = require('../utils/archivoCaja');
const archivo = require('../services/archivoCaja.service');

const router = express.Router();
router.use(adminAuth);

const upload = multer({
    dest: path.join(archivo.DIR, '_tmp'),
    limits: { fileSize: 80 * 1024 * 1024 },
});

router.get('/archivo-caja', (req, res) => {
    try {
        archivo.asegurarDir();
        res.json({
            success: true,
            plan: archivo.planPublico(),
            estado: archivo.leerEstado(),
            archivos: archivo.listarArchivos(),
        });
    } catch (error) {
        logger.error('Error al leer archivo de caja', { error: error.message });
        res.status(500).json({ success: false, error: 'No se pudo leer EXPORTADOS' });
    }
});

router.post('/archivo-caja/exportar', async (req, res) => {
    try {
        if (req.body && req.body.confirmar !== true) {
            return res.status(400).json({ success: false, error: 'Confirme la exportación' });
        }
        const data = await archivo.exportarYPurgar({ motivo: 'manual' });
        res.json({ success: true, data });
    } catch (error) {
        logger.error('Error al exportar archivo de caja', { error: error.message });
        res.status(500).json({ success: false, error: error.message || 'No se pudo exportar' });
    }
});

router.get('/archivo-caja/archivo/:nombre', (req, res) => {
    try {
        const full = archivo.rutaArchivo(req.params.nombre);
        if (!full || !fs.existsSync(full)) {
            return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
        }
        res.download(full, path.basename(full));
    } catch (error) {
        res.status(400).json({ success: false, error: 'Nombre de archivo inválido' });
    }
});

router.post('/archivo-caja/verificar', (req, res) => {
    try {
        const { archivo: nombre, desde, hasta } = req.body || {};
        const paquete = archivo.leerArchivo(nombre);
        const data = archivo.verificar(paquete, { desde, hasta });
        res.json({ success: true, archivo: nombreSeguro(nombre), data });
    } catch (error) {
        const status = error.statusCode || 400;
        res.status(status).json({ success: false, error: error.message || 'No se pudo verificar' });
    }
});

router.post('/archivo-caja/importar', async (req, res) => {
    try {
        const { archivo: nombre, desde, hasta, confirmar } = req.body || {};
        if (confirmar !== true) {
            return res.status(400).json({ success: false, error: 'Confirme la importación' });
        }
        const paquete = archivo.leerArchivo(nombre);
        const data = await archivo.importar(paquete, { desde, hasta });
        res.json({ success: true, data });
    } catch (error) {
        logger.error('Error al importar archivo de caja', { error: error.message });
        const status = error.statusCode || 500;
        res.status(status).json({ success: false, error: error.message || 'No se pudo importar' });
    }
});

router.post('/archivo-caja/subir', (req, res, next) => {
    archivo.asegurarDir();
    fs.mkdirSync(path.join(archivo.DIR, '_tmp'), { recursive: true });
    next();
}, upload.single('archivo'), (req, res) => {
    const tmp = req.file && req.file.path;
    try {
        if (!tmp) return res.status(400).json({ success: false, error: 'Falta el archivo' });
        const paquete = JSON.parse(fs.readFileSync(tmp, 'utf8'));
        const v = validarPaquete(paquete);
        if (!v.ok) return res.status(400).json({ success: false, error: v.error });
        const { nombreArchivo } = require('../utils/archivoCaja');
        const nombre = nombreArchivo(new Date());
        fs.copyFileSync(tmp, path.join(archivo.DIR, nombre));
        const data = archivo.verificar(paquete, {
            desde: req.body && req.body.desde,
            hasta: req.body && req.body.hasta,
        });
        res.json({ success: true, archivo: nombre, data });
    } catch (error) {
        res.status(400).json({ success: false, error: 'El archivo no es un JSON de caja válido' });
    } finally {
        if (tmp) {
            try { fs.unlinkSync(tmp); } catch { /* noop */ }
        }
    }
});

module.exports = router;
