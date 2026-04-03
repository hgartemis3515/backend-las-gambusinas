/**
 * Layout Routes
 * Rutas para gestión de secciones e items del layout
 * 
 * IMPORTANTE: Las rutas usan prefijo "layout-" para coincidir con el frontend
 */

const express = require('express');
const router = express.Router();
const layoutController = require('../controllers/layoutController');
const { adminAuth } = require('../middleware/adminAuth');

// ==================== RUTAS DE SECCIONES ====================
// NOTA: Usamos "layout-sections" en lugar de "sections" para evitar conflictos

// Obtener todas las secciones
router.get('/layout-sections', adminAuth, layoutController.getSecciones);

// Obtener sección por ID
router.get('/layout-sections/:id', adminAuth, layoutController.getSeccionById);

// Obtener sección completa con items y mesas
router.get('/layout-sections/:id/completo', adminAuth, layoutController.getSeccionCompleta);

// Crear nueva sección
router.post('/layout-sections', adminAuth, layoutController.createSeccion);

// Actualizar sección
router.put('/layout-sections/:id', adminAuth, layoutController.updateSeccion);

// Eliminar sección
router.delete('/layout-sections/:id', adminAuth, layoutController.deleteSeccion);

// Publicar sección
router.post('/layout-sections/:id/publicar', adminAuth, layoutController.publicarSeccion);

// Despublicar sección
router.post('/layout-sections/:id/despublicar', adminAuth, layoutController.despublicarSeccion);

// Duplicar sección
router.post('/layout-sections/:id/duplicar', adminAuth, layoutController.duplicarSeccion);

// ==================== RUTAS DE ITEMS ====================

// Actualizar múltiples items (bulk)
router.put('/layout-items/bulk', adminAuth, layoutController.updateItemsBulk);

// Obtener items de una sección
router.get('/layout-items/section/:sectionId', adminAuth, layoutController.getItemsBySection);

// Crear item
router.post('/layout-items', adminAuth, layoutController.createItem);

// Actualizar item
router.put('/layout-items/:id', adminAuth, layoutController.updateItem);

// Eliminar item
router.delete('/layout-items/:id', adminAuth, layoutController.deleteItem);

module.exports = router;
