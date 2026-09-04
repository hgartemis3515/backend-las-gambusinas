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
const { getCocineroInfo } = require('../utils/cocineroInfo');
const { evaluarReasignacionProcesamiento } = require('../utils/reasignacionProcesamiento');
const { resolverTomadoEnAlFinalizar } = require('../utils/tiemposPrepPlato');
const cocinerosRepository = require('../repository/cocineros.repository');
const asignacionAutomaticaService = require('../services/asignacionAutomaticaService');
const asignacionAutomaticaGuarnicionesService = require('../services/asignacionAutomaticaGuarnicionesService');
const redisCache = require('../utils/redisCache');

// PLAN OBLIGAR_ORDEN_ASIGNACION_KDS_SUPERVISOR: config de cocina + override one-shot
const ConfiguracionSistema = mongoose.model('ConfiguracionSistema') || require('../database/models/configuracionSistema.model');
const {
  indicesPendientesGuarnicion,
  buildAutocierreGuarnicionesSet,
  agrupacionGuarnicionesOn
} = require('../utils/autocerrarGuarniciones');
const { platoUneComplementos } = require('../utils/platoUneComplementos');

// ============================================================
// HELPER: Verificar si el usuario tiene privilegios de supervisor en cocina
// Aplica para finalizar/liberar/tomar platos o comandas tomados por otros
// Condiciones: rol supervisor/admin, o permiso 'utilidad-supervisor'/'editar-mozos'
// ============================================================
const esSupervisorCocina = (admin) => {
  if (!admin) return false;
  if (admin.rol === 'supervisor' || admin.rol === 'admin') return true;
  const permisos = admin.permisos || [];
  return permisos.includes('utilidad-supervisor') || permisos.includes('editar-mozos');
};

function listaPermisosAdmin(admin) {
  const raw = admin?.permisos;
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => (typeof p === 'string' ? p : p?.permiso)).filter(Boolean);
}

/** Panel de Gestión: admin/supervisor o permiso. El rol cocinero nunca. */
function puedeUsarPanelGestion(admin) {
  if (!admin) return false;
  const rol = String(admin.rol || '').toLowerCase();
  if (rol === 'cocinero') return false;
  if (rol === 'admin' || rol === 'supervisor') return true;
  return listaPermisosAdmin(admin).includes('ver-panel-gestion-mozos');
}

function requirePanelGestion(req, res, next) {
  if (puedeUsarPanelGestion(req.admin)) return next();
  return res.status(403).json({
    success: false,
    error: 'No tiene permiso para acceder al Panel de Gestión'
  });
}

// ============================================================
// PLAN OBLIGAR_ORDEN_ASIGNACION_KDS_SUPERVISOR
// Helper: leer flags de cocina (defaults true)
// ============================================================
async function leerConfigCocina() {
  try {
    const cfg = await ConfiguracionSistema.findById('configuracion_unica').lean();
    const cocina = cfg?.cocina || {};
    return {
      obligarOrdenAsignacion: cocina.obligarOrdenAsignacion !== false,
      solicitudOrdenFueraDeCola: cocina.solicitudOrdenFueraDeCola !== false,
      // PLAN GUARNICIONES_SEPARADAS v1.1.1
      permitirGuarnicionesSeparadas: cocina.permitirGuarnicionesSeparadas !== false,
      deshabilitarOrdenSecuencialGuarniciones: cocina.deshabilitarOrdenSecuencialGuarniciones !== false,
      deshabilitarAgrupacionGuarniciones: cocina.deshabilitarAgrupacionGuarniciones === true
    };
  } catch (e) {
    return {
      obligarOrdenAsignacion: true,
      solicitudOrdenFueraDeCola: true,
      permitirGuarnicionesSeparadas: true,
      deshabilitarOrdenSecuencialGuarniciones: true,
      deshabilitarAgrupacionGuarniciones: false
    };
  }
}

async function indicesObjetivoGuarnicion(plato, compIndex) {
  const cfg = await leerConfigCocina();
  if (agrupacionGuarnicionesOn(cfg)) {
    const idxs = indicesPendientesGuarnicion(plato);
    return idxs.length ? idxs : [compIndex];
  }
  return [compIndex];
}

function complementoIdsDeIndices(plato, indices) {
  const comps = plato?.complementosSeleccionados || [];
  return indices.map((i) => (comps[i]?._id ? String(comps[i]._id) : `idx:${i}`));
}

// ============================================================
// PLAN OBLIGAR_ORDEN_ASIGNACION_KDS_SUPERVISOR
// Cola por cocinero (FIFO por procesandoPor.timestamp).
// Se permite finalizar el prefijo contiguo #1..#N del lote
// (ej. #1+#2). Saltar el orden (solo #2, o #4 sin #3) → 409.
// ============================================================
async function obtenerColaDelCocinero(cocineroId) {
  const ESTADOS_EN_PROCESO = ['pendiente', 'pedido', 'en_espera'];
  const inicioDia = moment().tz('America/Lima').startOf('day').toDate();
  const finDia = moment().tz('America/Lima').endOf('day').toDate();
  const cocineroIdStr = String(cocineroId);

  const comandas = await Comanda.find({
    IsActive: true,
    status: { $nin: ['entregado', 'pagado'] },
    createdAt: { $gte: inicioDia, $lte: finDia },
    'platos.procesandoPor.cocineroId': cocineroId
  }).select('platos.procesandoPor platos.estado platos.eliminado platos.anulado');

  const candidatos = [];
  for (const c of comandas) {
    c.platos.forEach((p, idx) => {
      if (!p || p.eliminado || p.anulado) return;
      if (!p.procesandoPor || !p.procesandoPor.cocineroId) return;
      if (String(p.procesandoPor.cocineroId) !== cocineroIdStr) return;
      if (!ESTADOS_EN_PROCESO.includes(p.estado)) return;
      candidatos.push({
        comandaId: String(c._id),
        platoIndex: idx,
        key: `${c._id}-${idx}`,
        timestamp: p.procesandoPor.timestamp ? new Date(p.procesandoPor.timestamp).getTime() : 0
      });
    });
  }

  candidatos.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    const ca = String(a.comandaId);
    const cb = String(b.comandaId);
    if (ca !== cb) return ca.localeCompare(cb);
    return a.platoIndex - b.platoIndex;
  });

  return candidatos;
}

/**
 * ¿Se puede finalizar este plato según orden de cola?
 * - Sin lote: solo el #1.
 * - Con loteCola (keys "comandaId-platoIndex"): prefijo contiguo desde #1
 *   dentro de la selección de ESE cocinero (permite #1+#2 en paralelo).
 */
async function puedeFinalizarSegunOrdenCola(comandaId, platoIndex, cocineroId, loteColaKeys = []) {
  const candidatos = await obtenerColaDelCocinero(cocineroId);
  if (candidatos.length === 0) return { ok: true, numero: null };

  const idx = candidatos.findIndex(
    (c) =>
      String(c.comandaId) === String(comandaId) &&
      Number(c.platoIndex) === Number(platoIndex)
  );
  if (idx < 0) return { ok: true, numero: null }; // ya no está en cola

  const numero = idx + 1;
  const keysLote = new Set(
    (Array.isArray(loteColaKeys) ? loteColaKeys : [])
      .map((k) => String(k))
      .filter(Boolean)
  );
  // Incluir siempre el plato actual en el set lógico del lote
  keysLote.add(`${comandaId}-${platoIndex}`);

  // Números de cola de este cocinero presentes en el lote
  const numerosEnLote = new Set();
  candidatos.forEach((c, i) => {
    if (keysLote.has(c.key) || keysLote.has(`${c.comandaId}-${c.platoIndex}`)) {
      numerosEnLote.add(i + 1);
    }
  });

  for (let n = 1; n <= numero; n++) {
    if (!numerosEnLote.has(n)) {
      logger.info('[OrdenCola] Plato fuera de prefijo contiguo', {
        comandaId: String(comandaId),
        platoIndex,
        cocineroId: String(cocineroId),
        numero,
        numerosEnLote: [...numerosEnLote],
        colaSize: candidatos.length
      });
      return { ok: false, numero };
    }
  }

  return { ok: true, numero };
}

async function esPrimeroEnColaDelCocinero(comandaId, platoIndex, cocineroId) {
  const r = await puedeFinalizarSegunOrdenCola(comandaId, platoIndex, cocineroId, []);
  return r.ok && (r.numero == null || r.numero === 1);
}

/**
 * ¿Hay override one-shot vigente para este plato?
 * 1) Campo plato.overrideOrdenCola
 * 2) SolicitudGestion aprobada (fallback si el campo no se persistió / KDS sin refresh)
 */
async function tieneOverrideOrdenVigente(plato, comandaId, platoId) {
  if (plato?.overrideOrdenCola === true) return true;
  try {
    const SolicitudGestionModel = mongoose.models.SolicitudGestion;
    if (!SolicitudGestionModel) return false;
    const aprobada = await SolicitudGestionModel.findOne({
      comandaId,
      platoId,
      estado: 'aprobada',
      overrideUsado: { $ne: true },
      tipo: 'finalizar_fuera_de_orden'
    }).select('_id').lean();
    return !!aprobada;
  } catch (_) {
    return false;
  }
}

function nombreGuarnicionComp(comp) {
  const opcion = Array.isArray(comp?.opcion) ? comp.opcion.join(', ') : (comp?.opcion || '');
  return String(opcion || '').trim() || 'Guarnición';
}

/** Cronómetro acumulado desde que el cocinero tomó la unidad (plato o guarnición). */
function cronometroDesdeToma(timestampToma, ahora = new Date()) {
  if (!timestampToma) {
    return { tomadoEn: null, segundosAcumulados: 0, cronometro: '00:00' };
  }
  const ini = new Date(timestampToma).getTime();
  if (Number.isNaN(ini)) {
    return { tomadoEn: timestampToma, segundosAcumulados: 0, cronometro: '00:00' };
  }
  const segundos = Math.max(0, Math.floor((ahora.getTime() - ini) / 1000));
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return {
    tomadoEn: timestampToma,
    segundosAcumulados: segundos,
    cronometro: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  };
}

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
 * @param {boolean} forzar - Si es true, permite reasignar aunque esté tomado (supervisor/admin o el titular)
 */
router.put('/comanda/:id/plato/:platoId/procesando', adminAuth, async (req, res) => {
  try {
    const { id: comandaId, platoId } = req.params;
    const { cocineroId, forzar = false } = req.body;
    
    logger.info('[TomarPlato] Request recibido', { 
      comandaId, 
      platoId, 
      cocineroId,
      forzar,
      adminId: req.admin?.id 
    });
    
    // Validaciones
    if (!cocineroId) {
      return res.status(400).json({
        success: false,
        error: 'cocineroId es requerido'
      });
    }
    
    const esSupervisor = esSupervisorCocina(req.admin);
    
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

    const evalR = evaluarReasignacionProcesamiento({
      adminId: req.admin.id,
      esSupervisor,
      holderId: plato.procesandoPor?.cocineroId,
      nuevoCocineroId: cocineroId,
      forzar
    });
    if (!evalR.ok) {
      return res.status(evalR.status).json({
        success: false,
        error: evalR.error,
        ...(evalR.status === 409 ? { procesandoPor: plato.procesandoPor } : {})
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

    if (global.emitRendimientoCocineroActualizado) {
      global.emitRendimientoCocineroActualizado({
        tipo: 'plato_tomado',
        cocineroId: cocineroId?.toString()
      });
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
 * PUT /api/comanda/:id/plato/:platoId/pasar-a-backup
 * Reasigna un plato en proceso al backup configurado en asignación automática.
 */
router.put('/comanda/:id/plato/:platoId/pasar-a-backup', adminAuth, async (req, res) => {
  try {
    const { id: comandaId, platoId } = req.params;
    const comanda = await Comanda.findById(comandaId).populate('platos.plato', 'nombre categoria id');
    if (!comanda) {
      return res.status(404).json({ success: false, error: 'Comanda no encontrada' });
    }
    const platoIndex = findPlatoIndex(comanda.platos, platoId);
    if (platoIndex === -1) {
      return res.status(404).json({ success: false, error: 'Plato no encontrado en la comanda' });
    }
    const plato = comanda.platos[platoIndex];
    const estado = String(plato.estado || '').toLowerCase();
    if (!['pedido', 'en_espera'].includes(estado)) {
      return res.status(400).json({ success: false, error: 'Solo se puede pasar a backup un plato en proceso' });
    }
    const actualId = plato.procesandoPor?.cocineroId;
    if (!actualId) {
      return res.status(400).json({ success: false, error: 'El plato no está en proceso' });
    }
    const esSupervisor = esSupervisorCocina(req.admin);
    const soyTitular = String(req.admin?.id) === String(actualId);
    if (!soyTitular && !esSupervisor) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para pasar este plato a backup' });
    }

    const destino = await asignacionAutomaticaService.resolverBackupDestinoParaPlato(plato, actualId);
    if (String(destino.cocineroId) === String(actualId)) {
      return res.status(409).json({ success: false, error: 'El plato ya está en su backup' });
    }
    const cocineroInfo = await getCocineroInfo(destino.cocineroId);
    if (!cocineroInfo.cocineroId) {
      return res.status(404).json({ success: false, error: 'El cocinero backup no existe' });
    }
    const ahora = moment().tz('America/Lima').toDate();
    const procesandoPor = { ...cocineroInfo, timestamp: ahora, tomadoEn: ahora };
    await Comanda.updateOne(
      { _id: comandaId },
      {
        $set: {
          [`platos.${platoIndex}.procesandoPor`]: procesandoPor,
          [`platos.${platoIndex}.asignacionMeta`]: {
            origen: 'overflow',
            regla: destino.tipoRegla === 'categoria' ? 'categoria' : 'plato',
            timestamp: ahora
          },
          updatedAt: ahora,
          updatedBy: req.admin?.id || destino.cocineroId
        }
      }
    );
    try { await redisCache.invalidate(comandaId); } catch (_) { /* no bloquear */ }
    if (global.emitPlatoProcesando) {
      global.emitPlatoProcesando(comandaId, plato._id || platoId, procesandoPor);
    }
    if (global.emitRendimientoCocineroActualizado) {
      global.emitRendimientoCocineroActualizado({ tipo: 'plato_tomado', cocineroId: String(destino.cocineroId) });
    }
    logger.info('Plato pasado a backup', {
      comandaId, platoId, de: String(actualId), a: destino.cocineroId
    });
    res.json({
      success: true,
      message: `Plato enviado a backup (${cocineroInfo.alias || cocineroInfo.nombre})`,
      data: { comandaId, platoId, procesandoPor, backupDe: String(actualId) }
    });
  } catch (error) {
    const status = error.statusCode || 500;
    logger.error('Error al pasar plato a backup', { error: error.message });
    res.status(status).json({ success: false, error: error.message || 'Error al pasar a backup' });
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
    // EXCEPCIÓN: Un supervisor/admin puede liberar platos de otros
    if (plato.procesandoPor.cocineroId.toString() !== cocineroId) {
      // Verificar si es supervisor (por rol o por permiso)
      const esSupervisor = esSupervisorCocina(req.admin);
      if (!esSupervisor) {
        return res.status(403).json({
          success: false,
          error: 'Solo el cocinero que tomó el plato puede liberarlo'
        });
      }
      // Si es supervisor, permitir liberar y registrar en auditoría
      logger.info('[LiberarPlato] Supervisor liberando plato de otro cocinero', {
        platoId,
        cocineroOriginal: plato.procesandoPor.cocineroId,
        supervisorId: cocineroId,
        rol: req.admin.rol
      });
    }
    
    // Snapshot antes para auditoría
    const ahoraLiberar = moment().tz('America/Lima').toDate();
    const crono = cronometroDesdeToma(plato.procesandoPor?.timestamp, ahoraLiberar);
    const snapshotAntes = {
      comandaId,
      comandaNumber: comanda.comandaNumber,
      platoId,
      platoNombre: plato.plato?.nombre || plato.nombre || 'Plato',
      procesandoPor: plato.procesandoPor,
      tomadoEn: crono.tomadoEn,
      tiempoAcumuladoSegundos: crono.segundosAcumulados,
      cronometro: crono.cronometro
    };
    
    // Limpiar procesandoPor y resetear tiempo en_espera usando updateOne
    // 🔥 v7.3: Resetear tiempo en_espera para que el siguiente cocinero tenga tiempo limpio
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
          [`platos.${platoIndex}.tiempos.en_espera`]: moment().tz('America/Lima').toDate(),
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
        mesaNum: comanda.mesas?.nummesa || 'N/A',
        tipoUnidad: 'principal',
        tomadoEn: crono.tomadoEn,
        tiempoAcumuladoSegundos: crono.segundosAcumulados,
        cronometro: crono.cronometro,
        cocineroAlias: plato.procesandoPor?.alias || plato.procesandoPor?.nombre || null
      },
      comandaNumber: comanda.comandaNumber
    };
    
    // Registrar auditoría
    const motivoAuditoria = motivo || 'Cocinero liberó el plato';
    await registrarAuditoria(req, snapshotAntes, {
      liberado: true,
      tipoUnidad: 'principal',
      tiempoAcumuladoSegundos: crono.segundosAcumulados,
      cronometro: crono.cronometro
    }, motivoAuditoria);
    
    // Emitir evento Socket
    if (global.emitPlatoLiberado) {
      global.emitPlatoLiberado(comandaId, platoId, cocineroId);
    }

    if (global.emitRendimientoCocineroActualizado) {
      global.emitRendimientoCocineroActualizado({
        tipo: 'plato_liberado',
        cocineroId: cocineroId?.toString()
      });
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
    const { cocineroId, loteCola } = req.body;
    
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
    // EXCEPCIÓN: Un supervisor/admin puede finalizar platos de otros
    let cocineroAtribuidoId = cocineroId;
    let cocineroAtribuidoInfo = null;
    let supervisorOverride = false;
    if (plato.procesandoPor?.cocineroId &&
        plato.procesandoPor.cocineroId.toString() !== cocineroId) {
      // Verificar si es supervisor (por rol o por permiso)
      const esSupervisor = esSupervisorCocina(req.admin);
      if (!esSupervisor) {
        return res.status(403).json({
          success: false,
          error: 'Solo el cocinero que tomó el plato puede finalizarlo'
        });
      }
      // Si es supervisor, atribuir al cocinero que TOMÓ el plato (no al supervisor)
      supervisorOverride = true;
      cocineroAtribuidoId = plato.procesandoPor.cocineroId;
      logger.info('[FinalizarPlato] Supervisor finalizando plato de otro cocinero', {
        platoId,
        cocineroOriginal: plato.procesandoPor.cocineroId,
        supervisorId: cocineroId,
        rol: req.admin.rol
      });
    }

    // PLAN OBLIGAR_ORDEN_ASIGNACION_KDS_SUPERVISOR
    // Validar orden de cola: si obligarOrdenAsignacion ON y el actor NO es admin,
    // el plato debe ser el #1 de su cocinero. Excepciones:
    //   - admin => bypass
    //   - supervisor + solicitudOrdenFueraDeCola OFF => bypass
    //   - override one-shot aprobado (campo en plato o SolicitudGestion) => bypass y consumir
    let consumirOverride = false;
    try {
      const cfgCocina = await leerConfigCocina();
      if (cfgCocina.obligarOrdenAsignacion && req.admin?.rol !== 'admin') {
        // Comanda creada desde dashboard con "Omitir orden de entrega"
        if (comanda.omitirOrdenEntrega === true) {
          logger.info('[FinalizarPlato] omitirOrdenEntrega=true — se salta validación de cola', {
            comandaId,
            platoId,
            comandaNumber: comanda.comandaNumber
          });
        } else {
          const esSup = esSupervisorCocina(req.admin);
          const supervisorBypass = esSup && !cfgCocina.solicitudOrdenFueraDeCola;
          const overrideAprobado = await tieneOverrideOrdenVigente(
            plato, comandaId, plato._id || platoId
          );

          if (!supervisorBypass && !overrideAprobado) {
            // Solo validar cola si el plato está atribuido a un cocinero
            if (cocineroAtribuidoId) {
              const { ok } = await puedeFinalizarSegunOrdenCola(
                comandaId, platoIndex, cocineroAtribuidoId, loteCola
              );
              if (!ok) {
                return res.status(409).json({
                  success: false,
                  error: 'ORDEN_COLA_REQUERIDO',
                  message: 'Debe finalizar en orden desde el #1 (prefijo contiguo) o enviar Solicitar Orden.'
                });
              }
            }
          }

          if (overrideAprobado) {
            consumirOverride = true;
            logger.info('[FinalizarPlato] Override one-shot autorizado', { comandaId, platoId });
          }
        }
      }
    } catch (errOrden) {
      logger.error('[FinalizarPlato] Error validando orden de cola', { error: errOrden.message });
      // Ante fallo de validación, no bloquear el flujo crítico (fail-open documentado)
    }

    // PLAN AGRUPACION_GUARNICIONES_AUTOCIERRE §3.1: se aplica más abajo
    // al armar updateSet (todas las guarniciones de ESE plato).

    // Obtener info del cocinero atribuido (el que tomó el plato)
    cocineroAtribuidoInfo = await getCocineroInfo(cocineroAtribuidoId);

    // PRESERVAR el timestamp en que el cocinero TOMÓ el plato (procesandoPor.timestamp)
    // antes de limpiarlo. Lo guardamos en procesadoPor.tomadoEn para no perderlo.
    const tomadoEnTimestamp = resolverTomadoEnAlFinalizar(plato);
    const ahora = moment().tz('America/Lima').toDate();

    const updateSet = {
      [`platos.${platoIndex}.estado`]: 'recoger',
      [`platos.${platoIndex}.tiempos.recoger`]: ahora,
      [`platos.${platoIndex}.procesadoPor`]: {
        ...cocineroAtribuidoInfo,
        // timestamp = momento de FINALIZACIÓN (cuando el cocinero marcó listo).
        timestamp: ahora,
        tomadoEn: tomadoEnTimestamp
      },
      [`platos.${platoIndex}.procesandoPor`]: {
        cocineroId: null,
        nombre: null,
        alias: null,
        timestamp: null
      },
      // Consumir override one-shot al finalizar
      [`platos.${platoIndex}.overrideOrdenCola`]: false,
      updatedAt: ahora,
      updatedBy: cocineroId
    };

    try {
      const cfgCocinaGuarniciones = await leerConfigCocina();
      if (cfgCocinaGuarniciones.permitirGuarnicionesSeparadas !== false) {
        Object.assign(updateSet, buildAutocierreGuarnicionesSet(plato, platoIndex, ahora));
      }
    } catch (errG) {
      logger.warn('[FinalizarPlato] Auto-cierre de guarniciones falló (no crítico)', { error: errG.message });
    }

    if (supervisorOverride) {
      updateSet[`platos.${platoIndex}.finalizadoPor`] = {
        usuarioId: cocineroId,
        nombre: req.admin?.name || req.admin?.nombre || 'Supervisor',
        rol: req.admin?.rol || 'supervisor',
        timestamp: ahora
      };
    }

    await Comanda.updateOne(
      { _id: comandaId },
      { $set: updateSet }
    );

    // Marcar solicitud(es) aprobadas de este plato como override ya usado
    if (consumirOverride) {
      try {
        const SolicitudGestionModel = mongoose.models.SolicitudGestion;
        if (SolicitudGestionModel) {
          await SolicitudGestionModel.updateMany(
            {
              comandaId,
              platoId: plato._id || platoId,
              estado: 'aprobada',
              overrideUsado: { $ne: true }
            },
            { $set: { overrideUsado: true } }
          );
        }
      } catch (eCons) {
        logger.warn('[FinalizarPlato] No se pudo marcar overrideUsado', { error: eCons.message });
      }
    }
    
    // Emitir evento Socket
    if (global.emitPlatoActualizado) {
      global.emitPlatoActualizado(comandaId, platoId, 'recoger');
    }

    // Emitir a dashboard de rendimiento cocineros
    if (global.emitRendimientoCocineroActualizado) {
      global.emitRendimientoCocineroActualizado({
        tipo: 'plato_finalizado',
        cocineroId: cocineroAtribuidoId?.toString(),
        supervisorOverride
      });
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
        const statusAnterior = comandaActualizada.status;
        global.emitComandaActualizada(comandaId, statusAnterior, 'recoger');
      }
    }
    
    logger.info('Plato finalizado', {
      comandaId,
      platoId,
      cocineroId: cocineroAtribuidoId,
      supervisorOverride,
      estado: 'recoger'
    });
    
    // Incrementar contador de platos preparados del cocinero ATRIBUIDO (async, no bloquea)
    cocinerosRepository.incrementarPlatosPreparados(cocineroAtribuidoId, 1).catch(err => {
      logger.warn('No se pudo incrementar platos preparados', { error: err.message });
    });
    
    res.json({
      success: true,
      message: 'Plato finalizado correctamente',
      data: {
        comandaId,
        platoId,
        estado: 'recoger',
        procesadoPor: cocineroAtribuidoInfo,
        supervisorOverride,
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
 * @param {boolean} forzar - Si es true, permite reasignar aunque esté tomada por otro (solo supervisor/admin)
 */
router.put('/comanda/:id/procesando', adminAuth, async (req, res) => {
  try {
    const { id: comandaId } = req.params;
    const { cocineroId, forzar = false } = req.body;
    
    logger.info('[TomarComanda] Request recibido', { comandaId, cocineroId, forzar });
    
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
    // EXCEPCIÓN: Si forzar=true y el usuario tiene permisos de supervisor, permitir reasignación
    if (comanda.procesandoPor?.cocineroId && 
        comanda.procesandoPor.cocineroId.toString() !== cocineroId) {
      
      // Si no tiene permisos de supervisor o no está forzando, rechazar
      const esSupervisor = esSupervisorCocina(req.admin);
      if (!forzar || !esSupervisor) {
        return res.status(409).json({
          success: false,
          error: 'Esta comanda ya está siendo procesada por otro cocinero',
          procesandoPor: comanda.procesandoPor
        });
      }
      
      // Si es supervisor y está forzando, permitir la reasignación
      logger.info('[TomarComanda] Reasignación forzada por supervisor', {
        comandaId,
        cocineroAnterior: comanda.procesandoPor,
        cocineroNuevo: cocineroId,
        supervisorId: req.admin.id
      });
    }
    
    const cocineroInfo = await getCocineroInfo(cocineroId);
    const timestampAhora = moment().tz('America/Lima').toDate();
    
    // v7.4: Asignar procesandoPor a nivel de comanda usando updateOne
    await Comanda.updateOne(
      { _id: comandaId },
      {
        $set: {
          procesandoPor: {
            ...cocineroInfo,
            timestamp: timestampAhora
          },
          updatedAt: timestampAhora,
          updatedBy: cocineroId
        }
      }
    );
    
    // v7.4: Tomar TODOS los platos disponibles (igual que "Tomar Plato" pero en masa)
    // Si forzar=true, tomar también los platos que están tomados por otros
    let platosTomados = 0;
    
    if (comanda.platos && Array.isArray(comanda.platos)) {
      for (let i = 0; i < comanda.platos.length; i++) {
        const plato = comanda.platos[i];
        
        // Solo tomar platos que no estén eliminados ni anulados
        if (!plato.eliminado && !plato.anulado) {
          const tomadoPorOtro = plato.procesandoPor?.cocineroId && 
                                plato.procesandoPor.cocineroId.toString() !== cocineroId;
          
          // Si no está tomado por nadie, o si está tomado por otro pero forzar=true
          const debeTomar = !plato.procesandoPor?.cocineroId || (forzar && tomadoPorOtro);
          
          if (debeTomar) {
            // Usar updateOne para garantizar que se guarde
            await Comanda.updateOne(
              { _id: comandaId },
              {
                $set: {
                  [`platos.${i}.procesandoPor`]: {
                    ...cocineroInfo,
                    timestamp: timestampAhora
                  },
                  [`platos.${i}.estado`]: plato.estado === 'pedido' ? 'en_espera' : plato.estado,
                  ...(plato.estado === 'pedido' && { [`platos.${i}.tiempos.en_espera`]: timestampAhora })
                }
              }
            );
            platosTomados++;
          }
        }
      }
    }
    
    logger.info('[TomarComanda] Comanda tomada con platos', { 
      comandaId, 
      cocineroId, 
      platosTomados 
    });
    
    // Obtener comanda actualizada poblada para emitir
    const comandaActualizada = await Comanda.findById(comandaId)
      .populate({ path: "platos.plato", select: "nombre precio categoria nombreCocina tipo tipos complementosUnidosAlPlato" })
      .lean();
    
    // Emitir evento Socket con la comanda completa actualizada
    if (global.emitComandaProcesando) {
      global.emitComandaProcesando(comandaId, cocineroInfo, comandaActualizada);
    }

    if (global.emitRendimientoCocineroActualizado) {
      global.emitRendimientoCocineroActualizado({
        tipo: 'comanda_tomada',
        comandaId,
        cocineroId: cocineroId?.toString()
      });
    }
    
    res.json({
      success: true,
      message: 'Comanda tomada para preparación',
      data: {
        comandaId,
        procesandoPor: cocineroInfo,
        platosTomados,
        comanda: comandaActualizada
      }
    });
    
  } catch (error) {
    logger.error('[TomarComanda] Error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/comanda/:id/procesando
 * Libera una comanda que se había tomado (Dejar Comanda)
 * v7.4: También libera todos los platos que fueron tomados junto con la comanda
 * v7.4.1: Registra auditoría con motivo
 */
router.delete('/comanda/:id/procesando', adminAuth, async (req, res) => {
  try {
    const { id: comandaId } = req.params;
    const { cocineroId, motivo } = req.body;
    
    logger.info('[DejarComanda] Request recibido', { comandaId, cocineroId, motivo });
    
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
    
    // EXCEPCIÓN: Un supervisor/admin puede liberar comandas de otros
    const esSupervisor = esSupervisorCocina(req.admin);
    
    if (comanda.procesandoPor.cocineroId.toString() !== cocineroId) {
      if (!esSupervisor) {
        return res.status(403).json({
          success: false,
          error: 'Solo el cocinero que tomó la comanda puede liberarla'
        });
      }
      logger.info('[LiberarComanda] Supervisor liberando comanda de otro cocinero', {
        comandaId,
        cocineroOriginal: comanda.procesandoPor.cocineroId,
        supervisorId: cocineroId,
        rol: req.admin.rol
      });
    }
    
    // Snapshot antes para auditoría
    const snapshotAntes = {
      comandaId,
      comandaNumber: comanda.comandaNumber,
      procesandoPor: comanda.procesandoPor,
      platosTomados: comanda.platos?.filter(p => p.procesandoPor?.cocineroId).length || 0
    };
    
    const timestampAhora = moment().tz('America/Lima').toDate();
    
    // 1. Liberar procesandoPor a nivel de comanda
    await Comanda.updateOne(
      { _id: comandaId },
      {
        $set: {
          procesandoPor: {
            cocineroId: null,
            nombre: null,
            alias: null,
            timestamp: null
          },
          updatedAt: timestampAhora
        }
      }
    );
    
    // 2. Liberar TODOS los platos que estaban siendo procesados
    // Si es supervisor, liberar TODOS los platos con procesandoPor
    // Si es cocinero normal, solo liberar los que tienen SU cocineroId
    let platosLiberados = 0;
    if (comanda.platos && Array.isArray(comanda.platos)) {
      for (let i = 0; i < comanda.platos.length; i++) {
        const plato = comanda.platos[i];
        
        // Supervisor: liberar TODOS los platos con procesandoPor
        // Cocinero normal: solo liberar platos asignados a él
        const debeLiberar = esSupervisor 
          ? plato.procesandoPor?.cocineroId  // Supervisor: cualquier plato tomado
          : plato.procesandoPor?.cocineroId?.toString() === cocineroId;  // Cocinero: solo los suyos
        
        if (debeLiberar) {
          await Comanda.updateOne(
            { _id: comandaId },
            {
              $set: {
                [`platos.${i}.procesandoPor`]: {
                  cocineroId: null,
                  nombre: null,
                  alias: null,
                  timestamp: null
                }
              }
            }
          );
          platosLiberados++;
        }
      }
    }
    
    // 3. Registrar auditoría
    req.auditoria = {
      accion: 'COMANDA_DEJADA_COCINA',
      entidadTipo: 'comanda',
      entidadId: comandaId,
      usuario: cocineroId,
      ip: req.ip || req.connection?.remoteAddress || null,
      deviceId: req.headers['device-id'] || req.headers['x-device-id'] || null,
      metadata: {
        comandaNumber: comanda.comandaNumber,
        platosLiberados,
        mesaNum: comanda.mesas?.nummesa || 'N/A'
      },
      comandaNumber: comanda.comandaNumber
    };
    
    const motivoAuditoria = motivo || 'Cocinero liberó la comanda';
    await registrarAuditoria(req, snapshotAntes, { liberada: true, platosLiberados }, motivoAuditoria);
    
    logger.info('[DejarComanda] Comanda liberada', { 
      comandaId, 
      cocineroId, 
      platosLiberados,
      motivo: motivoAuditoria
    });
    
    // 4. Emitir evento Socket con la comanda completa actualizada
    const comandaActualizada = await Comanda.findById(comandaId)
      .populate({ path: "platos.plato", select: "nombre precio categoria nombreCocina tipo tipos complementosUnidosAlPlato" })
      .lean();
    
    if (global.emitComandaLiberada) {
      global.emitComandaLiberada(comandaId, cocineroId, comandaActualizada);
    }

    if (global.emitRendimientoCocineroActualizado) {
      global.emitRendimientoCocineroActualizado({
        tipo: 'comanda_liberada',
        comandaId,
        cocineroId: cocineroId?.toString()
      });
    }
    
    res.json({
      success: true,
      message: 'Comanda liberada correctamente',
      data: {
        comandaId,
        platosLiberados,
        comanda: comandaActualizada
      }
    });
    
  } catch (error) {
    logger.error('[DejarComanda] Error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/comanda/:id/finalizar
 * Finaliza una comanda completa (marca todos los platos como 'recoger')
 * v7.4: Sistema de 3 estados para Finalizar Comanda
 *
 * Atribución (paridad con PUT .../plato/:platoId/finalizar):
 * - procesadoPor = cocinero que TOMÓ el plato/comanda (no el supervisor/admin que pulsa Finalizar)
 * - finalizadoPor = quien ejecutó la acción si es override de supervisor
 */
router.put('/comanda/:id/finalizar', adminAuth, async (req, res) => {
  try {
    const { id: comandaId } = req.params;
    const { cocineroId } = req.body;
    
    logger.info('[FinalizarComanda] Request recibido', { comandaId, cocineroId });
    
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
    
    // Verificar que la comanda está siendo procesada por este cocinero
    // EXCEPCIÓN: Un supervisor/admin puede finalizar comandas de otros
    let supervisorOverride = false;
    const cocineroTitularComandaId = comanda.procesandoPor?.cocineroId || null;
    if (cocineroTitularComandaId &&
        cocineroTitularComandaId.toString() !== cocineroId.toString()) {
      const esSupervisor = esSupervisorCocina(req.admin);
      if (!esSupervisor) {
        return res.status(403).json({
          success: false,
          error: 'Solo el cocinero que tomó la comanda puede finalizarla'
        });
      }
      supervisorOverride = true;
      logger.info('[FinalizarComanda] Supervisor finalizando comanda de otro cocinero', {
        comandaId,
        cocineroOriginal: cocineroTitularComandaId,
        supervisorId: cocineroId,
        rol: req.admin.rol
      });
    }

    // Fallback de atribución a nivel comanda (si un plato no tiene procesandoPor propio)
    const cocineroAtribuidoComandaId = cocineroTitularComandaId || cocineroId;
    const cocineroAtribuidoComandaInfo = await getCocineroInfo(cocineroAtribuidoComandaId);
    const supervisorInfo = supervisorOverride
      ? {
          usuarioId: cocineroId,
          nombre: req.admin?.name || req.admin?.nombre || 'Supervisor',
          rol: req.admin?.rol || 'supervisor'
        }
      : null;
    const timestampAhora = moment().tz('America/Lima').toDate();
    
    // Finalizar TODOS los platos que no estén ya finalizados
    let platosFinalizados = 0;
    let platosYaListos = 0;
    
    if (comanda.platos && Array.isArray(comanda.platos)) {
      for (let i = 0; i < comanda.platos.length; i++) {
        const plato = comanda.platos[i];
        
        // Saltar platos eliminados o anulados
        if (plato.eliminado || plato.anulado) continue;
        
        const estado = plato.estado || 'en_espera';
        
        // Solo finalizar platos que no estén ya en 'recoger' o 'entregado'
        if (estado !== 'recoger' && estado !== 'entregado' && estado !== 'salio' && estado !== 'pagado') {
          // Atribuir al cocinero que TOMÓ el plato; si no hay, al de la comanda
          const cocineroPlatoId = plato.procesandoPor?.cocineroId || cocineroAtribuidoComandaId;
          const cocineroPlatoInfo = (cocineroPlatoId?.toString() === cocineroAtribuidoComandaId?.toString())
            ? cocineroAtribuidoComandaInfo
            : await getCocineroInfo(cocineroPlatoId);
          const tomadoEnPlatoTs = resolverTomadoEnAlFinalizar(plato)
            || comanda.procesandoPor?.timestamp
            || null;

          const updateSet = {
            [`platos.${i}.estado`]: 'recoger',
            [`platos.${i}.tiempos.recoger`]: timestampAhora,
            [`platos.${i}.procesadoPor`]: {
              ...cocineroPlatoInfo,
              // timestamp = momento de FINALIZACIÓN.
              timestamp: timestampAhora,
              // tomadoEn = momento en que el cocinero TOMÓ el plato.
              tomadoEn: tomadoEnPlatoTs
            },
            [`platos.${i}.procesandoPor`]: {
              cocineroId: null,
              nombre: null,
              alias: null,
              timestamp: null
            }
          };

          // Quién pulsó Finalizar (supervisor/admin), sin pisar procesadoPor del cocinero
          if (supervisorOverride && supervisorInfo) {
            updateSet[`platos.${i}.finalizadoPor`] = {
              ...supervisorInfo,
              timestamp: timestampAhora
            };
          }

          await Comanda.updateOne(
            { _id: comandaId },
            { $set: updateSet }
          );
          platosFinalizados++;
        } else if (estado === 'recoger') {
          platosYaListos++;
        }
      }
    }
    
    // Limpiar procesandoPor de la comanda
    await Comanda.updateOne(
      { _id: comandaId },
      {
        $set: {
          procesandoPor: {
            cocineroId: null,
            nombre: null,
            alias: null,
            timestamp: null
          },
          updatedAt: timestampAhora,
          updatedBy: cocineroId
        }
      }
    );
    
    // Verificar si toda la comanda está lista para cambiar status
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
            tiempoRecoger: timestampAhora
          }
        }
      );
    }
    
    // 🔥 FIX: Actualizar estado de la mesa a "preparado" cuando la comanda está lista
    // Esto es crítico para que la mesa se muestre correctamente en la app de mozos
    const Mesas = mongoose.model('mesas') || require('../database/models/mesas.model');
    const mesaId = comanda.mesas?._id || comanda.mesas;
    if (mesaId) {
      const mesa = await Mesas.findById(mesaId);
      if (mesa && mesa.estado !== 'preparado' && mesa.estado !== 'pagando' && mesa.estado !== 'pagado') {
        mesa.estado = 'preparado';
        await mesa.save();
        logger.info(`[FinalizarComanda] Mesa ${mesa.nummesa} actualizada a estado "preparado"`);
        
        // Emitir evento de mesa actualizada para sincronizar con mozos
        if (global.emitMesaActualizada) {
          await global.emitMesaActualizada(mesa._id);
        }
      }
    }
    
    // Obtener comanda completa poblada para emitir
    const comandaFinalizada = await Comanda.findById(comandaId)
      .populate({ path: "platos.plato", select: "nombre precio categoria nombreCocina tipo tipos complementosUnidosAlPlato" })
      .populate({ path: "mozos" })
      .populate({ path: "mesas", populate: { path: "area" } })
      .lean();
    
    // Emitir evento Socket — cocinero atribuido (titular), no el supervisor
    if (global.emitComandaFinalizada) {
      global.emitComandaFinalizada(comandaId, cocineroAtribuidoComandaInfo, comandaFinalizada);
    }

    if (global.emitRendimientoCocineroActualizado) {
      global.emitRendimientoCocineroActualizado({
        tipo: 'comanda_finalizada',
        comandaId,
        cocineroId: cocineroAtribuidoComandaId?.toString(),
        supervisorOverride
      });
    }
    
    // Incrementar contador del cocinero que preparó (no del supervisor)
    if (platosFinalizados > 0) {
      cocinerosRepository.incrementarPlatosPreparados(cocineroAtribuidoComandaId, platosFinalizados).catch(err => {
        logger.warn('No se pudo incrementar platos preparados', { error: err.message });
      });
    }
    
    logger.info('[FinalizarComanda] Comanda finalizada', {
      comandaId,
      cocineroId,
      cocineroAtribuidoId: cocineroAtribuidoComandaId,
      supervisorOverride,
      platosFinalizados,
      platosYaListos,
      todosListos
    });
    
    res.json({
      success: true,
      message: 'Comanda finalizada correctamente',
      data: {
        comandaId,
        platosFinalizados,
        platosYaListos,
        comandaLista: todosListos,
        procesadoPor: cocineroAtribuidoComandaInfo,
        supervisorOverride,
        finalizadoPor: supervisorInfo,
        comanda: comandaFinalizada
      }
    });
    
  } catch (error) {
    logger.error('[FinalizarComanda] Error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// PLAN OBLIGAR_ORDEN_ASIGNACION_KDS_SUPERVISOR
// API de Solicitudes de Gestión (Solicitar Orden desde KDS)
// ============================================================
const Notificacion = mongoose.model('Notificacion') || require('../database/models/notificacion.model');

// Modelo en línea (sin archivo propio) para Solicitudes de Gestión
const solicitudGestionSchema = new mongoose.Schema({
  tipo: { type: String, default: 'finalizar_fuera_de_orden', enum: ['finalizar_fuera_de_orden'] },
  comandaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comanda', required: true, index: true },
  platoId: { type: mongoose.Schema.Types.ObjectId, required: true },
  platoIndex: { type: Number, required: true },
  platoNombre: { type: String, default: '' },
  cantidad: { type: Number, default: 1 },
  cocineroId: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', default: null },
  cocineroAlias: { type: String, default: '' },
  numeroColaActual: { type: Number, default: null },
  solicitadoPor: {
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', required: true },
    nombre: { type: String, default: '' },
    rol: { type: String, default: '' }
  },
  motivo: { type: String, default: null },
  // Nota opcional del admin al resolver (sobre todo al rechazar)
  notaResolucion: { type: String, default: null, maxlength: 500 },
  estado: { type: String, default: 'pendiente', enum: ['pendiente', 'aprobada', 'rechazada', 'cancelada'], index: true },
  // true cuando el override one-shot ya se usó al finalizar el plato
  overrideUsado: { type: Boolean, default: false },
  resueltoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', default: null },
  resueltoEn: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'solicitudes_gestion' });

const SolicitudGestion = mongoose.models.SolicitudGestion
  || mongoose.model('SolicitudGestion', solicitudGestionSchema);

/** Emite eventos de solicitudes a App Mozos, Dashboard y Cocina (KDS). */
function emitirSolicitudGestion(evento, solicitudDoc) {
  try {
    const io = global.io;
    if (!io || !io.of) {
      logger.warn('[SolicitudesGestion] global.io no disponible; no se emitió ' + evento);
      return;
    }
    const raw = typeof solicitudDoc?.toObject === 'function'
      ? solicitudDoc.toObject()
      : solicitudDoc;
    // Payload plano + notaResolucion en raíz (KDS la usa en el toast de rechazo)
    const payload = JSON.parse(JSON.stringify({
      solicitud: raw,
      notaResolucion: raw?.notaResolucion ?? null,
      nota: raw?.notaResolucion ?? null,
      estado: raw?.estado ?? null,
      platoNombre: raw?.platoNombre ?? null
    }));
    io.of('/mozos').emit(evento, payload);
    io.of('/admin').emit(evento, payload);
    // Cocina también escucha aprobaciones/rechazos para toast + override
    io.of('/cocina').emit(evento, payload);
    logger.info('[SolicitudesGestion] Socket emitido', {
      evento,
      solicitudId: payload.solicitud?._id,
      estado: payload.estado,
      conNota: !!payload.notaResolucion,
      namespaces: ['mozos', 'admin', 'cocina']
    });
  } catch (e) {
    logger.warn('[SolicitudesGestion] Error emitiendo socket', { evento, error: e.message });
  }
}

/**
 * Notifica al solicitante (supervisor/cocinero) el resultado de su Solicitar Orden.
 * Misma vía Notificacion + socket que usa el dashboard; el KDS además escucha
 * `solicitud-gestion-actualizada` para el toast.
 */
async function notificarResolucionAlSolicitante(solicitud, { aprobada, nota }) {
  const destinatarioId = solicitud?.solicitadoPor?.usuarioId;
  if (!destinatarioId) {
    logger.warn('[SolicitudesGestion] Sin solicitadoPor.usuarioId; no se notifica resolución');
    return;
  }

  const plato = solicitud.platoNombre || 'plato';
  const cola = solicitud.numeroColaActual != null ? `#${solicitud.numeroColaActual}` : '';
  const notaTxt = (nota && String(nota).trim()) ? String(nota).trim() : null;

  const titulo = aprobada
    ? 'Orden autorizada'
    : 'Orden rechazada';
  const mensajeBase = aprobada
    ? `El admin autorizó finalizar "${plato}" ${cola}. Ya puede finalizar el plato.`
    : `El admin rechazó finalizar "${plato}" ${cola}.`;
  const mensaje = notaTxt
    ? `${mensajeBase} Nota: ${notaTxt}`
    : mensajeBase;

  try {
    const notificacion = await Notificacion.create({
      tipo: 'sistema',
      titulo,
      mensaje,
      icono: aprobada ? '✅' : '❌',
      entidadId: solicitud._id,
      entidadTipo: 'comanda',
      destinatario: destinatarioId,
      rolesDestinatarios: ['supervisor', 'cocinero', 'admin'],
      leida: false,
      accion: {
        tipo: 'none',
        datos: {
          solicitudId: String(solicitud._id),
          estado: aprobada ? 'aprobada' : 'rechazada',
          notaResolucion: notaTxt
        }
      },
      prioridad: aprobada ? 7 : 8,
      metadata: {
        solicitudGestionId: String(solicitud._id),
        tipo: aprobada ? 'solicitud_orden_aprobada' : 'solicitud_orden_rechazada',
        comandaId: String(solicitud.comandaId),
        platoId: String(solicitud.platoId),
        platoNombre: plato,
        notaResolucion: notaTxt
      }
    });

    if (typeof global.emitNotificacion === 'function') {
      await global.emitNotificacion(notificacion);
    }
    // emitNotificacion solo llega a /admin. El KDS supervisor está en /cocina.
    if (global.io?.of) {
      const payload = typeof notificacion.toObject === 'function'
        ? notificacion.toObject()
        : notificacion;
      const nsp = global.io.of('/cocina');
      nsp.emit('nueva-notificacion', payload);
      nsp.to(`cocinero-${String(destinatarioId)}`).emit('nueva-notificacion', payload);
    }
  } catch (eNotif) {
    logger.warn('[SolicitudesGestion] No se pudo notificar al solicitante', { error: eNotif.message });
  }
}

/** Registra aprobar/rechazar Solicitar Orden en auditoria_acciones (auditoria.html). */
async function auditarResolucionSolicitud(req, solicitud, { aprobada, nota }) {
  try {
    const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
    const usuarioId = req.admin?._id || req.admin?.id || null;
    const usuarioNombre = req.admin?.nombre || req.admin?.name || req.admin?.usuario || null;
    const notaTxt = (nota && String(nota).trim()) ? String(nota).trim() : null;

    await AuditoriaAcciones.create({
      accion: aprobada ? 'SOLICITUD_ORDEN_APROBADA' : 'SOLICITUD_ORDEN_RECHAZADA',
      entidadId: solicitud.comandaId || solicitud._id,
      entidadTipo: 'comanda',
      usuario: usuarioId,
      usuarioNombre,
      motivo: notaTxt || (aprobada
        ? 'Admin aprobó Solicitar Orden (override one-shot)'
        : 'Admin rechazó Solicitar Orden'),
      datosAntes: {
        solicitudId: solicitud._id,
        estado: 'pendiente',
        platoNombre: solicitud.platoNombre,
        numeroColaActual: solicitud.numeroColaActual
      },
      datosDespues: {
        solicitudId: solicitud._id,
        estado: aprobada ? 'aprobada' : 'rechazada',
        platoNombre: solicitud.platoNombre,
        platoId: solicitud.platoId,
        platoIndex: solicitud.platoIndex,
        comandaId: solicitud.comandaId,
        notaResolucion: notaTxt,
        solicitadoPor: solicitud.solicitadoPor
      },
      metadata: {
        solicitudGestionId: String(solicitud._id),
        tipo: 'solicitar_orden',
        cocineroAlias: solicitud.cocineroAlias || null,
        numeroColaActual: solicitud.numeroColaActual,
        notaResolucion: notaTxt,
        ip: req.ip || req.connection?.remoteAddress || null
      },
      ip: req.ip || req.connection?.remoteAddress || null,
      deviceId: req.headers['device-id'] || req.headers['x-device-id'] || null
    });
  } catch (auditErr) {
    logger.warn('[SolicitudesGestion] No se pudo registrar auditoría', { error: auditErr.message });
  }
}

// POST /api/solicitudes-gestion — Crear Solicitar Orden (desde KDS supervisor)
router.post('/solicitudes-gestion', adminAuth, async (req, res) => {
  try {
    const {
      comandaId, platoId, platoIndex, platoNombre, cantidad,
      cocineroId, cocineroAlias, numeroColaActual, motivo
    } = req.body;
    if (!comandaId || !platoId || platoIndex == null) {
      return res.status(400).json({ success: false, error: 'comandaId, platoId, platoIndex son requeridos' });
    }
    const cfg = await leerConfigCocina();
    if (!cfg.obligarOrdenAsignacion) {
      return res.status(409).json({ success: false, error: 'OBLIGAR_ORDEN_DESACTIVADO', message: 'No se requiere solicitud: el orden no está obligado.' });
    }
    if (cfg.solicitudOrdenFueraDeCola === false) {
      return res.status(409).json({ success: false, error: 'SOLICITUD_DESACTIVADA', message: 'Solicitud desactivada: el supervisor puede finalizar directamente.' });
    }

    const solicitud = await SolicitudGestion.create({
      tipo: 'finalizar_fuera_de_orden',
      comandaId, platoId, platoIndex,
      platoNombre: platoNombre || '',
      cantidad: cantidad || 1,
      cocineroId: cocineroId || null,
      cocineroAlias: cocineroAlias || '',
      numeroColaActual: numeroColaActual ?? null,
      solicitadoPor: {
        usuarioId: req.admin?._id || req.admin?.id,
        nombre: req.admin?.nombre || req.admin?.name || '',
        rol: req.admin?.rol || ''
      },
      motivo: motivo || null,
      estado: 'pendiente'
    });

    // Notificar al admin en el Dashboard (centro de notificaciones)
    try {
      await Notificacion.create({
        tipo: 'sistema',
        titulo: 'Solicitar Orden — finalizar fuera de secuencia',
        mensaje: `${solicitud.solicitadoPor.nombre || 'Supervisor'} pide finalizar "${solicitud.platoNombre}" (#${solicitud.numeroColaActual} de ${solicitud.cocineroAlias || 'cocinero'})`,
        icono: '🧾',
        entidadId: solicitud._id,
        entidadTipo: 'comanda',
        rolesDestinatarios: ['admin'],
        leida: false,
        accion: { tipo: 'navegar', url: `/solicitudes-gestion/${solicitud._id}`, datos: { solicitudId: solicitud._id } },
        prioridad: 8,
        metadata: { solicitudGestionId: String(solicitud._id), tipo: 'solicitar_orden' }
      });
    } catch (eNotif) {
      logger.warn('[SolicitudesGestion] No se pudo crear notificación de dashboard', { error: eNotif.message });
    }

    // Emitir socket a App Mozos (/mozos) + Dashboard (/admin) en tiempo real
    emitirSolicitudGestion('solicitud-gestion-nueva', solicitud);

    logger.info('[SolicitudesGestion] Solicitud creada', { solicitudId: solicitud._id });
    res.status(201).json({ success: true, solicitud });
  } catch (error) {
    logger.error('[SolicitudesGestion] Error al crear', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/solicitudes-gestion — Listar (para Panel de Gestión / Dashboard)
router.get('/solicitudes-gestion', adminAuth, requirePanelGestion, async (req, res) => {
  try {
    const estado = req.query.estado || 'pendiente';
    const filtro = estado === 'todas' ? {} : { estado };
    const solicitudes = await SolicitudGestion.find(filtro).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, solicitudes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/solicitudes-gestion/:id/aprobar — Aprobar => genera override one-shot en el plato
router.put('/solicitudes-gestion/:id/aprobar', adminAuth, requirePanelGestion, async (req, res) => {
  try {
    const solicitud = await SolicitudGestion.findById(req.params.id);
    if (!solicitud) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
    if (solicitud.estado !== 'pendiente') {
      return res.status(409).json({ success: false, error: 'Solicitud ya resuelta', estado: solicitud.estado });
    }

    // Marcar override one-shot en el plato (por índice + verificación de _id)
    const comanda = await Comanda.findById(solicitud.comandaId);
    if (!comanda) return res.status(404).json({ success: false, error: 'Comanda no encontrada' });

    let platoIndex = solicitud.platoIndex;
    let plato = comanda.platos?.[platoIndex];
    // Si el índice no coincide (platos reordenados), buscar por platoId
    if (!plato || String(plato._id) !== String(solicitud.platoId)) {
      platoIndex = comanda.platos.findIndex(p => String(p._id) === String(solicitud.platoId));
      plato = platoIndex >= 0 ? comanda.platos[platoIndex] : null;
    }
    if (!plato || platoIndex < 0) {
      return res.status(404).json({ success: false, error: 'Plato no encontrado en la comanda' });
    }

    // Persistencia fiable del override (updateOne $set)
    await Comanda.updateOne(
      { _id: solicitud.comandaId },
      { $set: { [`platos.${platoIndex}.overrideOrdenCola`]: true } }
    );
    solicitud.platoIndex = platoIndex; // corregir índice si cambió

    solicitud.estado = 'aprobada';
    solicitud.resueltoPor = req.admin?._id || req.admin?.id;
    solicitud.resueltoEn = new Date();
    if (req.body?.nota || req.body?.mensaje || req.body?.notaResolucion) {
      solicitud.notaResolucion = String(
        req.body.nota || req.body.mensaje || req.body.notaResolucion
      ).trim().slice(0, 500) || null;
    }
    await solicitud.save();

    // Notificar en tiempo real (App Mozos + Dashboard + Cocina)
    emitirSolicitudGestion('solicitud-gestion-actualizada', solicitud);

    // Misma notificación al solicitante (toast KDS + Notificacion)
    await notificarResolucionAlSolicitante(solicitud, {
      aprobada: true,
      nota: solicitud.notaResolucion
    });
    await auditarResolucionSolicitud(req, solicitud, {
      aprobada: true,
      nota: solicitud.notaResolucion
    });

    // Refrescar KDS: emitir actualización de plato/comanda para que el front vea overrideOrdenCola
    try {
      if (global.emitPlatoActualizado) {
        global.emitPlatoActualizado(String(solicitud.comandaId), String(solicitud.platoId), plato.estado);
      }
      if (global.io?.of) {
        const payload = {
          comandaId: String(solicitud.comandaId),
          platoId: String(solicitud.platoId),
          platoIndex,
          overrideOrdenCola: true,
          motivo: 'solicitud_orden_aprobada',
          notaResolucion: solicitud.notaResolucion || null
        };
        global.io.of('/cocina').emit('plato-override-orden', payload);
        global.io.of('/cocina').emit('comanda-actualizada', { _id: solicitud.comandaId });
      }
    } catch (eEmit) {
      logger.warn('[SolicitudesGestion] No se pudo emitir refresh a cocina', { error: eEmit.message });
    }

    logger.info('[SolicitudesGestion] Aprobada (override one-shot)', {
      solicitudId: solicitud._id,
      comandaId: solicitud.comandaId,
      platoIndex
    });
    res.json({ success: true, solicitud, mensaje: 'Override one-shot activado en el plato.' });
  } catch (error) {
    logger.error('[SolicitudesGestion] Error al aprobar', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/solicitudes-gestion/:id/rechazar — Rechazar (nota opcional + notifica solicitante)
router.put('/solicitudes-gestion/:id/rechazar', adminAuth, requirePanelGestion, async (req, res) => {
  try {
    const solicitud = await SolicitudGestion.findById(req.params.id);
    if (!solicitud) return res.status(404).json({ success: false, error: 'Solicitud no encontrada' });
    if (solicitud.estado !== 'pendiente') {
      return res.status(409).json({ success: false, error: 'Solicitud ya resuelta', estado: solicitud.estado });
    }

    const notaRaw = req.body?.nota ?? req.body?.mensaje ?? req.body?.notaResolucion ?? null;
    const nota = notaRaw != null && String(notaRaw).trim()
      ? String(notaRaw).trim().slice(0, 500)
      : null;

    solicitud.estado = 'rechazada';
    solicitud.resueltoPor = req.admin?._id || req.admin?.id;
    solicitud.resueltoEn = new Date();
    solicitud.notaResolucion = nota;
    solicitud.markModified('notaResolucion');
    await solicitud.save();

    // Releer para emitir payload con notaResolucion garantizada en el toast KDS
    const solicitudEmit = await SolicitudGestion.findById(solicitud._id);
    emitirSolicitudGestion('solicitud-gestion-actualizada', solicitudEmit || solicitud);

    // Obligatorio: notificar al que solicitó (misma vía que al aprobar)
    await notificarResolucionAlSolicitante(solicitudEmit || solicitud, { aprobada: false, nota });
    await auditarResolucionSolicitud(req, solicitudEmit || solicitud, { aprobada: false, nota });

    logger.info('[SolicitudesGestion] Rechazada', {
      solicitudId: solicitud._id,
      conNota: !!nota,
      notaPreview: nota ? nota.slice(0, 80) : null
    });
    res.json({ success: true, solicitud: solicitudEmit || solicitud });
  } catch (error) {
    logger.error('[SolicitudesGestion] Error al rechazar', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// PLAN GUARNICIONES_SEPARADAS v1.1 — Endpoints de guarniciones
// ============================================================
// Una guarnición es un subdoc complementosSeleccionados[] de un plato.
// Estos endpoints aceptan `complementoId` (el _id del subdoc) y operan sobre
// procesandoPor/estadoCocina del subdoc, NO del plato padre.
// Reutilizan las mismas reglas de permisos (supervisor/admin puede forzar).

/**
 * Helper: localiza { comanda, platoIndex, compIndex, comp } por comandaId + platoId + complementoId.
 */
async function localizarGuarnicion(comandaId, platoId, complementoId) {
    const comanda = await Comanda.findById(comandaId);
    if (!comanda) return { error: 'Comanda no encontrada', status: 404 };
    const platoIndex = findPlatoIndex(comanda.platos, platoId);
    if (platoIndex === -1) return { error: 'Plato no encontrado', status: 404 };
    const comps = comanda.platos[platoIndex].complementosSeleccionados || [];
    let compIndex = comps.findIndex(c => c._id && c._id.toString() === String(complementoId));
    // Fallback: idx:N generado en el KDS cuando el subdoc no trae _id.
    if (compIndex === -1 && typeof complementoId === 'string' && complementoId.startsWith('idx:')) {
        const n = parseInt(complementoId.slice(4), 10);
        if (!Number.isNaN(n) && n >= 0 && n < comps.length) compIndex = n;
    }
    if (compIndex === -1) return { error: 'Guarnición (complemento) no encontrada', status: 404 };
    return { comanda, platoIndex, compIndex, comp: comps[compIndex] };
}

/**
 * PUT /api/comanda/:id/plato/:platoId/guarnicion/:complementoId/procesando
 * Un cocinero toma una guarnición para prepararla.
 * Body: { cocineroId, forzar? }
 */
router.put('/comanda/:id/plato/:platoId/guarnicion/:complementoId/procesando', adminAuth, async (req, res) => {
    try {
        const { id: comandaId, platoId, complementoId } = req.params;
        const { cocineroId, forzar = false } = req.body;
        if (!cocineroId) return res.status(400).json({ success: false, error: 'cocineroId es requerido' });

        const esSupervisor = esSupervisorCocina(req.admin);

        const loc = await localizarGuarnicion(comandaId, platoId, complementoId);
        if (loc.error) return res.status(loc.status).json({ success: false, error: loc.error });
        const { comanda, platoIndex, compIndex, comp } = loc;

        const evalG = evaluarReasignacionProcesamiento({
          adminId: req.admin.id,
          esSupervisor,
          holderId: comp.procesandoPor?.cocineroId,
          nuevoCocineroId: cocineroId,
          forzar
        });
        if (!evalG.ok) {
          return res.status(evalG.status).json({
            success: false,
            error: evalG.error,
            ...(evalG.status === 409 ? { procesandoPor: comp.procesandoPor } : {})
          });
        }

        if (platoUneComplementos(comanda.platos[platoIndex])) {
            return res.status(400).json({
                success: false,
                error: 'Este plato une los complementos al principal; no se toman como guarnición aparte'
            });
        }

        // §1 plan: la guarnición NO puede ir al cocinero del plato principal (auto).
        // Pero el supervisor puede forzar override (operación manda).
        const cocineroPadreId = comanda.platos[platoIndex].procesandoPor?.cocineroId;
        if (cocineroPadreId && cocineroPadreId.toString() === cocineroId && !forzar) {
            return res.status(409).json({
                success: false,
                error: 'La guarnición no puede ir al mismo cocinero del plato principal (use forzar con supervisor si es necesario)'
            });
        }

        const cocineroInfo = await getCocineroInfo(cocineroId);
        const tomadoEn = moment().tz('America/Lima').toDate();
        const cocineroConTiempo = { ...cocineroInfo, timestamp: tomadoEn };
        const platoPadre = comanda.platos[platoIndex];
        const indices = await indicesObjetivoGuarnicion(platoPadre, compIndex);
        const grupoId = indices.length > 1 ? String(platoPadre._id || platoId) : null;
        const setFields = {
            updatedAt: tomadoEn,
            updatedBy: cocineroId
        };
        for (const i of indices) {
            setFields[`platos.${platoIndex}.complementosSeleccionados.${i}.procesandoPor`] = cocineroConTiempo;
            setFields[`platos.${platoIndex}.complementosSeleccionados.${i}.asignacionMeta`] = {
                origen: esSupervisor && forzar ? 'supervisor' : 'manual',
                regla: grupoId ? 'grupo' : 'guarnicion',
                batchId: (platoPadre.complementosSeleccionados?.[i]?.asignacionMeta?.batchId) || null,
                grupoId,
                timestamp: tomadoEn
            };
            setFields[`platos.${platoIndex}.complementosSeleccionados.${i}.estadoCocina`] = 'en_espera';
        }
        await Comanda.updateOne({ _id: comandaId }, { $set: setFields });

        const complementoIds = complementoIdsDeIndices(platoPadre, indices);
        const tipoEmit = grupoId ? 'grupo_guarniciones' : 'guarnicion';
        if (global.emitPlatoProcesando) {
            global.emitPlatoProcesando(comandaId, platoId, cocineroConTiempo, {
                complementoId, complementoIds, tipo: tipoEmit
            });
        }
        if (grupoId && global.emitComandaActualizada) {
            global.emitComandaActualizada(comandaId).catch(() => {});
        }
        if (global.emitRendimientoCocineroActualizado) {
            global.emitRendimientoCocineroActualizado({ tipo: 'guarnicion_tomada', cocineroId: cocineroId?.toString() });
        }

        logger.info('Guarnición tomada para procesamiento', { comandaId, platoId, complementoId, cocineroId, indices });
        res.json({
            success: true,
            message: 'Guarnición tomada para preparación',
            data: { comandaId, platoId, complementoId, complementoIds, procesandoPor: cocineroConTiempo }
        });
    } catch (error) {
        logger.error('Error al tomar guarnición', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/comanda/:id/plato/:platoId/guarnicion/:complementoId/pasar-a-backup
 * Reasigna una guarnición en proceso al backup de su regla.
 */
router.put('/comanda/:id/plato/:platoId/guarnicion/:complementoId/pasar-a-backup', adminAuth, async (req, res) => {
    try {
        const { id: comandaId, platoId, complementoId } = req.params;
        const loc = await localizarGuarnicion(comandaId, platoId, complementoId);
        if (loc.error) return res.status(loc.status).json({ success: false, error: loc.error });
        const { comanda, platoIndex, compIndex, comp } = loc;
        const actualId = comp.procesandoPor?.cocineroId;
        if (!actualId) {
            return res.status(400).json({ success: false, error: 'La guarnición no está en proceso' });
        }
        const estadoG = String(comp.estadoCocina || 'pedido').toLowerCase();
        if (!['pedido', 'en_espera'].includes(estadoG)) {
            return res.status(400).json({ success: false, error: 'Solo se puede pasar a backup una guarnición en proceso' });
        }
        const esSupervisor = esSupervisorCocina(req.admin);
        const soyTitular = String(req.admin?.id) === String(actualId);
        if (!soyTitular && !esSupervisor) {
            return res.status(403).json({ success: false, error: 'No tiene permisos para pasar esta guarnición a backup' });
        }
        const platoPadre = comanda.platos[platoIndex];
        const destino = await asignacionAutomaticaGuarnicionesService.resolverBackupDestinoGuarnicion(
            comp, platoPadre, actualId
        );
        if (String(destino.cocineroId) === String(actualId)) {
            return res.status(409).json({ success: false, error: 'La guarnición ya está en su backup' });
        }
        const cocineroInfo = await getCocineroInfo(destino.cocineroId);
        if (!cocineroInfo.cocineroId) {
            return res.status(404).json({ success: false, error: 'El cocinero backup no existe' });
        }
        const ahora = moment().tz('America/Lima').toDate();
        const procesandoPor = { ...cocineroInfo, timestamp: ahora };
        const indices = await indicesObjetivoGuarnicion(platoPadre, compIndex);
        const grupoId = indices.length > 1 ? String(platoPadre._id || platoId) : null;
        const setFields = { updatedAt: ahora, updatedBy: req.admin?.id || destino.cocineroId };
        for (const i of indices) {
            setFields[`platos.${platoIndex}.complementosSeleccionados.${i}.procesandoPor`] = procesandoPor;
            const reglasOk = new Set(['guarnicion', 'grupo', 'estacion', 'batch']);
            setFields[`platos.${platoIndex}.complementosSeleccionados.${i}.asignacionMeta`] = {
                origen: 'overflow',
                regla: grupoId ? 'grupo' : (reglasOk.has(destino.tipoRegla) ? destino.tipoRegla : 'guarnicion'),
                batchId: (platoPadre.complementosSeleccionados?.[i]?.asignacionMeta?.batchId) || null,
                grupoId,
                timestamp: ahora
            };
        }
        await Comanda.updateOne({ _id: comandaId }, { $set: setFields });
        try { await redisCache.invalidate(comandaId); } catch (_) { /* no bloquear */ }
        const complementoIds = complementoIdsDeIndices(platoPadre, indices);
        if (global.emitPlatoProcesando) {
            global.emitPlatoProcesando(comandaId, platoId, procesandoPor, {
                complementoId, complementoIds, tipo: grupoId ? 'grupo_guarniciones' : 'guarnicion'
            });
        }
        logger.info('Guarnición pasada a backup', { comandaId, platoId, complementoId, a: destino.cocineroId });
        res.json({
            success: true,
            message: `Guarnición enviada a backup (${cocineroInfo.alias || cocineroInfo.nombre})`,
            data: { comandaId, platoId, complementoId, complementoIds, procesandoPor }
        });
    } catch (error) {
        const status = error.statusCode || 500;
        logger.error('Error al pasar guarnición a backup', { error: error.message });
        res.status(status).json({ success: false, error: error.message || 'Error al pasar a backup' });
    }
});

/**
 * DELETE /api/comanda/:id/plato/:platoId/guarnicion/:complementoId/procesando
 * Libera una guarnición tomada (sin finalizar).
 * Misma auditoría que Dejar plato: motivo + cronómetro acumulado.
 * No toca platos[].estado (el mozo sigue gobernando el plato padre).
 */
router.delete('/comanda/:id/plato/:platoId/guarnicion/:complementoId/procesando', adminAuth, async (req, res) => {
    try {
        const { id: comandaId, platoId, complementoId } = req.params;
        const { cocineroId, motivo } = req.body;
        if (!cocineroId) return res.status(400).json({ success: false, error: 'cocineroId es requerido' });

        const loc = await localizarGuarnicion(comandaId, platoId, complementoId);
        if (loc.error) return res.status(loc.status).json({ success: false, error: loc.error });
        const { comanda, platoIndex, compIndex, comp } = loc;

        const esSupervisor = esSupervisorCocina(req.admin);
        if (comp.procesandoPor?.cocineroId && comp.procesandoPor.cocineroId.toString() !== cocineroId && !esSupervisor) {
            return res.status(403).json({ success: false, error: 'Solo el cocinero titular o un supervisor puede liberar esta guarnición' });
        }

        const ahoraLiberar = moment().tz('America/Lima').toDate();
        const crono = cronometroDesdeToma(comp.procesandoPor?.timestamp, ahoraLiberar);
        const platoPadre = comanda.platos[platoIndex];
        const indices = await indicesObjetivoGuarnicion(platoPadre, compIndex);
        const nombreG = nombreGuarnicionComp(comp);
        const nombrePadre = platoPadre?.plato?.nombre || platoPadre?.nombre || 'Plato';
        const snapshotAntes = {
            comandaId,
            comandaNumber: comanda.comandaNumber,
            platoId,
            complementoId,
            platoNombre: `🥗 ${nombreG} (${nombrePadre})`,
            procesandoPor: comp.procesandoPor,
            tomadoEn: crono.tomadoEn,
            tiempoAcumuladoSegundos: crono.segundosAcumulados,
            cronometro: crono.cronometro,
            tipoUnidad: 'guarnicion'
        };

        const fields = { updatedAt: ahoraLiberar };
        for (const i of indices) {
            fields[`platos.${platoIndex}.complementosSeleccionados.${i}.procesandoPor`] = {
                cocineroId: null, nombre: null, alias: null, timestamp: null
            };
            fields[`platos.${platoIndex}.complementosSeleccionados.${i}.estadoCocina`] = 'pedido';
        }
        await Comanda.updateOne({ _id: comandaId }, { $set: fields });
        const complementoIds = complementoIdsDeIndices(platoPadre, indices);

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
                complementoId,
                platoNombre: snapshotAntes.platoNombre,
                mesaNum: comanda.mesas?.nummesa || 'N/A',
                tipoUnidad: 'guarnicion',
                tomadoEn: crono.tomadoEn,
                tiempoAcumuladoSegundos: crono.segundosAcumulados,
                cronometro: crono.cronometro,
                cocineroAlias: comp.procesandoPor?.alias || comp.procesandoPor?.nombre || null
            },
            comandaNumber: comanda.comandaNumber
        };
        const motivoAuditoria = motivo || 'Cocinero liberó la guarnición';
        await registrarAuditoria(req, snapshotAntes, {
            liberado: true,
            tipoUnidad: 'guarnicion',
            tiempoAcumuladoSegundos: crono.segundosAcumulados,
            cronometro: crono.cronometro
        }, motivoAuditoria);

        if (global.emitPlatoLiberado) {
            global.emitPlatoLiberado(comandaId, platoId, cocineroId, {
                complementoId,
                complementoIds,
                tipo: complementoIds.length > 1 ? 'grupo_guarniciones' : 'guarnicion'
            });
        }
        if (global.emitComandaActualizada) {
            global.emitComandaActualizada(comandaId).catch(() => {});
        }
        if (global.emitRendimientoCocineroActualizado) {
            global.emitRendimientoCocineroActualizado({
                tipo: 'guarnicion_liberada',
                cocineroId: (comp.procesandoPor?.cocineroId || cocineroId)?.toString()
            });
        }
        logger.info('Guarnición liberada', { comandaId, platoId, complementoId, complementoIds, cocineroId, motivo: motivoAuditoria, cronometro: crono.cronometro });
        res.json({ success: true, message: 'Guarnición liberada', data: { complementoIds } });
    } catch (error) {
        logger.error('Error al liberar guarnición', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/comanda/:id/plato/:platoId/guarnicion/:complementoId/finalizar
 * Marca la guarnición como lista (estadoCocina: recoger) + procesadoPor.
 * No mueve platos[].estado ni el flujo mozo.
 */
router.put('/comanda/:id/plato/:platoId/guarnicion/:complementoId/finalizar', adminAuth, async (req, res) => {
    try {
        const { id: comandaId, platoId, complementoId } = req.params;
        const { cocineroId } = req.body;
        if (!cocineroId) return res.status(400).json({ success: false, error: 'cocineroId es requerido' });

        const loc = await localizarGuarnicion(comandaId, platoId, complementoId);
        if (loc.error) return res.status(loc.status).json({ success: false, error: loc.error });
        const { comanda, platoIndex, compIndex, comp } = loc;

        const esSupervisor = esSupervisorCocina(req.admin);
        if (comp.procesandoPor?.cocineroId && comp.procesandoPor.cocineroId.toString() !== cocineroId && !esSupervisor) {
            return res.status(403).json({ success: false, error: 'Solo el cocinero titular o un supervisor puede finalizar esta guarnición' });
        }

        const cocineroAtribuidoId = comp.procesandoPor?.cocineroId || cocineroId;
        const supervisorOverride = cocineroAtribuidoId.toString() !== String(cocineroId);
        const cocineroAtribuidoInfo = await getCocineroInfo(cocineroAtribuidoId);
        const ahora = moment().tz('America/Lima').toDate();
        const tomadoEn = resolverTomadoEnAlFinalizar(comp);
        const platoPadreFin = comanda.platos[platoIndex];
        const indices = await indicesObjetivoGuarnicion(platoPadreFin, compIndex);
        const setFields = {
            updatedAt: ahora
        };
        for (const i of indices) {
            const c = platoPadreFin.complementosSeleccionados?.[i] || {};
            const tomadoI = resolverTomadoEnAlFinalizar(c) || tomadoEn;
            setFields[`platos.${platoIndex}.complementosSeleccionados.${i}.estadoCocina`] = 'recoger';
            setFields[`platos.${platoIndex}.complementosSeleccionados.${i}.procesadoPor`] = {
                ...cocineroAtribuidoInfo,
                timestamp: ahora,
                tomadoEn: tomadoI
            };
            setFields[`platos.${platoIndex}.complementosSeleccionados.${i}.procesandoPor`] = {
                cocineroId: null,
                nombre: null,
                alias: null,
                timestamp: null
            };
        }
        await Comanda.updateOne({ _id: comandaId }, { $set: setFields });

        try {
            cocinerosRepository.incrementarPlatosPreparados(cocineroAtribuidoId, 1).catch(() => {});
        } catch (e) { /* no bloquea */ }

        const complementoIds = complementoIdsDeIndices(platoPadreFin, indices);
        if (global.emitPlatoProcesando) {
            global.emitPlatoProcesando(comandaId, platoId, cocineroAtribuidoInfo, {
                complementoId,
                complementoIds,
                tipo: complementoIds.length > 1 ? 'grupo_guarniciones' : 'guarnicion',
                estadoCocina: 'recoger'
            });
        }
        if (global.emitRendimientoCocineroActualizado) {
            global.emitRendimientoCocineroActualizado({
                tipo: 'guarnicion_finalizada',
                cocineroId: cocineroAtribuidoId?.toString()
            });
        }
        logger.info('Guarnición finalizada', {
            comandaId, platoId, complementoId, cocineroId,
            atribuidoA: cocineroAtribuidoId, supervisorOverride
        });
        res.json({ success: true, message: 'Guarnición lista (recoger)' });
    } catch (error) {
        logger.error('Error al finalizar guarnición', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
