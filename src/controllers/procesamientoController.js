/**
 * PROCESAMIENTO CONTROLLER
 * 
 * TEMA 4: Endpoints para el sistema de procesamiento con identificación de cocinero.
 * Permite que un cocinero "tome", "libere" o "finalice" un plato o comanda.
 * 
 * Reglas:
 * - Solo el cocinero que tomó el recurso puede liberarlo o finalizarlo
 * - Si otro cocinero ya está procesando, se devuelve error 409 (Conflict)
 * - Se emiten eventos Socket para sincronización en tiempo real
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const { adminAuth } = require('../middleware/adminAuth');

const Comanda = mongoose.model('Comanda') || require('../database/models/comanda.model');
const Mozos = mongoose.model('mozos') || require('../database/models/mozos.model');

// ============================================================
// HELPER: Obtener información del cocinero
// ============================================================
const getCocineroInfo = async (cocineroId) => {
  const cocinero = await Mozos.findById(cocineroId).select('name aliasCocinero').lean();
  return {
    cocineroId: cocineroId,
    nombre: cocinero?.name || 'Cocinero',
    alias: cocinero?.aliasCocinero || cocinero?.name || 'Cocinero'
  };
};

// ============================================================
// ENDPOINTS PARA PLATOS
// ============================================================

/**
 * PUT /api/comanda/:id/plato/:platoId/procesando
 * Un cocinero toma un plato para prepararlo
 */
router.put('/comanda/:id/plato/:platoId/procesando', adminAuth, async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { id: comandaId, platoId } = req.params;
    const { cocineroId } = req.body;
    
    // Validaciones
    if (!cocineroId) {
      return res.status(400).json({
        success: false,
        error: 'cocineroId es requerido'
      });
    }
    
    // Solo el propio cocinero o un admin puede tomar platos
    if (req.admin.id !== cocineroId && !req.admin.permisos?.includes('editar-mozos')) {
      return res.status(403).json({
        success: false,
        error: 'No tiene permisos para realizar esta acción'
      });
    }
    
    await session.withTransaction(async () => {
      const comanda = await Comanda.findById(comandaId).session(session);
      
      if (!comanda) {
        throw new Error('Comanda no encontrada');
      }
      
      // Buscar el plato
      const platoIndex = comanda.platos.findIndex(p => 
        (p._id?.toString() === platoId) || 
        (p.platoId?.toString() === platoId)
      );
      
      if (platoIndex === -1) {
        throw new Error('Plato no encontrado en la comanda');
      }
      
      const plato = comanda.platos[platoIndex];
      
      // Verificar si ya está siendo procesado por otro cocinero
      if (plato.procesandoPor?.cocineroId && 
          plato.procesandoPor.cocineroId.toString() !== cocineroId) {
        const error = new Error('Este plato ya está siendo procesado por otro cocinero');
        error.code = 'CONFLICT';
        error.procesandoPor = plato.procesandoPor;
        throw error;
      }
      
      // Obtener info del cocinero
      const cocineroInfo = await getCocineroInfo(cocineroId);
      
      // Actualizar el plato
      comanda.platos[platoIndex].procesandoPor = {
        ...cocineroInfo,
        timestamp: moment().tz('America/Lima').toDate()
      };
      
      // Si el estado es 'pedido', cambiar a 'en_espera'
      if (plato.estado === 'pedido') {
        comanda.platos[platoIndex].estado = 'en_espera';
        comanda.platos[platoIndex].tiempos.en_espera = moment().tz('America/Lima').toDate();
      }
      
      comanda.updatedAt = moment().tz('America/Lima').toDate();
      comanda.updatedBy = cocineroId;
      
      await comanda.save({ session });
      
      // Emitir evento Socket
      if (global.emitPlatoProcesando) {
        global.emitPlatoProcesando(comandaId, platoId, cocineroInfo);
      }
      
      logger.info('Plato tomado para procesamiento', {
        comandaId,
        platoId,
        cocineroId,
        platoNombre: plato.plato?.nombre
      });
      
      res.json({
        success: true,
        message: 'Plato tomado para preparación',
        data: {
          comandaId,
          platoId,
          procesandoPor: cocineroInfo
        }
      });
    });
    
  } catch (error) {
    logger.error('Error al tomar plato', { error: error.message });
    
    if (error.code === 'CONFLICT') {
      return res.status(409).json({
        success: false,
        error: error.message,
        procesandoPor: error.procesandoPor
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Error al procesar la solicitud'
    });
  } finally {
    await session.endSession();
  }
});

/**
 * DELETE /api/comanda/:id/plato/:platoId/procesando
 * Un cocinero libera un plato que había tomado
 */
router.delete('/comanda/:id/plato/:platoId/procesando', adminAuth, async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { id: comandaId, platoId } = req.params;
    const { cocineroId } = req.body;
    
    if (!cocineroId) {
      return res.status(400).json({
        success: false,
        error: 'cocineroId es requerido'
      });
    }
    
    await session.withTransaction(async () => {
      const comanda = await Comanda.findById(comandaId).session(session);
      
      if (!comanda) {
        throw new Error('Comanda no encontrada');
      }
      
      const platoIndex = comanda.platos.findIndex(p => 
        (p._id?.toString() === platoId) || 
        (p.platoId?.toString() === platoId)
      );
      
      if (platoIndex === -1) {
        throw new Error('Plato no encontrado');
      }
      
      const plato = comanda.platos[platoIndex];
      
      // Verificar que el plato está siendo procesado
      if (!plato.procesandoPor?.cocineroId) {
        throw new Error('Este plato no está siendo procesado');
      }
      
      // Verificar que es el mismo cocinero quien lo liberó
      if (plato.procesandoPor.cocineroId.toString() !== cocineroId) {
        return res.status(403).json({
          success: false,
          error: 'Solo el cocinero que tomó el plato puede liberarlo'
        });
      }
      
      // Limpiar procesandoPor
      comanda.platos[platoIndex].procesandoPor = {
        cocineroId: null,
        nombre: null,
        alias: null,
        timestamp: null
      };
      
      comanda.updatedAt = moment().tz('America/Lima').toDate();
      
      await comanda.save({ session });
      
      // Emitir evento Socket
      if (global.emitPlatoLiberado) {
        global.emitPlatoLiberado(comandaId, platoId, cocineroId);
      }
      
      logger.info('Plato liberado', { comandaId, platoId, cocineroId });
      
      res.json({
        success: true,
        message: 'Plato liberado correctamente'
      });
    });
    
  } catch (error) {
    logger.error('Error al liberar plato', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    await session.endSession();
  }
});

/**
 * PUT /api/comanda/:id/plato/:platoId/finalizar
 * Un cocinero finaliza un plato (marca como recoger)
 */
router.put('/comanda/:id/plato/:platoId/finalizar', adminAuth, async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { id: comandaId, platoId } = req.params;
    const { cocineroId } = req.body;
    
    if (!cocineroId) {
      return res.status(400).json({
        success: false,
        error: 'cocineroId es requerido'
      });
    }
    
    await session.withTransaction(async () => {
      const comanda = await Comanda.findById(comandaId).session(session);
      
      if (!comanda) {
        throw new Error('Comanda no encontrada');
      }
      
      const platoIndex = comanda.platos.findIndex(p => 
        (p._id?.toString() === platoId) || 
        (p.platoId?.toString() === platoId)
      );
      
      if (platoIndex === -1) {
        throw new Error('Plato no encontrado');
      }
      
      const plato = comanda.platos[platoIndex];
      
      // Si el plato estaba siendo procesado, verificar que es el mismo cocinero
      if (plato.procesandoPor?.cocineroId && 
          plato.procesandoPor.cocineroId.toString() !== cocineroId) {
        return res.status(403).json({
          success: false,
          error: 'Solo el cocinero que tomó el plato puede finalizarlo'
        });
      }
      
      // Obtener info del cocinero
      const cocineroInfo = await getCocineroInfo(cocineroId);
      
      // Actualizar el plato
      comanda.platos[platoIndex].estado = 'recoger';
      comanda.platos[platoIndex].tiempos.recoger = moment().tz('America/Lima').toDate();
      comanda.platos[platoIndex].procesadoPor = {
        ...cocineroInfo,
        timestamp: moment().tz('America/Lima').toDate()
      };
      comanda.platos[platoIndex].procesandoPor = {
        cocineroId: null,
        nombre: null,
        alias: null,
        timestamp: null
      };
      
      comanda.updatedAt = moment().tz('America/Lima').toDate();
      comanda.updatedBy = cocineroId;
      
      await comanda.save({ session });
      
      // Emitir evento Socket
      if (global.emitPlatoActualizado) {
        global.emitPlatoActualizado(comandaId, platoId, 'recoger');
      }
      
      // Verificar si toda la comanda está lista
      const todosListos = comanda.platos.every(p => 
        p.estado === 'recoger' || p.estado === 'entregado' || p.anulado || p.eliminado
      );
      
      if (todosListos && comanda.status !== 'recoger') {
        comanda.status = 'recoger';
        comanda.tiempoRecoger = moment().tz('America/Lima').toDate();
        await comanda.save({ session });
        
        if (global.emitComandaActualizada) {
          global.emitComandaActualizada(comandaId);
        }
      }
      
      logger.info('Plato finalizado', {
        comandaId,
        platoId,
        cocineroId,
        estado: 'recoger'
      });
      
      res.json({
        success: true,
        message: 'Plato finalizado correctamente',
        data: {
          comandaId,
          platoId,
          estado: 'recoger',
          procesadoPor: cocineroInfo,
          comandaLista: todosListos
        }
      });
    });
    
  } catch (error) {
    logger.error('Error al finalizar plato', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    await session.endSession();
  }
});

// ============================================================
// ENDPOINTS PARA COMANDAS COMPLETAS
// ============================================================

/**
 * PUT /api/comanda/:id/procesando
 * Un cocinero toma toda la comanda
 */
router.put('/comanda/:id/procesando', adminAuth, async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { id: comandaId } = req.params;
    const { cocineroId } = req.body;
    
    if (!cocineroId) {
      return res.status(400).json({
        success: false,
        error: 'cocineroId es requerido'
      });
    }
    
    await session.withTransaction(async () => {
      const comanda = await Comanda.findById(comandaId).session(session);
      
      if (!comanda) {
        throw new Error('Comanda no encontrada');
      }
      
      // Verificar si ya está siendo procesada
      if (comanda.procesandoPor?.cocineroId && 
          comanda.procesandoPor.cocineroId.toString() !== cocineroId) {
        const error = new Error('Esta comanda ya está siendo procesada por otro cocinero');
        error.code = 'CONFLICT';
        error.procesandoPor = comanda.procesandoPor;
        throw error;
      }
      
      const cocineroInfo = await getCocineroInfo(cocineroId);
      
      comanda.procesandoPor = {
        ...cocineroInfo,
        timestamp: moment().tz('America/Lima').toDate()
      };
      comanda.updatedAt = moment().tz('America/Lima').toDate();
      comanda.updatedBy = cocineroId;
      
      await comanda.save({ session });
      
      if (global.emitComandaProcesando) {
        global.emitComandaProcesando(comandaId, cocineroInfo);
      }
      
      logger.info('Comanda tomada para procesamiento', { comandaId, cocineroId });
      
      res.json({
        success: true,
        message: 'Comanda tomada para preparación',
        data: {
          comandaId,
          procesandoPor: cocineroInfo
        }
      });
    });
    
  } catch (error) {
    if (error.code === 'CONFLICT') {
      return res.status(409).json({
        success: false,
        error: error.message,
        procesandoPor: error.procesandoPor
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    await session.endSession();
  }
});

/**
 * DELETE /api/comanda/:id/procesando
 * Libera una comanda que se había tomado
 */
router.delete('/comanda/:id/procesando', adminAuth, async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { id: comandaId } = req.params;
    const { cocineroId } = req.body;
    
    await session.withTransaction(async () => {
      const comanda = await Comanda.findById(comandaId).session(session);
      
      if (!comanda) {
        throw new Error('Comanda no encontrada');
      }
      
      if (!comanda.procesandoPor?.cocineroId) {
        throw new Error('Esta comanda no está siendo procesada');
      }
      
      if (comanda.procesandoPor.cocineroId.toString() !== cocineroId) {
        return res.status(403).json({
          success: false,
          error: 'Solo el cocinero que tomó la comanda puede liberarla'
        });
      }
      
      comanda.procesandoPor = {
        cocineroId: null,
        nombre: null,
        alias: null,
        timestamp: null
      };
      comanda.updatedAt = moment().tz('America/Lima').toDate();
      
      await comanda.save({ session });
      
      if (global.emitComandaLiberada) {
        global.emitComandaLiberada(comandaId, cocineroId);
      }
      
      res.json({
        success: true,
        message: 'Comanda liberada correctamente'
      });
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    await session.endSession();
  }
});

module.exports = router;
