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
 * 
 * NOTA: No usa transacciones de MongoDB para compatibilidad con standalone
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const { adminAuth } = require('../middleware/adminAuth');
const { registrarAuditoria } = require('../middleware/auditoria');

const Comanda = mongoose.model('Comanda') || require('../database/models/comanda.model');
const Mozos = mongoose.model('mozos') || require('../database/models/mozos.model');
const cocinerosRepository = require('../repository/cocineros.repository');

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
// HELPER: Buscar índice de plato (con fallback por índice numérico)
// ============================================================
const findPlatoIndex = (platos, platoId) => {
  // Buscar por _id del subdocumento
  let platoIndex = platos.findIndex(p => p._id?.toString() === platoId);
  
  // Si no se encuentra, buscar por platoId
  if (platoIndex === -1) {
    platoIndex = platos.findIndex(p => p.platoId?.toString() === platoId);
  }
  
  // Si no se encuentra, intentar buscar por índice numérico
  if (platoIndex === -1) {
    const indexAsNumber = parseInt(platoId, 10);
    if (!isNaN(indexAsNumber) && indexAsNumber >= 0 && indexAsNumber < platos.length) {
      platoIndex = indexAsNumber;
    }
  }
  
  return platoIndex;
};

// ============================================================
// ENDPOINTS PARA PLATOS
// ============================================================

/**
 * PUT /api/comanda/:id/plato/:platoId/procesando
 * Un cocinero toma un plato para prepararlo
 */
router.put('/comanda/:id/plato/:platoId/procesando', adminAuth, async (req, res) => {
  try {
    const { id: comandaId, platoId } = req.params;
    const { cocineroId } = req.body;
    
    logger.info('[TomarPlato] Request recibido', { 
      comandaId, 
      platoId, 
      cocineroId,
      adminId: req.admin?.id 
    });
    
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
    
    const comanda = await Comanda.findById(comandaId);
    
    if (!comanda) {
      return res.status(404).json({
        success: false,
        error: 'Comanda no encontrada'
      });
    }
    
    // Buscar el plato
    const platoIndex = findPlatoIndex(comanda.platos, platoId);
    
    if (platoIndex === -1) {
      logger.error('[TomarPlato] Plato no encontrado', { 
        platoId, 
        platosDisponibles: comanda.platos?.map(p => p._id?.toString()) 
      });
      return res.status(404).json({
        success: false,
        error: 'Plato no encontrado en la comanda'
      });
    }
    
    const plato = comanda.platos[platoIndex];
    
    // Verificar si ya está siendo procesado por otro cocinero
    if (plato.procesandoPor?.cocineroId && 
        plato.procesandoPor.cocineroId.toString() !== cocineroId) {
      return res.status(409).json({
        success: false,
        error: 'Este plato ya está siendo procesado por otro cocinero',
        procesandoPor: plato.procesandoPor
      });
    }
    
    // Obtener info del cocinero
    const cocineroInfo = await getCocineroInfo(cocineroId);
    
    // Actualizar el plato usando updateOne para evitar problemas con el schema
    await Comanda.updateOne(
      { _id: comandaId },
      {
        $set: {
          [`platos.${platoIndex}.procesandoPor`]: {
            ...cocineroInfo,
            timestamp: moment().tz('America/Lima').toDate()
          },
          updatedAt: moment().tz('America/Lima').toDate(),
          updatedBy: cocineroId
        }
      }
    );
    
    // Si el estado es 'pedido', cambiar a 'en_espera'
    if (plato.estado === 'pedido') {
      await Comanda.updateOne(
        { _id: comandaId },
        {
          $set: {
            [`platos.${platoIndex}.estado`]: 'en_espera',
            [`platos.${platoIndex}.tiempos.en_espera`]: moment().tz('America/Lima').toDate()
          }
        }
      );
    }
    
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
    
  } catch (error) {
    logger.error('Error al tomar plato', { error: error.message });
    
    res.status(500).json({
      success: false,
      error: error.message || 'Error al procesar la solicitud'
    });
  }
});

/**
 * DELETE /api/comanda/:id/plato/:platoId/procesando
 * Un cocinero libera un plato que había tomado
 * v7.2.1: Ahora acepta motivo y registra en auditoría
 */
router.delete('/comanda/:id/plato/:platoId/procesando', adminAuth, async (req, res) => {
  try {
    const { id: comandaId, platoId } = req.params;
    const { cocineroId, motivo } = req.body;
    
    if (!cocineroId) {
      return res.status(400).json({
        success: false,
        error: 'cocineroId es requerido'
      });
    }
    
    const comanda = await Comanda.findById(comandaId);
    
    if (!comanda) {
      return res.status(404).json({
        success: false,
        error: 'Comanda no encontrada'
      });
    }
    
    const platoIndex = findPlatoIndex(comanda.platos, platoId);
    
    if (platoIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Plato no encontrado'
      });
    }
    
    const plato = comanda.platos[platoIndex];
    
    // Verificar que el plato está siendo procesado
    if (!plato.procesandoPor?.cocineroId) {
      return res.status(400).json({
        success: false,
        error: 'Este plato no está siendo procesado'
      });
    }
    
    // Verificar que es el mismo cocinero quien lo liberó
    if (plato.procesandoPor.cocineroId.toString() !== cocineroId) {
      return res.status(403).json({
        success: false,
        error: 'Solo el cocinero que tomó el plato puede liberarlo'
      });
    }
    
    // Snapshot antes para auditoría
    const snapshotAntes = {
      comandaId,
      comandaNumber: comanda.comandaNumber,
      platoId,
      platoNombre: plato.plato?.nombre || plato.nombre || 'Plato',
      procesandoPor: plato.procesandoPor
    };
    
    // Limpiar procesandoPor usando updateOne
    await Comanda.updateOne(
      { _id: comandaId },
      {
        $set: {
          [`platos.${platoIndex}.procesandoPor`]: {
            cocineroId: null,
            nombre: null,
            alias: null,
            timestamp: null
          },
          updatedAt: moment().tz('America/Lima').toDate()
        }
      }
    );
    
    // Configurar auditoría con acción específica
    req.auditoria = {
      accion: 'PLATO_DEJADO_COCINA',
      entidadTipo: 'comanda',
      entidadId: comandaId,
      usuario: cocineroId,
      ip: req.ip || req.connection?.remoteAddress || null,
      deviceId: req.headers['device-id'] || req.headers['x-device-id'] || null,
      metadata: {
        comandaNumber: comanda.comandaNumber,
        platoId,
        platoNombre: plato.plato?.nombre || plato.nombre || 'Plato',
        mesaNum: comanda.mesas?.nummesa || 'N/A'
      },
      comandaNumber: comanda.comandaNumber
    };
    
    // Registrar auditoría
    const motivoAuditoria = motivo || 'Cocinero liberó el plato';
    await registrarAuditoria(req, snapshotAntes, { liberado: true }, motivoAuditoria);
    
    // Emitir evento Socket
    if (global.emitPlatoLiberado) {
      global.emitPlatoLiberado(comandaId, platoId, cocineroId);
    }
    
    logger.info('Plato liberado', { comandaId, platoId, cocineroId, motivo: motivoAuditoria });
    
    res.json({
      success: true,
      message: 'Plato liberado correctamente'
    });
    
  } catch (error) {
    logger.error('Error al liberar plato', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/comanda/:id/plato/:platoId/finalizar
 * Un cocinero finaliza un plato (marca como recoger)
 */
router.put('/comanda/:id/plato/:platoId/finalizar', adminAuth, async (req, res) => {
  try {
    const { id: comandaId, platoId } = req.params;
    const { cocineroId } = req.body;
    
    if (!cocineroId) {
      return res.status(400).json({
        success: false,
        error: 'cocineroId es requerido'
      });
    }
    
    const comanda = await Comanda.findById(comandaId);
    
    if (!comanda) {
      return res.status(404).json({
        success: false,
        error: 'Comanda no encontrada'
      });
    }
    
    const platoIndex = findPlatoIndex(comanda.platos, platoId);
    
    if (platoIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Plato no encontrado'
      });
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
    
    // Actualizar el plato usando updateOne
    await Comanda.updateOne(
      { _id: comandaId },
      {
        $set: {
          [`platos.${platoIndex}.estado`]: 'recoger',
          [`platos.${platoIndex}.tiempos.recoger`]: moment().tz('America/Lima').toDate(),
          [`platos.${platoIndex}.procesadoPor`]: {
            ...cocineroInfo,
            timestamp: moment().tz('America/Lima').toDate()
          },
          [`platos.${platoIndex}.procesandoPor`]: {
            cocineroId: null,
            nombre: null,
            alias: null,
            timestamp: null
          },
          updatedAt: moment().tz('America/Lima').toDate(),
          updatedBy: cocineroId
        }
      }
    );
    
    // Emitir evento Socket
    if (global.emitPlatoActualizado) {
      global.emitPlatoActualizado(comandaId, platoId, 'recoger');
    }
    
    // Verificar si toda la comanda está lista
    const comandaActualizada = await Comanda.findById(comandaId);
    const todosListos = comandaActualizada.platos.every(p => 
      p.estado === 'recoger' || p.estado === 'entregado' || p.anulado || p.eliminado
    );
    
    if (todosListos && comandaActualizada.status !== 'recoger') {
      await Comanda.updateOne(
        { _id: comandaId },
        {
          $set: {
            status: 'recoger',
            tiempoRecoger: moment().tz('America/Lima').toDate()
          }
        }
      );
      
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
    
    // Incrementar contador de platos preparados del cocinero (async, no bloquea)
    cocinerosRepository.incrementarPlatosPreparados(cocineroId, 1).catch(err => {
      logger.warn('No se pudo incrementar platos preparados', { error: err.message });
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
    
  } catch (error) {
    logger.error('Error al finalizar plato', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
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
  try {
    const { id: comandaId } = req.params;
    const { cocineroId } = req.body;
    
    if (!cocineroId) {
      return res.status(400).json({
        success: false,
        error: 'cocineroId es requerido'
      });
    }
    
    const comanda = await Comanda.findById(comandaId);
    
    if (!comanda) {
      return res.status(404).json({
        success: false,
        error: 'Comanda no encontrada'
      });
    }
    
    // Verificar si ya está siendo procesada
    if (comanda.procesandoPor?.cocineroId && 
        comanda.procesandoPor.cocineroId.toString() !== cocineroId) {
      return res.status(409).json({
        success: false,
        error: 'Esta comanda ya está siendo procesada por otro cocinero',
        procesandoPor: comanda.procesandoPor
      });
    }
    
    const cocineroInfo = await getCocineroInfo(cocineroId);
    
    comanda.procesandoPor = {
      ...cocineroInfo,
      timestamp: moment().tz('America/Lima').toDate()
    };
    comanda.updatedAt = moment().tz('America/Lima').toDate();
    comanda.updatedBy = cocineroId;
    
    await comanda.save();
    
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
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/comanda/:id/procesando
 * Libera una comanda que se había tomado
 */
router.delete('/comanda/:id/procesando', adminAuth, async (req, res) => {
  try {
    const { id: comandaId } = req.params;
    const { cocineroId } = req.body;
    
    const comanda = await Comanda.findById(comandaId);
    
    if (!comanda) {
      return res.status(404).json({
        success: false,
        error: 'Comanda no encontrada'
      });
    }
    
    if (!comanda.procesandoPor?.cocineroId) {
      return res.status(400).json({
        success: false,
        error: 'Esta comanda no está siendo procesada'
      });
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
    
    await comanda.save();
    
    if (global.emitComandaLiberada) {
      global.emitComandaLiberada(comandaId, cocineroId);
    }
    
    res.json({
      success: true,
      message: 'Comanda liberada correctamente'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
