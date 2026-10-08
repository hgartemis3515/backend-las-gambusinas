const express = require('express');
const router = express.Router();
const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
const HistorialComandas = require('../database/models/historialComandas.model');
const SesionesUsuarios = require('../database/models/sesionesUsuarios.model');
const comandaModel = require('../database/models/comanda.model');
const { letraRevisionTicket } = require('../utils/comandasNumbers');
const moment = require('moment-timezone');

function oidComanda(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'object') {
    if (v._id) return oidComanda(v._id);
    if (v.$oid) return oidComanda(v.$oid);
  }
  const s = String(v);
  return /^[a-f0-9]{24}$/i.test(s) ? s : null;
}

function idsComandaAuditoria(a) {
  const m = a?.metadata || {};
  const ids = [];
  const push = (v) => {
    const id = oidComanda(v);
    if (id && !ids.includes(id)) ids.push(id);
  };
  push(a?.entidadId);
  push(m.comandaId);
  if (Array.isArray(m.comandasIds)) m.comandasIds.forEach(push);
  if (Array.isArray(m.comandas)) m.comandas.forEach((c) => push(c?._id || c));
  return ids;
}

function etiquetaDia(doc) {
  if (!doc) return '';
  const n = doc.numeroComandaDia != null && doc.numeroComandaDia !== ''
    ? doc.numeroComandaDia
    : doc.comandaNumber;
  if (n == null || n === '') return '';
  return `#${n}${letraRevisionTicket(doc.revisionTicket)}`;
}

async function adjuntarComandaVista(auditorias) {
  const lista = auditorias || [];
  const ids = [];
  lista.forEach((a) => idsComandaAuditoria(a).forEach((id) => {
    if (!ids.includes(id)) ids.push(id);
  }));
  const mapa = new Map();
  if (ids.length) {
    const docs = await comandaModel.find({ _id: { $in: ids } })
      .select('comandaNumber numeroComandaDia revisionTicket')
      .lean();
    docs.forEach((d) => mapa.set(String(d._id), d));
  }
  return lista.map((a) => {
    const plain = typeof a.toObject === 'function' ? a.toObject() : a;
    const idsDoc = idsComandaAuditoria(plain);
    const docs = idsDoc.map((id) => mapa.get(id)).filter(Boolean);
    const etiquetas = docs.map(etiquetaDia).filter(Boolean);
    const fallback = plain.metadata?.numeroComandaDia != null
      ? `#${plain.metadata.numeroComandaDia}`
      : (plain.metadata?.comandaNumber != null ? `#${plain.metadata.comandaNumber}` : '');
    return {
      ...plain,
      comandaVista: {
        id: idsDoc[0] || null,
        ids: idsDoc,
        etiqueta: etiquetas.length ? etiquetas.join(' ') : fallback
      }
    };
  });
}

/**
 * GET /auditoria/comandas
 * Obtener auditoría de comandas con filtros opcionales
 * Query params: fecha, usuario, accion, entidadId, id (para buscar por ID de auditoría)
 */
router.get('/auditoria/comandas', async (req, res) => {
  try {
    const { fecha, usuario, accion, entidadId, id, limit = 100 } = req.query;
    
    const query = {
      entidadTipo: 'comanda'
    };
    
    // Si se proporciona id, buscar directamente por ID de auditoría
    if (id) {
      const auditoria = await AuditoriaAcciones.findById(id)
        .populate('usuario', 'name DNI');
      
      if (!auditoria) {
        return res.json({
          total: 0,
          auditorias: []
        });
      }
      
      return res.json({
        total: 1,
        auditorias: [auditoria]
      });
    }
    
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
      .populate({
        path: 'usuario',
        model: 'mozos',
        select: 'name DNI',
        options: { lean: false }
      })
      .lean() // Convertir a objetos planos para mejor serialización JSON
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
    
    // Importar modelo de mozos para fallback si populate falla
    const mozosModel = require('../database/models/mozos.model');
    
    // Verificar y corregir populate de usuario
    const auditoriasConNombre = await Promise.all(auditorias.map(async (aud) => {
      // Si usuario existe pero no está populado (es solo ObjectId string)
      if (aud.usuario && typeof aud.usuario === 'string') {
        try {
          // Fallback: buscar el mozo manualmente
          const mozo = await mozosModel.findById(aud.usuario).select('name DNI').lean();
          if (mozo && mozo.name) {
            aud.usuario = { _id: mozo._id, name: mozo.name, DNI: mozo.DNI };
            console.log('✅ [auditoriaController] Usuario populado manualmente (fallback):', {
              auditoriaId: aud._id,
              usuarioName: mozo.name
            });
          } else {
            console.warn('⚠️ [auditoriaController] No se encontró mozo para ObjectId:', aud.usuario);
            aud.usuario = null;
          }
        } catch (error) {
          console.error('❌ [auditoriaController] Error al buscar mozo:', error.message);
          aud.usuario = null;
        }
      }
      
      // Debug: Verificar populate de usuario
      if (aud.usuario) {
        if (typeof aud.usuario === 'object' && aud.usuario !== null) {
          if (aud.usuario.name) {
            console.log('✅ [auditoriaController] Usuario populado correctamente:', {
              auditoriaId: aud._id,
              usuarioName: aud.usuario.name
            });
          } else if (aud.usuario._id) {
            console.warn('⚠️ [auditoriaController] Usuario populado sin name:', {
              auditoriaId: aud._id,
              usuarioId: aud.usuario._id,
              usuarioObj: aud.usuario
            });
          }
        }
      } else {
        console.log('ℹ️ [auditoriaController] Auditoría sin usuario (acción automática):', aud._id);
      }
      
      return aud;
    }));
    
    res.json({
      total: auditoriasConNombre.length,
      auditorias: auditoriasConNombre
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
      .populate('mesas', 'nummesa nombreCombinado')
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
    
    const { historialCuentaComoEliminacion, unidadesEliminadasHistorial } = require('../utils/bajaCantidadPlato');
    const query = {};
    
    if (comandaId) {
      query._id = comandaId;
    }
    
    if (fecha) {
      const fechaInicio = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
      const fechaFin = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
      query.$or = [
        { fechaEliminacion: { $gte: fechaInicio, $lte: fechaFin } },
        { 'historialPlatos.timestamp': { $gte: fechaInicio, $lte: fechaFin } }
      ];
    } else if (!comandaId) {
      query.$or = [
        { eliminada: true },
        { 'historialPlatos.estado': { $in: ['eliminado', 'eliminado-completo', 'modificado'] } }
      ];
    }
    
    const comandas = await comandaModel.find(query)
      .populate('eliminadaPor', 'name DNI')
      .populate('mesas', 'nummesa nombreCombinado')
      .select('comandaNumber historialPlatos motivoEliminacion fechaEliminacion eliminadaPor mesas')
      .sort({ fechaEliminacion: -1 });
    
    // Extraer platos eliminados
    const platosEliminados = [];
    comandas.forEach(comanda => {
      if (comanda.historialPlatos && comanda.historialPlatos.length > 0) {
        comanda.historialPlatos.forEach(plato => {
          if (!historialCuentaComoEliminacion(plato)) return;
          if (fecha) {
            const ts = plato.timestamp ? new Date(plato.timestamp).getTime() : 0;
            const fechaInicio = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').valueOf();
            const fechaFin = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').valueOf();
            if (!ts || ts < fechaInicio || ts > fechaFin) return;
          }
          platosEliminados.push({
            comandaNumber: comanda.comandaNumber,
            comandaId: comanda._id,
            mesa: comanda.mesas?.nummesa || 'N/A',
            platoId: plato.platoId,
            nombreOriginal: plato.nombreOriginal,
            cantidadOriginal: plato.cantidadOriginal,
            cantidadFinal: plato.cantidadFinal ?? 0,
            cantidadEliminada: unidadesEliminadasHistorial(plato),
            estado: 'eliminado',
            bajaParcial: Number(plato.cantidadFinal) > 0,
            motivo: plato.motivo || comanda.motivoEliminacion,
            timestamp: plato.timestamp,
            usuario: plato.usuario || comanda.eliminadaPor
          });
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
    
    const tope = (fechaInicio || fechaFin) ? 500 : 100;
    const pagina = await adjuntarComandaVista(auditorias.slice(0, tope));
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
      auditorias: pagina
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

