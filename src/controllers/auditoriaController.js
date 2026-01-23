const express = require('express');
const router = express.Router();
const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
const HistorialComandas = require('../database/models/historialComandas.model');
const SesionesUsuarios = require('../database/models/sesionesUsuarios.model');
const comandaModel = require('../database/models/comanda.model');
const moment = require('moment-timezone');

/**
 * GET /auditoria/comandas
 * Obtener auditoría de comandas con filtros opcionales
 * Query params: fecha, usuario, accion, entidadId
 */
router.get('/auditoria/comandas', async (req, res) => {
  try {
    const { fecha, usuario, accion, entidadId, limit = 100 } = req.query;
    
    const query = {
      entidadTipo: 'comanda'
    };
    
    // Filtro por fecha
    if (fecha) {
      const fechaInicio = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
      const fechaFin = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
      query.timestamp = { $gte: fechaInicio, $lte: fechaFin };
    }
    
    // Filtro por usuario
    if (usuario) {
      query.usuario = usuario;
    }
    
    // Filtro por acción
    if (accion) {
      query.accion = accion;
    }
    
    // Filtro por entidad ID
    if (entidadId) {
      query.entidadId = entidadId;
    }
    
    const auditorias = await AuditoriaAcciones.find(query)
      .populate('usuario', 'name DNI')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
    
    res.json({
      total: auditorias.length,
      auditorias: auditorias
    });
  } catch (error) {
    console.error('❌ Error al obtener auditoría de comandas:', error);
    res.status(500).json({ message: 'Error al obtener auditoría', error: error.message });
  }
});

/**
 * GET /auditoria/comanda/:id/historial
 * Obtener historial completo de una comanda específica
 */
router.get('/auditoria/comanda/:id/historial', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Obtener historial de versiones
    const historial = await HistorialComandas.find({ comandaId: id })
      .populate('usuario', 'name DNI')
      .sort({ version: -1 });
    
    // Obtener auditoría de acciones
    const auditorias = await AuditoriaAcciones.find({ 
      entidadId: id, 
      entidadTipo: 'comanda' 
    })
      .populate('usuario', 'name DNI')
      .sort({ timestamp: -1 });
    
    // Obtener comanda actual
    const comandaActual = await comandaModel.findById(id)
      .populate('mozos', 'name')
      .populate('mesas', 'nummesa')
      .populate('platos.plato', 'nombre precio');
    
    res.json({
      comandaActual: comandaActual,
      historialVersiones: historial,
      auditoriaAcciones: auditorias,
      totalVersiones: historial.length,
      totalAcciones: auditorias.length
    });
  } catch (error) {
    console.error('❌ Error al obtener historial de comanda:', error);
    res.status(500).json({ message: 'Error al obtener historial', error: error.message });
  }
});

/**
 * GET /auditoria/platos-eliminados
 * Obtener reporte de platos eliminados con filtros
 * Query params: fecha, comandaId, usuario
 */
router.get('/auditoria/platos-eliminados', async (req, res) => {
  try {
    const { fecha, comandaId, usuario } = req.query;
    
    const query = { eliminada: true };
    
    if (comandaId) {
      query._id = comandaId;
    }
    
    if (fecha) {
      const fechaInicio = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
      const fechaFin = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
      query.fechaEliminacion = { $gte: fechaInicio, $lte: fechaFin };
    }
    
    const comandas = await comandaModel.find(query)
      .populate('eliminadaPor', 'name DNI')
      .populate('mesas', 'nummesa')
      .select('comandaNumber historialPlatos motivoEliminacion fechaEliminacion eliminadaPor mesas')
      .sort({ fechaEliminacion: -1 });
    
    // Extraer platos eliminados
    const platosEliminados = [];
    comandas.forEach(comanda => {
      if (comanda.historialPlatos && comanda.historialPlatos.length > 0) {
        comanda.historialPlatos.forEach(plato => {
          if (plato.estado === 'eliminado' || plato.estado === 'eliminado-completo') {
            platosEliminados.push({
              comandaNumber: comanda.comandaNumber,
              comandaId: comanda._id,
              mesa: comanda.mesas?.nummesa || 'N/A',
              platoId: plato.platoId,
              nombreOriginal: plato.nombreOriginal,
              cantidadOriginal: plato.cantidadOriginal,
              estado: plato.estado,
              motivo: plato.motivo || comanda.motivoEliminacion,
              timestamp: plato.timestamp,
              usuario: comanda.eliminadaPor
            });
          }
        });
      }
    });
    
    // Filtrar por usuario si se especifica
    let platosFiltrados = platosEliminados;
    if (usuario) {
      platosFiltrados = platosEliminados.filter(p => 
        p.usuario?._id?.toString() === usuario || 
        p.usuario?.toString() === usuario
      );
    }
    
    res.json({
      total: platosFiltrados.length,
      platosEliminados: platosFiltrados
    });
  } catch (error) {
    console.error('❌ Error al obtener platos eliminados:', error);
    res.status(500).json({ message: 'Error al obtener platos eliminados', error: error.message });
  }
});

/**
 * GET /auditoria/reporte-completo
 * Reporte completo de auditoría con resumen
 * Query params: fechaInicio, fechaFin, usuario
 */
router.get('/auditoria/reporte-completo', async (req, res) => {
  try {
    const { fechaInicio, fechaFin, usuario } = req.query;
    
    const query = {};
    
    // Filtro de fechas
    if (fechaInicio || fechaFin) {
      query.timestamp = {};
      if (fechaInicio) {
        query.timestamp.$gte = moment.tz(fechaInicio, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
      }
      if (fechaFin) {
        query.timestamp.$lte = moment.tz(fechaFin, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
      }
    }
    
    // Filtro por usuario
    if (usuario) {
      query.usuario = usuario;
    }
    
    // Obtener todas las auditorías
    const auditorias = await AuditoriaAcciones.find(query)
      .populate('usuario', 'name DNI')
      .sort({ timestamp: -1 });
    
    // Resumen por acción
    const resumenPorAccion = {};
    auditorias.forEach(aud => {
      if (!resumenPorAccion[aud.accion]) {
        resumenPorAccion[aud.accion] = 0;
      }
      resumenPorAccion[aud.accion]++;
    });
    
    // Resumen por usuario
    const resumenPorUsuario = {};
    auditorias.forEach(aud => {
      const usuarioKey = aud.usuario?._id?.toString() || aud.usuario?.toString() || 'desconocido';
      const usuarioName = aud.usuario?.name || 'Desconocido';
      if (!resumenPorUsuario[usuarioKey]) {
        resumenPorUsuario[usuarioKey] = {
          nombre: usuarioName,
          total: 0,
          acciones: {}
        };
      }
      resumenPorUsuario[usuarioKey].total++;
      if (!resumenPorUsuario[usuarioKey].acciones[aud.accion]) {
        resumenPorUsuario[usuarioKey].acciones[aud.accion] = 0;
      }
      resumenPorUsuario[usuarioKey].acciones[aud.accion]++;
    });
    
    // Comandas eliminadas
    const comandasEliminadas = await comandaModel.countDocuments({ 
      eliminada: true,
      ...(fechaInicio || fechaFin ? {
        fechaEliminacion: {
          ...(fechaInicio ? { $gte: moment.tz(fechaInicio, "YYYY-MM-DD", "America/Lima").startOf('day').toDate() } : {}),
          ...(fechaFin ? { $lte: moment.tz(fechaFin, "YYYY-MM-DD", "America/Lima").endOf('day').toDate() } : {})
        }
      } : {})
    });
    
    res.json({
      periodo: {
        fechaInicio: fechaInicio || 'No especificada',
        fechaFin: fechaFin || 'No especificada'
      },
      resumen: {
        totalAcciones: auditorias.length,
        comandasEliminadas: comandasEliminadas,
        resumenPorAccion: resumenPorAccion,
        resumenPorUsuario: resumenPorUsuario
      },
      auditorias: auditorias.slice(0, 100) // Limitar a 100 para no sobrecargar
    });
  } catch (error) {
    console.error('❌ Error al generar reporte completo:', error);
    res.status(500).json({ message: 'Error al generar reporte', error: error.message });
  }
});

/**
 * GET /auditoria/sesiones
 * Obtener sesiones activas de usuarios
 */
router.get('/auditoria/sesiones', async (req, res) => {
  try {
    const { estado = 'activa' } = req.query;
    
    const sesiones = await SesionesUsuarios.find({ estado })
      .populate('usuario', 'name DNI')
      .sort({ ultimaAccion: -1 });
    
    res.json({
      total: sesiones.length,
      sesiones: sesiones
    });
  } catch (error) {
    console.error('❌ Error al obtener sesiones:', error);
    res.status(500).json({ message: 'Error al obtener sesiones', error: error.message });
  }
});

module.exports = router;

