const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const CierreCajaRepository = require('../repository/cierreCaja.repository');
const CierreCaja = require('../database/models/cierreCaja.model');
const Boucher = require('../database/models/boucher.model');

// Helper para validar ObjectIds de MongoDB
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) && /^[a-fA-F0-9]{24}$/.test(id);
}
// PDF generation - se importa dinámicamente si pdfkit está instalado
let generarPDFCierreCaja;
try {
  const pdfUtils = require('../utils/pdfCierreCaja');
  generarPDFCierreCaja = pdfUtils.generarPDFCierreCaja;
} catch (error) {
  console.warn('⚠️ pdfkit no instalado. Instalar con: npm install pdfkit');
  generarPDFCierreCaja = async () => {
    throw new Error('PDF generation no disponible. Instalar pdfkit.');
  };
}

/**
 * GET /cierreCaja/estado
 * Obtener estado actual de la caja (abierta/cerrada y total)
 */
router.get('/estado', async (req, res) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    
    // Buscar bouchers del día de hoy
    const inicioDia = new Date(hoy);
    inicioDia.setHours(0, 0, 0, 0);
    const finDia = new Date(hoy);
    finDia.setHours(23, 59, 59, 999);
    
    const bouchers = await Boucher.find({
      fechaPago: { $gte: inicioDia, $lte: finDia },
      isActive: true
    });
    
    const total = bouchers.reduce((sum, b) => sum + (b.total || 0), 0);
    
    // Verificar si hay cierres pendientes
    const cierresPendientes = await CierreCaja.find({
      fechaCierre: { $gte: inicioDia, $lte: finDia },
      estado: 'pendiente',
      isActive: true
    });
    
    res.json({
      abierta: true, // Asumimos que la caja está abierta si hay bouchers
      total: total,
      bouchers: bouchers.length,
      cierresPendientes: cierresPendientes.length,
      fecha: hoy
    });
  } catch (error) {
    console.error('❌ Error obteniendo estado de caja:', error);
    res.status(500).json({ 
      error: 'Error al obtener estado de caja', 
      message: error.message 
    });
  }
});

/**
 * GET /cierreCaja
 * Listado de cierres con filtros
 * Query params: mozoId, fechaDesde, fechaHasta, estado
 */
router.get('/', async (req, res) => {
  try {
    const { mozoId, fechaDesde, fechaHasta, estado } = req.query;
    
    const filtros = {};
    if (mozoId) filtros.mozoId = parseInt(mozoId);
    if (fechaDesde) filtros.fechaDesde = fechaDesde;
    if (fechaHasta) filtros.fechaHasta = fechaHasta;
    if (estado) filtros.estado = estado;
    
    const cierres = await CierreCajaRepository.listarCierres(filtros);
    
    res.json(cierres);
  } catch (error) {
    console.error('❌ Error listando cierres:', error);
    res.status(500).json({ 
      error: 'Error al listar cierres de caja', 
      message: error.message 
    });
  }
});

/**
 * GET /cierreCaja/:id
 * Obtener cierre por ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validar que el ID sea un ObjectId válido de MongoDB
    if (!isValidObjectId(id)) {
      return res.status(400).json({ 
        error: 'ID de cierre de caja inválido',
        message: `"${id}" no es un ObjectId válido de MongoDB`
      });
    }
    
    const cierre = await CierreCajaRepository.obtenerCierrePorId(id);
    
    if (!cierre) {
      return res.status(404).json({ error: 'Cierre de caja no encontrado' });
    }
    
    res.json(cierre);
  } catch (error) {
    console.error('❌ Error obteniendo cierre:', error);
    res.status(500).json({ 
      error: 'Error al obtener cierre de caja', 
      message: error.message 
    });
  }
});

/**
 * POST /cierreCaja/generar
 * Generar cierre automático
 * Body: { mozoId, fecha, turno }
 */
router.post('/generar', async (req, res) => {
  try {
    const { mozoId, fecha, turno } = req.body;
    
    if (!mozoId || !fecha || !turno) {
      return res.status(400).json({ 
        error: 'Faltan parámetros requeridos: mozoId, fecha, turno' 
      });
    }
    
    // Validar turno
    if (!['mañana', 'tarde', 'noche'].includes(turno)) {
      return res.status(400).json({ 
        error: 'Turno inválido. Debe ser: mañana, tarde o noche' 
      });
    }
    
    // Verificar si mozo tiene cierre pendiente
    const pendiente = await CierreCajaRepository.tieneCierrePendiente(
      parseInt(mozoId), 
      fecha
    );
    
    if (pendiente) {
      return res.status(409).json({ 
        error: 'Mozo tiene cierre pendiente', 
        cierreId: pendiente._id,
        diferenciaPendiente: pendiente.diferencia
      });
    }
    
    // Obtener mozoId del usuario autenticado (si hay middleware de auth)
    const createdBy = req.mozoId || parseInt(mozoId);
    
    // Generar cierre
    const cierre = await CierreCajaRepository.generarCierreAutomatico(
      parseInt(mozoId),
      fecha,
      turno,
      createdBy
    );
    
    res.status(201).json(cierre);
  } catch (error) {
    console.error('❌ Error generando cierre:', error);
    
    if (error.message.includes('Ya existe')) {
      return res.status(409).json({ 
        error: error.message 
      });
    }
    
    res.status(500).json({ 
      error: 'Error al generar cierre de caja', 
      message: error.message 
    });
  }
});

/**
 * POST /cierreCaja/:id/validar
 * Validar cierre físico
 * Body: { totalEfectivoFisico }
 */
router.post('/:id/validar', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validar que el ID sea un ObjectId válido de MongoDB
    if (!isValidObjectId(id)) {
      return res.status(400).json({ 
        error: 'ID de cierre inválido',
        message: `"${id}" no es un ObjectId válido de MongoDB`
      });
    }
    
    const { totalEfectivoFisico } = req.body;
    
    if (totalEfectivoFisico === undefined || totalEfectivoFisico === null) {
      return res.status(400).json({ 
        error: 'totalEfectivoFisico es requerido' 
      });
    }
    
    const aprobadoPor = req.mozoId || null;
    
    const cierre = await CierreCajaRepository.validarCierreFisico(
      id,
      parseFloat(totalEfectivoFisico),
      aprobadoPor
    );
    
    res.json(cierre);
  } catch (error) {
    console.error('❌ Error validando cierre:', error);
    
    if (error.message.includes('no encontrado') || error.message.includes('no válido')) {
      return res.status(400).json({ 
        error: error.message 
      });
    }
    
    res.status(500).json({ 
      error: 'Error al validar cierre de caja', 
      message: error.message 
    });
  }
});

/**
 * GET /cierreCaja/:id/reporte-pdf
 * Generar PDF del cierre de caja
 */
router.get('/:id/reporte-pdf', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validar que el ID sea un ObjectId válido de MongoDB
    if (!isValidObjectId(id)) {
      return res.status(400).json({ 
        error: 'ID de cierre inválido',
        message: `"${id}" no es un ObjectId válido de MongoDB`
      });
    }
    
    const cierre = await CierreCajaRepository.obtenerCierrePorId(id);
    
    if (!cierre) {
      return res.status(404).json({ error: 'Cierre de caja no encontrado' });
    }
    
    // Obtener bouchers del día
    const inicioDia = new Date(cierre.fechaCierre);
    inicioDia.setHours(0, 0, 0, 0);
    const finDia = new Date(cierre.fechaCierre);
    finDia.setHours(23, 59, 59, 999);
    
    // Buscar bouchers por mozoId (necesitamos el ObjectId del mozo)
    const Mozos = require('../database/models/mozos.model');
    const mozo = await Mozos.findOne({ mozoId: cierre.mozoId });
    
    const bouchers = await Boucher.find({
      mozo: mozo?._id,
      fechaPago: { $gte: inicioDia, $lte: finDia },
      isActive: true
    }).sort({ fechaPago: 1 });
    
    // Generar PDF
    const pdfBuffer = await generarPDFCierreCaja(cierre, bouchers);
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=cierre_${cierre.cierreId || id}_${cierre.nombreMozo || 'mozo'}.pdf`
    });
    
    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ Error generando PDF:', error);
    res.status(500).json({ 
      error: 'Error al generar PDF del cierre de caja', 
      message: error.message 
    });
  }
});

module.exports = router;

