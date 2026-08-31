const express = require('express');
const router = express.Router();
const CierreCajaRestaurante = require('../database/models/cierreCajaRestaurante.model');
const Comanda = require('../database/models/comanda.model');
const Plato = require('../database/models/plato.model');
const Mozo = require('../database/models/mozos.model');
const Mesa = require('../database/models/mesas.model');
const Cliente = require('../database/models/cliente.model');
const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
const Boucher = require('../database/models/boucher.model');
const ConfigCocinero = require('../database/models/configCocinero.model');
const reportesRepository = require('../repository/reportes.repository');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const { adminAuth, checkPermission } = require('../middleware/adminAuth');
const verificacionService = require('../services/cierreCajaVerificacion.service');
const {
  normalizarMotivoReversion,
  obtenerUltimoCierreVigente
} = require('../utils/cierreCajaReversion');
const { obtenerTurnosDia } = require('../utils/cierreCajaTurnosDia');
const {
  montoDescuentoComandaNum,
  montoFilaReporte,
  sumaMontosReporte,
  factorNetoComanda,
  precioPlatoNum,
  cantidadPlatoNum,
  matchComandaVigente,
  matchComandasCierrePendiente,
  matchIncluidoEnEsteCierre,
  matchComandasPeriodoDeCierre,
  STATUS_COMANDA_VENDIDA,
  esComandaVendida,
  cargarConfigMonedaEstadisticas,
  getConfigMonedaEstadisticas
} = require('../utils/estadisticasComandas');

const POPULATE_COMANDAS_CIERRE = [
  { path: 'mozos', select: 'name mozoId' },
  {
    path: 'mesas',
    select: 'nummesa area',
    populate: { path: 'area', select: 'nombre' }
  },
  { path: 'cliente', select: 'nombre DNI' },
  { path: 'platos.plato', select: 'nombre precio categoria' }
];

/**
 * POST /api/cierre-caja
 * Generar cierre de caja completo del restaurante
 */
router.post('/cierre-caja', adminAuth, checkPermission('ejecutar-cierre-caja'), async (req, res) => {
  try {
    // Paso 1: Verificar autenticación y permisos
    const usuarioAdmin = req.body.usuarioAdmin || req.headers['x-user-id'] || 'admin';

    // Paso 1b: Validar verificación de tickets antes de cerrar.
    // Si quedan tickets del período sin confirmar, el cierre se rechaza con 400.
    let resumenVerificacion = null;
    try {
      resumenVerificacion = await verificacionService.validarListoParaCerrar();
    } catch (verifErr) {
      if (verifErr.code === 'VERIFICACION_INCOMPLETA') {
        return res.status(400).json({
          error: 'VERIFICACION_INCOMPLETA',
          message: verifErr.message,
          verificacion: verifErr.resumen || null,
        });
      }
      throw verifErr;
    }

    // Paso 2: Obtener fecha del último cierre
    const { periodoInicio, periodoFin, ultimoCierre } = await verificacionService.obtenerPeriodoPendiente();
    const fechaUltimoCierre = ultimoCierre?.fechaCierre || null;
    
    logger.info('Iniciando cierre de caja', {
      usuarioAdmin,
      periodoInicio,
      periodoFin,
      fechaUltimoCierre
    });
    
    // Paso 3 y 4: mismas comandas que reportes (platos + fechas de pago), aún no cerradas
    const comandas = await Comanda.find(matchComandasCierrePendiente(periodoInicio, periodoFin))
    .populate(POPULATE_COMANDAS_CIERRE)
    .lean();
    const vendidas = comandas.filter(esComandaVendida);
    
    if (comandas.length === 0) {
      return res.status(400).json({
        error: 'No hay comandas pendientes de cerrar en el período especificado'
      });
    }
    
    // Paso 5–6: misma base que reportes (platos activos + config IGV)
    await cargarConfigMonedaEstadisticas();
    const resumenFinanciero = calcularResumenFinanciero(comandas, vendidas, periodoInicio, periodoFin);
    const productos = await analizarProductos(vendidas);
    
    // Paso 7: Evaluar desempeño de mozos (mismo total de platos que reportes)
    const mozos = await analizarMozos(vendidas);
    
    // Paso 8: Analizar uso de mesas
    const mesas = await analizarMesas(comandas);
    
    // Paso 8.5: Analizar desempeño de cocineros
    const cocineros = await analizarCocineros(comandas, periodoInicio, periodoFin);
    
    // Paso 9: Procesar información de clientes
    const clientes = analizarClientes(vendidas);
    
    // Paso 10: Recopilar auditoría de operaciones
    const auditoria = await recopilarAuditoria(periodoInicio, periodoFin, comandas);
    const comandaIds = comandas.map(c => c._id);

    // Paso 11: Crear documento de cierre
    const cierre = new CierreCajaRestaurante({
      fechaCierre: periodoFin,
      fechaUltimoCierre: fechaUltimoCierre,
      periodoInicio,
      periodoFin,
      usuarioAdmin,
      resumenFinanciero,
      productos,
      mozos,
      mesas,
      cocineros,
      clientes,
      auditoria,
      informacionOperativa: {
        horariosOperacion: {
          inicio: periodoInicio,
          fin: periodoFin
        },
        reservas: {
          cumplidas: 0,
          noCumplidas: 0
        },
        problemasReportados: [],
        notasAdmin: req.body.notasAdmin || ''
      },
      estado: 'completado',
      comandasIds: comandaIds,
      datosGraficos: generarDatosGraficos(resumenFinanciero, productos, mozos, mesas, cocineros)
    });
    
    // Paso 12: Guardar cierre en base de datos
    await cierre.save();
    
    // Paso 13: Marcar comandas como procesadas (CRÍTICO)
    await Comanda.updateMany(
      { _id: { $in: comandaIds } },
      { $set: { incluidoEnCierre: cierre._id } }
    );

    // Paso 13b: Marcar tickets verificados como incluidos en este cierre
    // (impide que reaparezcan en el siguiente cierre)
    try {
      await verificacionService.marcarTicketsComoIncluidosEnCierre(cierre._id, periodoInicio, periodoFin);
    } catch (ticketsErr) {
      logger.warn('No se pudieron marcar los tickets en el cierre (no bloquea el cierre)', {
        error: ticketsErr.message,
        cierreId: cierre._id,
      });
    }

    // Auditoría del cierre ejecutado
    try {
      await AuditoriaAcciones.create({
        accion: 'CIERRE_CAJA_EJECUTADO',
        entidadId: cierre._id,
        entidadTipo: 'cierre_caja',
        usuario: req.admin && (req.admin.id || req.admin.usuarioId),
        usuarioNombre: usuarioAdmin,
        metadata: {
          cierreId: cierre._id,
          totalComandas: resumenFinanciero.totalComandas,
          montoTotal: resumenFinanciero.montoTotalVendido,
          ticketsVerificados: resumenVerificacion?.total || 0,
          periodoInicio,
          periodoFin,
        },
      });
    } catch (auditErr) {
      logger.warn('No se registró auditoría CIERRE_CAJA_EJECUTADO', { error: auditErr.message });
    }
    
    logger.info('Cierre de caja completado exitosamente', {
      cierreId: cierre._id,
      totalComandas: resumenFinanciero.totalComandas,
      montoTotal: resumenFinanciero.montoTotalVendido
    });
    
    // Paso 15: Responder al frontend
    res.status(201).json({
      success: true,
      cierre: {
        _id: cierre._id,
        fechaCierre: cierre.fechaCierre,
        periodoInicio: cierre.periodoInicio,
        periodoFin: cierre.periodoFin,
        resumen: {
          totalComandas: resumenFinanciero.totalComandas,
          montoTotalVendido: resumenFinanciero.montoTotalVendido,
          totalDescuentos: resumenFinanciero.totalDescuentos,
          ticketPromedio: resumenFinanciero.ticketPromedio
        },
        datosGraficos: cierre.datosGraficos
      },
      message: 'Cierre de caja completado exitosamente'
    });
    
  } catch (error) {
    logger.error('Error al generar cierre de caja', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Error al generar cierre de caja',
      message: error.message
    });
  }
});

/**
 * PUT /api/cierre-caja/:id/revertir
 * Deshace el último cierre vigente: comandas y tickets vuelven al período pendiente.
 * El documento queda en historial con estado revertido y motivo de auditoría.
 */
router.put('/cierre-caja/:id/revertir', adminAuth, checkPermission('ejecutar-cierre-caja'), async (req, res) => {
  try {
    const { id } = req.params;
    let motivo;
    try {
      motivo = normalizarMotivoReversion(req.body?.motivo);
    } catch (valErr) {
      return res.status(valErr.statusCode || 400).json({
        success: false,
        error: valErr.message,
        message: valErr.message
      });
    }

    const cierre = await CierreCajaRestaurante.findById(id);
    if (!cierre) {
      return res.status(404).json({ success: false, error: 'Cierre de caja no encontrado' });
    }

    const usuarioNombre = (req.admin && (req.admin.nombre || req.admin.name || req.admin.usuario))
      || req.body.usuarioAdmin
      || 'admin';
    const usuarioId = req.admin && (req.admin.id || req.admin.usuarioId);

    const liberarMarcas = async () => {
      const idsGuardados = Array.isArray(cierre.comandasIds) ? cierre.comandasIds.filter(Boolean) : [];
      const pendientes = await Comanda.find({ incluidoEnCierre: cierre._id }).select('_id').lean();
      const idsUnset = pendientes.map((c) => c._id);
      const comandasIds = idsGuardados.length ? idsGuardados : idsUnset;
      const [comandas, tickets] = await Promise.all([
        idsUnset.length
          ? Comanda.updateMany(
            { _id: { $in: idsUnset } },
            { $set: { incluidoEnCierre: null } }
          )
          : Promise.resolve({ modifiedCount: 0 }),
        verificacionService.desmarcarTicketsDeCierre(cierre._id)
      ]);
      return {
        comandasIds,
        comandasLiberadas: comandas.modifiedCount || idsUnset.length,
        ticketsComanda: tickets.ticketsComanda || 0,
        ticketsAdelantado: tickets.ticketsAdelantado || 0
      };
    };

    if (cierre.estado === 'revertido') {
      const liberado = await liberarMarcas();
      if (!Array.isArray(cierre.comandasIds) || !cierre.comandasIds.length) {
        cierre.comandasIds = liberado.comandasIds;
        await cierre.save();
      }
      return res.json({
        success: true,
        alreadyReverted: true,
        message: 'El cierre ya estaba revertido; se reaplicó la liberación de comandas y tickets',
        cierreId: cierre._id,
        ...liberado
      });
    }

    const ultimo = await obtenerUltimoCierreVigente(CierreCajaRestaurante, '_id fechaCierre estado');
    if (!ultimo || String(ultimo._id) !== String(cierre._id)) {
      return res.status(400).json({
        success: false,
        error: 'Solo se puede revertir el último cierre vigente. Revierte primero los posteriores.'
      });
    }

    if (cierre.estado !== 'completado') {
      return res.status(400).json({
        success: false,
        error: 'Este cierre no se puede revertir'
      });
    }

    const reversion = {
      fecha: moment.tz('America/Lima').toDate(),
      usuario: usuarioNombre,
      usuarioId: usuarioId || undefined,
      motivo
    };

    cierre.estado = 'revertido';
    cierre.reversion = reversion;
    await cierre.save();

    const liberado = await liberarMarcas();
    if (!Array.isArray(cierre.comandasIds) || !cierre.comandasIds.length) {
      cierre.comandasIds = liberado.comandasIds;
      await cierre.save();
    }

    try {
      await AuditoriaAcciones.create({
        accion: 'CIERRE_CAJA_REVERTIDO',
        entidadId: cierre._id,
        entidadTipo: 'cierre_caja',
        usuario: usuarioId,
        usuarioNombre,
        motivo,
        ip: req.headers['x-forwarded-for'] || req.ip || null,
        datosAntes: { estado: 'completado' },
        datosDespues: { estado: 'revertido' },
        metadata: {
          cierreId: cierre._id,
          motivo,
          comandasLiberadas: liberado.comandasLiberadas,
          ticketsComanda: liberado.ticketsComanda,
          ticketsAdelantado: liberado.ticketsAdelantado,
          periodoInicio: cierre.periodoInicio,
          periodoFin: cierre.periodoFin,
          montoTotal: cierre.resumenFinanciero?.montoTotalVendido
        }
      });
    } catch (auditErr) {
      logger.warn('No se registró auditoría CIERRE_CAJA_REVERTIDO', { error: auditErr.message });
    }

    logger.info('Cierre de caja revertido', {
      cierreId: cierre._id,
      motivo,
      usuarioNombre,
      comandasLiberadas: liberado.comandasLiberadas
    });

    res.json({
      success: true,
      message: 'Cierre de caja revertido. Las comandas volvieron al período pendiente.',
      cierreId: cierre._id,
      reversion,
      comandasLiberadas: liberado.comandasLiberadas,
      ticketsComanda: liberado.ticketsComanda,
      ticketsAdelantado: liberado.ticketsAdelantado
    });
  } catch (error) {
    logger.error('Error al revertir cierre de caja', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Error al revertir cierre de caja',
      message: error.message
    });
  }
});

/**
 * GET /api/cierre-caja/historial
 * Listar cierres históricos con paginación y filtros
 */
router.get('/cierre-caja/historial', adminAuth, checkPermission('ver-cierre-caja'), async (req, res) => {
  try {
    const { fechaDesde, fechaHasta, page = 1, limit = 20 } = req.query;
    
    const filtros = {};
    if (fechaDesde || fechaHasta) {
      filtros.fechaCierre = {};
      if (fechaDesde) {
        filtros.fechaCierre.$gte = new Date(fechaDesde);
      }
      if (fechaHasta) {
        const fechaHastaFin = new Date(fechaHasta);
        fechaHastaFin.setHours(23, 59, 59, 999);
        filtros.fechaCierre.$lte = fechaHastaFin;
      }
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const cierres = await CierreCajaRestaurante.find(filtros)
      .sort({ fechaCierre: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('fechaCierre periodoInicio periodoFin resumenFinanciero usuarioAdmin estado reversion')
      .lean();
    
    const total = await CierreCajaRestaurante.countDocuments(filtros);
    
    res.json({
      cierres,
      paginacion: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    logger.error('Error al obtener historial de cierres', { error: error.message });
    res.status(500).json({
      error: 'Error al obtener historial de cierres',
      message: error.message
    });
  }
});

/**
 * GET /api/cierre-caja/turnos-dia
 * Cierres vigentes del día Lima: activa filtros DIA/NOCHE en comandas.
 * Debe ir ANTES de /cierre-caja/:id.
 */
router.get('/cierre-caja/turnos-dia', adminAuth, async (req, res) => {
  try {
    const data = await obtenerTurnosDia(CierreCajaRestaurante);
    res.json(data);
  } catch (error) {
    logger.error('Error al obtener turnos del día', { error: error.message });
    res.status(500).json({
      error: 'Error al obtener turnos del día',
      message: error.message
    });
  }
});

/**
 * GET /api/cierre-caja/:id
 * Obtener un cierre específico con todos sus detalles
 */
router.get('/cierre-caja/:id', adminAuth, checkPermission('ver-cierre-caja'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const cierre = await CierreCajaRestaurante.findById(id).lean();

    if (!cierre) {
      return res.status(404).json({ error: 'Cierre de caja no encontrado' });
    }

    try {
      const live = await recopilarAuditoria(cierre.periodoInicio, cierre.periodoFin, []);
      cierre.auditoria = mergeAuditoriaCierre(cierre.auditoria, live);
    } catch (audErr) {
      logger.warn('No se pudo enriquecer auditoría del cierre', { error: audErr.message, cierreId: id });
    }

    res.json(cierre);
    
  } catch (error) {
    logger.error('Error al obtener cierre de caja', { error: error.message });
    res.status(500).json({
      error: 'Error al obtener cierre de caja',
      message: error.message
    });
  }
});

/**
 * GET /api/cierre-caja/estado/actual
 * Obtener estado actual sin cerrar (para mostrar en panel)
 */
router.get('/cierre-caja/estado/actual', adminAuth, checkPermission('ver-cierre-caja'), async (req, res) => {
  try {
    const { periodoInicio, periodoFin, ultimoCierre } = await verificacionService.obtenerPeriodoPendiente();
    
    const cfg = await cargarConfigMonedaEstadisticas();

    const comandasPendientes = await Comanda.countDocuments(
      matchComandasCierrePendiente(periodoInicio, periodoFin)
    );

    const vendidas = await Comanda.find(matchComandasCierrePendiente(periodoInicio, periodoFin, { soloVendidas: true }))
      .select('platos cantidades totalCalculado precioTotal precioTotalOriginal descuento montoDescuento totalSinDescuento status')
      .populate('platos.plato', 'nombre precio categoria')
      .lean();

    const montoPendiente = sumaMontosReporte(vendidas, cfg);
    const descuentosPendientes = Number(
      vendidas.reduce((s, c) => s + montoDescuentoComandaNum(c), 0).toFixed(2)
    );
    
    const diasTranscurridos = ultimoCierre 
      ? Math.floor((periodoFin - ultimoCierre.fechaCierre) / (1000 * 60 * 60 * 24))
      : Math.floor((periodoFin - periodoInicio) / (1000 * 60 * 60 * 24));

    // Contadores de verificación de tickets del período
    let verificacion = { total: 0, confirmados: 0, pendientes: 0, puedeCerrar: true };
    try {
      const resumenVerif = await verificacionService.obtenerResumenVerificacion();
      verificacion = {
        total: resumenVerif.total,
        confirmados: resumenVerif.confirmados,
        pendientes: resumenVerif.pendientes,
        puedeCerrar: resumenVerif.puedeCerrar,
      };
    } catch (verifErr) {
      logger.warn('No se pudo obtener resumen de verificación para estado/actual', { error: verifErr.message });
    }

    res.json({
      ultimoCierre: ultimoCierre?.fechaCierre || null,
      ultimoCierreId: ultimoCierre?._id || null,
      periodoInicio,
      periodoFin,
      diasTranscurridos,
      comandasPendientes,
      montoPendiente,
      descuentosPendientes,
      verificacion
    });
    
  } catch (error) {
    logger.error('Error al obtener estado actual', { error: error.message });
    res.status(500).json({
      error: 'Error al obtener estado actual',
      message: error.message
    });
  }
});

// ============================================
// VERIFICACIÓN DE TICKETS ANTES DEL CIERRE
// ============================================

/**
 * GET /api/cierre-caja/verificacion/tickets
 * Lista unificada de tickets (adelantados + comandas) del período pendiente.
 */
router.get('/cierre-caja/verificacion/tickets', adminAuth, checkPermission('ver-cierre-caja'), async (req, res) => {
  try {
    const resultado = await verificacionService.listarTicketsParaVerificacion();
    res.json({ success: true, ...resultado });
  } catch (error) {
    logger.error('Error al listar tickets para verificación', { error: error.message });
    res.status(500).json({ success: false, error: 'Error al listar tickets', message: error.message });
  }
});

/**
 * GET /api/cierre-caja/verificacion/estado
 * Resumen de verificación (KPIs y puedeCerrar).
 */
router.get('/cierre-caja/verificacion/estado', adminAuth, checkPermission('ver-cierre-caja'), async (req, res) => {
  try {
    const resumen = await verificacionService.obtenerResumenVerificacion();
    res.json({ success: true, ...resumen });
  } catch (error) {
    logger.error('Error al obtener resumen de verificación', { error: error.message });
    res.status(500).json({ success: false, error: 'Error al obtener resumen', message: error.message });
  }
});

/**
 * GET /api/cierre-caja/verificacion/tickets/:id
 * Detalle completo de un ticket (comandas, mozo, cocinero, boucher).
 * Query: tipo=COMANDA|ADELANTADO (opcional, autodetecta si no se indica).
 */
router.get('/cierre-caja/verificacion/tickets/:id', adminAuth, checkPermission('ver-cierre-caja'), async (req, res) => {
  try {
    const { id } = req.params;
    const tipo = req.query.tipo ? String(req.query.tipo).toUpperCase() : null;
    const detalle = await verificacionService.obtenerDetalleTicket(id, tipo);
    res.json({ success: true, ticket: detalle });
  } catch (error) {
    logger.error('Error al obtener detalle de ticket', { error: error.message });
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: 'Error al obtener detalle', message: error.message });
  }
});

/**
 * PUT /api/cierre-caja/verificacion/tickets/:id/confirmar
 * Confirma (verifica) un ticket del período.
 * Body: { tipo?: 'COMANDA'|'ADELANTADO', usuarioId, usuarioNombre }
 */
router.put('/cierre-caja/verificacion/tickets/:id/confirmar', adminAuth, checkPermission('ver-cierre-caja'), async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, usuarioId, usuarioNombre } = req.body;
    // Tomar usuario del token si no viene explícito
    const uId = usuarioId || (req.admin && (req.admin.id || req.admin.usuarioId));
    const uNombre = usuarioNombre || (req.admin && (req.admin.nombre || req.admin.name)) || 'cajero';
    const resultado = await verificacionService.confirmarTicket(
      id,
      tipo ? String(tipo).toUpperCase() : null,
      uId,
      uNombre
    );
    res.json({ success: true, ticket: resultado.ticket });
  } catch (error) {
    logger.error('Error al confirmar ticket', { error: error.message });
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: 'Error al confirmar ticket', message: error.message });
  }
});

/**
 * PUT /api/cierre-caja/verificacion/tickets/confirmar-todos
 * Confirma todos los tickets pendientes del período.
 * Body: { usuarioId, usuarioNombre }
 */
router.put('/cierre-caja/verificacion/tickets/confirmar-todos', adminAuth, checkPermission('ver-cierre-caja'), async (req, res) => {
  try {
    const { usuarioId, usuarioNombre } = req.body;
    const uId = usuarioId || (req.admin && (req.admin.id || req.admin.usuarioId));
    const uNombre = usuarioNombre || (req.admin && (req.admin.nombre || req.admin.name)) || 'cajero';
    const resultado = await verificacionService.confirmarTodos(uId, uNombre);
    res.json({ success: true, ...resultado });
  } catch (error) {
    logger.error('Error al confirmar todos los tickets', { error: error.message });
    res.status(500).json({ success: false, error: 'Error al confirmar todos', message: error.message });
  }
});

// ========== FUNCIONES AUXILIARES ==========

function calcularResumenFinanciero(comandas, vendidas, periodoInicio, periodoFin) {
  const cfg = getConfigMonedaEstadisticas();
  const totalComandas = comandas.length;
  const comandasCompletadas = vendidas || comandas.filter(esComandaVendida);

  const montoTotalVendido = sumaMontosReporte(comandasCompletadas, cfg);
  const totalDescuentos = comandasCompletadas.reduce((sum, c) => sum + montoDescuentoComandaNum(c), 0);
  const ticketPromedio = comandasCompletadas.length > 0
    ? montoTotalVendido / comandasCompletadas.length
    : 0;
  
  const comandasPorEstado = {
    pendientes: comandas.filter(c => c.status === 'en_espera').length,
    enProceso: comandas.filter(c => c.status === 'recoger').length,
    completadas: comandas.filter(c => c.status === 'entregado').length,
    canceladas: comandas.filter(c => !c.IsActive || c.status === 'cancelada').length
  };
  
  // Ventas por día
  const ventasPorDiaMap = new Map();
  comandasCompletadas.forEach(c => {
    const fecha = moment(c.createdAt).format('YYYY-MM-DD');
    if (!ventasPorDiaMap.has(fecha)) {
      ventasPorDiaMap.set(fecha, { fecha: new Date(fecha), monto: 0, cantidadComandas: 0 });
    }
    const dia = ventasPorDiaMap.get(fecha);
    dia.monto += montoFilaReporte(c, cfg);
    dia.cantidadComandas += 1;
  });
  const ventasPorDia = Array.from(ventasPorDiaMap.values());
  
  // Ventas por hora
  const ventasPorHoraMap = new Map();
  comandasCompletadas.forEach(c => {
    const hora = moment(c.createdAt).hour();
    if (!ventasPorHoraMap.has(hora)) {
      ventasPorHoraMap.set(hora, { hora, monto: 0, cantidadComandas: 0 });
    }
    const horaData = ventasPorHoraMap.get(hora);
    horaData.monto += montoFilaReporte(c, cfg);
    horaData.cantidadComandas += 1;
  });
  const ventasPorHora = Array.from(ventasPorHoraMap.values()).sort((a, b) => a.hora - b.hora);
  
  // Pico de ventas
  let picoVentas = { hora: 0, dia: periodoInicio, monto: 0 };
  ventasPorHora.forEach(h => {
    if (h.monto > picoVentas.monto) {
      picoVentas = { hora: h.hora, dia: periodoInicio, monto: h.monto };
    }
  });
  ventasPorDia.forEach(d => {
    if (d.monto > picoVentas.monto) {
      picoVentas = { ...picoVentas, dia: d.fecha, monto: d.monto };
    }
  });
  
  return {
    totalComandas,
    montoTotalVendido,
    totalDescuentos,
    ticketPromedio,
    comandasPorEstado,
    ventasPorDia,
    ventasPorHora,
    picoVentas
  };
}

async function analizarProductos(comandas) {
  const productosMap = new Map();
  let totalProductosVendidos = 0;
  // NUEVO: Desglose por tipo de servicio (Mesa vs Para llevar)
  let servicioMesa = 0;
  let servicioParaLlevar = 0;
  let montoMesa = 0;
  let montoParaLlevar = 0;
  
  comandas.forEach(comanda => {
    if (!comanda.platos || !Array.isArray(comanda.platos)) return;
    
    comanda.platos.forEach((itemPlato, index) => {
      if (itemPlato.eliminado || itemPlato.anulado) return;
      
      const plato = itemPlato.plato;
      const cantidad = cantidadPlatoNum(itemPlato, index, comanda.cantidades);
      const precio = precioPlatoNum(itemPlato);
      const monto = cantidad * precio * factorNetoComanda(comanda);
      const key = (plato && plato._id)
        ? plato._id.toString()
        : (itemPlato.nombre || itemPlato.platoNombre || `plato-${index}`);
      
      totalProductosVendidos += cantidad;
      
      // NUEVO: Acumular por tipo de servicio (default 'mesa' para comandas antiguas)
      if (itemPlato.tipoServicio === 'para_llevar') {
        servicioParaLlevar += cantidad;
        montoParaLlevar += monto;
      } else {
        servicioMesa += cantidad;
        montoMesa += monto;
      }
      
      if (!productosMap.has(key)) {
        productosMap.set(key, {
          platoId: plato?._id || null,
          nombre: plato?.nombre || itemPlato.nombre || itemPlato.platoNombre || 'Sin nombre',
          cantidad: 0,
          monto: 0,
          categoria: plato?.categoria || itemPlato.plato?.categoria || 'Sin categoría'
        });
      }
      
      const producto = productosMap.get(key);
      producto.cantidad += cantidad;
      producto.monto += monto;
    });
  });
  
  const productosArray = Array.from(productosMap.values());
  const topProductos = productosArray
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 20);
  
  const productosMenosVendidos = productosArray
    .sort((a, b) => a.cantidad - b.cantidad)
    .slice(0, 10);
  
  // Productos por categoría
  const productosPorCategoria = {};
  productosArray.forEach(p => {
    const cat = p.categoria || 'Sin categoría';
    if (!productosPorCategoria[cat]) {
      productosPorCategoria[cat] = { cantidad: 0, monto: 0 };
    }
    productosPorCategoria[cat].cantidad += p.cantidad;
    productosPorCategoria[cat].monto += p.monto;
  });
  
  return {
    totalProductosVendidos,
    topProductos,
    productosPorCategoria,
    productosMenosVendidos,
    margenPorProducto: [], // Se puede calcular si hay costos
    // NUEVO: Desglose por tipo de servicio
    servicio: {
      mesa: servicioMesa,
      paraLlevar: servicioParaLlevar,
      montoMesa,
      montoParaLlevar
    }
  };
}

async function analizarMozos(comandas) {
  const mozosMap = new Map();
  
  comandas.forEach(comanda => {
    if (!comanda.mozos || !comanda.mozos._id) return;
    
    const mozoId = comanda.mozos._id.toString();
    const mozoNombre = comanda.mozos.name || 'Sin nombre';
    
    if (!mozosMap.has(mozoId)) {
      mozosMap.set(mozoId, {
        mozoId: comanda.mozos._id,
        nombre: mozoNombre,
        comandasAtendidas: 0,
        comandasCompletadas: 0, // Solo comandas pagadas/entregadas
        montoTotalVendido: 0,
        tiemposAtencion: []
      });
    }
    
    const mozo = mozosMap.get(mozoId);
    mozo.comandasAtendidas += 1;
    
    // Sumar monto para todas las comandas (no solo las completadas)
    // Esto es más preciso porque incluye comandas en proceso
    mozo.montoTotalVendido += montoFilaReporte(comanda);
    
    // Contar comandas completadas por separado
    if (esComandaVendida(comanda)) {
      mozo.comandasCompletadas += 1;
    }
    
    // Calcular tiempo de atención si hay timestamps
    if (comanda.tiempoEnEspera && comanda.tiempoPagado) {
      const tiempo = (comanda.tiempoPagado - comanda.tiempoEnEspera) / (1000 * 60); // minutos
      mozo.tiemposAtencion.push(tiempo);
    }
  });
  
  const desempeñoPorMozo = Array.from(mozosMap.values()).map(mozo => {
    // Calcular ticket promedio basado en comandas atendidas (no solo completadas)
    const ticketPromedio = mozo.comandasAtendidas > 0
      ? mozo.montoTotalVendido / mozo.comandasAtendidas
      : 0;
    
    const tiempoPromedioAtencion = mozo.tiemposAtencion.length > 0
      ? mozo.tiemposAtencion.reduce((a, b) => a + b, 0) / mozo.tiemposAtencion.length
      : 0;
    
    return {
      ...mozo,
      ticketPromedio,
      tiempoPromedioAtencion: Math.round(tiempoPromedioAtencion)
    };
  });
  
  // Crear ranking ordenado por monto total vendido
  const rankingMozos = desempeñoPorMozo
    .map((m, index) => ({
      ...m,
      posicion: index + 1,
      score: m.montoTotalVendido * 0.5 + m.comandasAtendidas * 10
    }))
    .sort((a, b) => b.montoTotalVendido - a.montoTotalVendido) // Ordenar por monto
    .map((m, index) => ({ ...m, posicion: index + 1 }));
  
  return {
    totalMozos: desempeñoPorMozo.length,
    desempeñoPorMozo,
    rankingMozos
  };
}

async function analizarMesas(comandas) {
  const mesasMap = new Map();
  const areasMap = new Map();
  const horasPicoMap = new Map();
  
  comandas.forEach(comanda => {
    if (!comanda.mesas || !comanda.mesas._id) return;
    
    const mesaId = comanda.mesas._id.toString();
    const numMesa = comanda.mesas.nummesa || 0;
    const area = comanda.mesas.area?.nombre || 'Sin área';
    
    if (!mesasMap.has(mesaId)) {
      mesasMap.set(mesaId, {
        mesaId: comanda.mesas._id,
        numMesa,
        area,
        usos: 0,
        ventas: 0,
        tiempos: []
      });
    }
    const mesa = mesasMap.get(mesaId);
    mesa.usos += 1;
    mesa.ventas += montoFilaReporte(comanda);
    if (comanda.tiempoEnEspera && comanda.tiempoPagado) {
      const t = (new Date(comanda.tiempoPagado) - new Date(comanda.tiempoEnEspera)) / 60000;
      if (Number.isFinite(t) && t >= 0) mesa.tiempos.push(t);
    }
    
    if (!areasMap.has(area)) {
      areasMap.set(area, 0);
    }
    areasMap.set(area, areasMap.get(area) + 1);
    
    const hora = moment(comanda.createdAt).hour();
    if (!horasPicoMap.has(hora)) {
      horasPicoMap.set(hora, new Set());
    }
    horasPicoMap.get(hora).add(mesaId);
  });
  
  const todosTiempos = [];
  const mesasUsadas = Array.from(mesasMap.values()).map((mesa) => {
    const tiempoPromedio = mesa.tiempos.length
      ? mesa.tiempos.reduce((a, b) => a + b, 0) / mesa.tiempos.length
      : 0;
    todosTiempos.push(...mesa.tiempos);
    return {
      mesaId: mesa.mesaId,
      numMesa: mesa.numMesa,
      area: mesa.area,
      comandas: mesa.usos,
      ventas: Number(mesa.ventas.toFixed(2)),
      ticketPromedio: mesa.usos > 0 ? Number((mesa.ventas / mesa.usos).toFixed(2)) : 0,
      tiempoPromedio: Number(tiempoPromedio.toFixed(1))
    };
  });
  const rotacionPorMesa = {};
  mesasMap.forEach((mesa, id) => {
    rotacionPorMesa[id] = mesa.usos;
  });
  
  const ocupacionPorArea = {};
  areasMap.forEach((cantidad, area) => {
    ocupacionPorArea[area] = cantidad;
  });
  
  const horasPicoOcupacion = Array.from(horasPicoMap.entries()).map(([hora, mesas]) => ({
    hora: parseInt(hora),
    cantidadMesas: mesas.size
  })).sort((a, b) => a.hora - b.hora);

  const tiempoPromedioOcupacion = todosTiempos.length
    ? Number((todosTiempos.reduce((a, b) => a + b, 0) / todosTiempos.length).toFixed(1))
    : 0;
  
  return {
    mesasUsadas,
    rotacionPorMesa,
    ocupacionPorArea,
    tiempoPromedioOcupacion,
    horasPicoOcupacion
  };
}

async function analizarCocineros(comandas, periodoInicio, periodoFin) {
  try {
    // Usar el repositorio de reportes que tiene la lógica correcta
    // basada en platos.tiempos y platos.procesadoPor de las comandas
    const fechaInicioStr = moment(periodoInicio).tz('America/Lima').format('YYYY-MM-DD');
    const fechaFinStr = moment(periodoFin).tz('America/Lima').format('YYYY-MM-DD');
    
    logger.info('[CierreCaja] Obteniendo métricas de cocineros desde reportes', {
      fechaInicio: fechaInicioStr,
      fechaFin: fechaFinStr
    });
    
    // Obtener métricas usando el repositorio de reportes (usa aggregation de Comanda)
    const metricas = await reportesRepository.getMetricasCocineros(fechaInicioStr, fechaFinStr);
    
    const cocinerosData = metricas.cocineros || [];
    const resumen = metricas.resumen || {};
    
    // Calcular horas pico de cocina
    const horasPicoCocina = await calcularHorasPicoCocina(periodoInicio, periodoFin);
    
    // Formatear desempeñoPorCocinero con la estructura esperada por el modelo
    const desempeñoPorCocinero = cocinerosData.map(coc => ({
      cocineroId: coc._id,
      nombre: coc.nombre || 'Sin nombre',
      alias: coc.alias || coc.nombre || 'Cocinero',
      totalPlatos: coc.totalPlatos || 0,
      totalTickets: coc.totalTickets || 0,
      tiempoPromedioPlato: coc.tiempoPromedioPlato || 0,
      platosHora: coc.platosHora || 0,
      porcentajeSLA: coc.porcentajeSLA || 0,
      participacion: coc.participacion || 0,
      score: coc.score || 0,
      sinActividad: coc.sinActividad || false
    }));
    
    // Crear ranking
    const rankingCocineros = desempeñoPorCocinero
      .filter(c => c.totalPlatos > 0)
      .sort((a, b) => b.totalPlatos - a.totalPlatos)
      .map((c, index) => ({
        cocineroId: c.cocineroId,
        nombre: c.nombre,
        alias: c.alias,
        posicion: index + 1,
        score: c.score
      }));
    
    // Obtener distribución por categoría
    const distribucion = await reportesRepository.getDistribucionCategorias(fechaInicioStr, fechaFinStr);
    const platosPorCategoria = (distribucion.general || []).map(d => ({
      categoria: d.categoria || d._id || 'Sin categoría',
      cantidadPreparada: d.cantidad || 0,
      tiempoPromedio: d.tiempoPromedio || 0
    }));
    
    return {
      totalCocineros: cocinerosData.length,
      cocinerosActivos: resumen.cocinerosActivos || cocinerosData.filter(c => c.totalPlatos > 0).length,
      totalPlatosPreparados: resumen.totalPlatos || 0,
      tiempoPromedioPreparacion: resumen.tiempoPromedioGeneral || 0,
      porcentajeDentroSLA: resumen.porcentajeDentroSLA || 0,
      desempeñoPorCocinero,
      rankingCocineros,
      platosPorCategoria,
      horasPicoCocina
    };
    
  } catch (error) {
    logger.error('[CierreCaja] Error en analizarCocineros', { 
      error: error.message, 
      stack: error.stack 
    });
    
    // Retornar estructura vacía en caso de error
    return {
      totalCocineros: 0,
      cocinerosActivos: 0,
      totalPlatosPreparados: 0,
      tiempoPromedioPreparacion: 0,
      porcentajeDentroSLA: 0,
      desempeñoPorCocinero: [],
      rankingCocineros: [],
      platosPorCategoria: [],
      horasPicoCocina: []
    };
  }
}

/**
 * Calcula las horas pico de cocina basándose en los tiempos de finalización de platos
 */
async function calcularHorasPicoCocina(periodoInicio, periodoFin) {
  try {
    const pipeline = [
      {
        $match: matchComandaVigente({
          createdAt: { $gte: periodoInicio, $lte: periodoFin }
        })
      },
      { $unwind: '$platos' },
      {
        $match: {
          'platos.eliminado': { $ne: true },
          'platos.anulado': { $ne: true },
          'platos.tiempos.recoger': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: { $hour: '$platos.tiempos.recoger' },
          cantidadPlatos: { $sum: 1 }
        }
      },
      {
        $project: {
          hora: '$_id',
          cantidadPlatos: 1,
          _id: 0
        }
      },
      { $sort: { hora: 1 } }
    ];
    
    const resultados = await Comanda.aggregate(pipeline);
    return resultados;
    
  } catch (error) {
    logger.error('[CierreCaja] Error en calcularHorasPicoCocina', { error: error.message });
    return [];
  }
}

function analizarClientes(comandas) {
  const clientesSet = new Set();
  const clientesMap = new Map();
  let montoTotalClientes = 0;
  
  comandas.forEach(comanda => {
    if (comanda.cliente && comanda.cliente._id) {
      const clienteId = comanda.cliente._id.toString();
      clientesSet.add(clienteId);
      
      if (!clientesMap.has(clienteId)) {
        clientesMap.set(clienteId, {
          clienteId: comanda.cliente._id,
          nombre: comanda.cliente.nombre || 'Sin nombre',
          montoTotal: 0,
          cantidadVisitas: 0
        });
      }
      
      const cliente = clientesMap.get(clienteId);
      cliente.cantidadVisitas += 1;
      cliente.montoTotal += montoFilaReporte(comanda);
      montoTotalClientes += montoFilaReporte(comanda);
    }
  });
  
  const totalClientes = clientesSet.size;
  const ticketPromedioPorCliente = totalClientes > 0
    ? montoTotalClientes / totalClientes
    : 0;
  
  const topClientes = Array.from(clientesMap.values())
    .sort((a, b) => b.montoTotal - a.montoTotal)
    .slice(0, 10);
  
  // Nota: Para determinar clientes nuevos vs recurrentes necesitaríamos
  // consultar comandas anteriores, lo cual es costoso. Por ahora asumimos todos como nuevos.
  
  return {
    totalClientes,
    clientesNuevos: totalClientes, // Simplificado
    clientesRecurrentes: 0, // Se puede calcular consultando períodos anteriores
    ticketPromedioPorCliente,
    topClientes
  };
}

async function recopilarAuditoria(periodoInicio, periodoFin, comandas = []) {
  const ACCIONES_ELIMINACION_COMANDA = new Set([
    'ELIMINAR_COMANDA_INDIVIDUAL',
    'ELIMINAR_ULTIMA_COMANDA',
    'ELIMINAR_TODAS_COMANDAS',
    'comanda_eliminada',
    'COMANDA_ANULADA_COCINA'
  ]);
  const ACCIONES_MODIFICACION = new Set([
    'comanda_editada',
    'comanda_status_cambiado',
    'plato_agregado',
    'plato_modificado',
    'plato_eliminado',
    'ELIMINAR_PLATO_COMANDA',
    'ELIMINAR_PLATO_RECOGER',
    'reversion_comanda',
    'reversion_plato',
    'PLATO_ANULADO_COCINA'
  ]);

  const nombreActor = (a) =>
    (a.usuario && typeof a.usuario === 'object' && a.usuario.name)
    || a.usuarioNombre
    || a.metadata?.usuarioNombre
    || 'Desconocido';

  const numeroComanda = (a) =>
    a.metadata?.comandaNumber
    || a.datosAntes?.comandaNumber
    || a.datosDespues?.comandaNumber
    || null;

  const accionesAuditoria = await AuditoriaAcciones.find({
    timestamp: { $gte: periodoInicio, $lte: periodoFin }
  })
    .populate('usuario', 'name')
    .sort({ timestamp: -1 })
    .limit(500)
    .lean();

  const comandasEliminadasDocs = await Comanda.find({
    eliminada: true,
    $or: [
      { fechaEliminacion: { $gte: periodoInicio, $lte: periodoFin } },
      {
        fechaEliminacion: { $exists: false },
        updatedAt: { $gte: periodoInicio, $lte: periodoFin }
      }
    ]
  })
    .populate('mozos', 'name')
    .select('comandaNumber fechaEliminacion motivoEliminacion mozos totalCalculado precioTotal montoDescuento totalSinDescuento platos cantidades status')
    .lean();

  const porComanda = new Map();
  for (const a of accionesAuditoria) {
    if (!ACCIONES_ELIMINACION_COMANDA.has(a.accion)) continue;
    const comandaId = a.entidadId ? String(a.entidadId) : `aud-${a._id}`;
    porComanda.set(comandaId, {
      comandaId: a.entidadId || null,
      comandaNumber: numeroComanda(a),
      fecha: a.timestamp,
      mozo: nombreActor(a),
      monto: Number(a.metadata?.totalEliminado) || 0,
      motivo: a.motivo || a.metadata?.motivo || a.accion
    });
  }
  for (const c of comandasEliminadasDocs) {
    const key = String(c._id);
    const existente = porComanda.get(key);
    const motivoDoc = c.motivoEliminacion || 'Sin motivo registrado';
    if (!existente) {
      porComanda.set(key, {
        comandaId: c._id,
        comandaNumber: c.comandaNumber,
        fecha: c.fechaEliminacion || c.updatedAt || c.createdAt,
        mozo: c.mozos?.name || 'Desconocido',
        monto: montoFilaReporte(c),
        motivo: motivoDoc
      });
    } else {
      if (!existente.comandaNumber) existente.comandaNumber = c.comandaNumber;
      if (!existente.motivo || existente.motivo === existente.mozo) existente.motivo = motivoDoc;
      if (!existente.monto) existente.monto = montoFilaReporte(c);
    }
  }
  for (const c of comandas) {
    if (c.IsActive && !c.motivoEliminacion) continue;
    const key = String(c._id);
    if (porComanda.has(key)) continue;
    porComanda.set(key, {
      comandaId: c._id,
      comandaNumber: c.comandaNumber,
      fecha: c.fechaEliminacion || c.createdAt,
      mozo: c.mozos?.name || 'Desconocido',
      monto: montoFilaReporte(c),
      motivo: c.motivoEliminacion || 'Sin motivo registrado'
    });
  }
  const comandasCanceladas = [...porComanda.values()]
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const modificaciones = accionesAuditoria
    .filter((a) => ACCIONES_MODIFICACION.has(a.accion))
    .map((a) => ({
      tipo: a.accion,
      comandaId: a.entidadId || null,
      comandaNumber: numeroComanda(a),
      fecha: a.timestamp,
      usuario: nombreActor(a),
      descripcion: a.motivo || a.metadata?.motivo || a.accion
    }));

  const descuentosAplicados = comandas
    .filter((c) => Number(c.descuento) > 0 || Number(c.montoDescuento) > 0)
    .map((c) => ({
      comandaId: c._id,
      comandaNumber: c.comandaNumber,
      montoDescuento: montoDescuentoComandaNum(c),
      porcentaje: Number(c.descuento) || 0,
      fecha: c.descuentoAplicadoAt || c.updatedAt || c.createdAt,
      motivo: c.motivoDescuento || 'Sin motivo registrado'
    }));

  const operacionesEspeciales = accionesAuditoria
    .filter((a) => a.entidadTipo === 'mesa' || String(a.accion || '').toLowerCase().includes('mesa'))
    .map((a) => ({
      tipo: a.accion,
      fecha: a.timestamp,
      descripcion: a.motivo || a.usuarioNombre || a.accion
    }));

  return {
    comandasCanceladas,
    modificaciones,
    descuentosAplicados,
    operacionesEspeciales
  };
}

function mergeAuditoriaCierre(snap = {}, live = {}) {
  const keyCanc = (x) => String(x.comandaId || '') + ':' + String(x.comandaNumber || '') + ':' + String(x.fecha || '');
  const seen = new Set();
  const comandasCanceladas = [];
  for (const x of [...(live.comandasCanceladas || []), ...(snap.comandasCanceladas || [])]) {
    const k = keyCanc(x);
    if (seen.has(k)) continue;
    seen.add(k);
    comandasCanceladas.push(x);
  }
  return {
    comandasCanceladas,
    modificaciones: (live.modificaciones && live.modificaciones.length)
      ? live.modificaciones
      : (snap.modificaciones || []),
    descuentosAplicados: (snap.descuentosAplicados && snap.descuentosAplicados.length)
      ? snap.descuentosAplicados
      : (live.descuentosAplicados || []),
    operacionesEspeciales: (live.operacionesEspeciales && live.operacionesEspeciales.length)
      ? live.operacionesEspeciales
      : (snap.operacionesEspeciales || [])
  };
}

function generarDatosGraficos(resumenFinanciero, productos, mozos, mesas, cocineros) {
  return {
    ventasPorDia: resumenFinanciero.ventasPorDia.map(d => ({
      fecha: moment(d.fecha).format('YYYY-MM-DD'),
      monto: d.monto
    })),
    ventasPorHora: resumenFinanciero.ventasPorHora.map(h => ({
      hora: h.hora,
      monto: h.monto
    })),
    productosTop: productos.topProductos.slice(0, 10).map(p => ({
      nombre: p.nombre,
      cantidad: p.cantidad,
      monto: p.monto
    })),
    mozosRanking: mozos.desempeñoPorMozo
      .sort((a, b) => b.montoTotalVendido - a.montoTotalVendido)
      .slice(0, 10)
      .map(m => ({
        nombre: m.nombre,
        monto: m.montoTotalVendido,
        comandas: m.comandasAtendidas
      })),
    ocupacionAreas: Object.entries(mesas.ocupacionPorArea).map(([area, cantidad]) => ({
      area,
      cantidad
    })),
    cocinerosRanking: (cocineros?.desempeñoPorCocinero || [])
      .slice(0, 10)
      .map(c => ({
        nombre: c.nombre,
        alias: c.alias,
        totalPlatos: c.totalPlatos,
        tiempoPromedio: c.tiempoPromedioPlato,
        porcentajeSLA: c.porcentajeSLA,
        score: c.score
      })),
    platosPorCocinero: (cocineros?.desempeñoPorCocinero || [])
      .slice(0, 8)
      .map(c => ({
        nombre: c.alias || c.nombre,
        cantidad: c.totalPlatos
      })),
    cumplimientoSLA: {
      dentroSLA: cocineros?.totalPlatosPreparados 
        ? Math.round(cocineros.totalPlatosPreparados * (cocineros.porcentajeDentroSLA / 100)) 
        : 0,
      fueraSLA: cocineros?.totalPlatosPreparados 
        ? Math.round(cocineros.totalPlatosPreparados * (1 - cocineros.porcentajeDentroSLA / 100)) 
        : 0,
      porcentajeGeneral: cocineros?.porcentajeDentroSLA || 0
    }
  };
}

const SELECT_COMANDA_TICKET_CIERRE = 'comandaNumber totalCalculado totalSinDescuento montoDescuento descuento precioTotal precioTotalOriginal platos cantidades status mesas mozos createdAt';

function numMesaComanda(c) {
  const m = c?.mesas;
  if (!m) return '';
  if (Array.isArray(m)) return m[0]?.nummesa ?? '';
  return m.nummesa ?? '';
}

async function cargarComandasParaTicketCierre(cierre) {
  const run = (filter) => Comanda.find(filter)
    .select(SELECT_COMANDA_TICKET_CIERRE)
    .populate('mesas', 'nummesa')
    .populate('mozos', 'name')
    .populate('platos.plato', 'nombre precio categoria')
    .sort({ comandaNumber: 1 })
    .lean();

  const ids = Array.isArray(cierre.comandasIds) ? cierre.comandasIds.filter(Boolean) : [];
  if (ids.length) {
    const byIds = await run(matchComandaVigente({ _id: { $in: ids } }));
    if (byIds.length) return byIds;
  }

  const byFlag = await run(matchComandaVigente(matchIncluidoEnEsteCierre(cierre._id)));
  if (byFlag.length) return byFlag;

  if (cierre.periodoInicio && cierre.periodoFin) {
    return run(matchComandasPeriodoDeCierre(cierre.periodoInicio, cierre.periodoFin, cierre._id));
  }
  return [];
}

/**
 * GET /api/cierre-caja/:id/ticket-imprimible
 * Datos para ticket térmico 80mm: cada comanda con bruto, descuento y total; pie = suma de totales.
 */
router.get('/cierre-caja/:id/ticket-imprimible', adminAuth, checkPermission('ver-cierre-caja'), async (req, res) => {
  try {
    const { id } = req.params;
    const cierre = await CierreCajaRestaurante.findById(id).lean();
    if (!cierre) {
      return res.status(404).json({ error: 'Cierre de caja no encontrado' });
    }

    await cargarConfigMonedaEstadisticas();
    const encontradas = await cargarComandasParaTicketCierre(cierre);
    const vendidas = encontradas.filter(esComandaVendida);
    const comandas = vendidas.length ? vendidas : encontradas;

    if ((!cierre.comandasIds || !cierre.comandasIds.length) && encontradas.length) {
      CierreCajaRestaurante.updateOne(
        { _id: cierre._id },
        { $set: { comandasIds: encontradas.map((c) => c._id) } }
      ).catch((err) => logger.warn('No se pudieron guardar comandasIds del ticket de cierre', { error: err.message }));
    }

    const lineas = comandas.map((c) => {
      const total = montoFilaReporte(c);
      const desc = montoDescuentoComandaNum(c);
      const brutoRaw = Number(c.totalSinDescuento);
      const bruto = Number.isFinite(brutoRaw) && brutoRaw > 0 ? brutoRaw : total + desc;
      return {
        comandaNumber: c.comandaNumber,
        mesa: numMesaComanda(c),
        mozo: c.mozos?.name || '',
        bruto: Number(bruto.toFixed(2)),
        subtotal: Number(bruto.toFixed(2)),
        descuento: Number(desc.toFixed(2)),
        total: Number(total.toFixed(2))
      };
    });

    const subtotal = Number(lineas.reduce((s, l) => s + l.bruto, 0).toFixed(2));
    const descuento = Number(lineas.reduce((s, l) => s + l.descuento, 0).toFixed(2));
    const total = Number(lineas.reduce((s, l) => s + l.total, 0).toFixed(2));

    res.json({
      success: true,
      datos: {
        cierreId: cierre._id,
        fechaCierre: cierre.fechaCierre,
        periodoInicio: cierre.periodoInicio,
        periodoFin: cierre.periodoFin,
        usuarioAdmin: cierre.usuarioAdmin,
        comandas: lineas,
        subtotal,
        descuento,
        total
      }
    });
  } catch (error) {
    logger.error('Error al armar ticket de cierre', { error: error.message });
    res.status(500).json({
      error: 'Error al generar ticket de cierre',
      message: error.message
    });
  }
});

/**
 * GET /api/cierre-caja/:id/exportar-pdf
 * Exportar cierre de caja a PDF
 */
router.get('/cierre-caja/:id/exportar-pdf', adminAuth, checkPermission('ver-cierre-caja'), async (req, res) => {
  try {
    const { id } = req.params;
    const cierre = await CierreCajaRestaurante.findById(id).lean();
    
    if (!cierre) {
      return res.status(404).json({ error: 'Cierre de caja no encontrado' });
    }
    
    // Generar PDF usando pdfkit
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });
    
    // Configurar headers para descarga
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cierre_caja_${id}_${moment(cierre.fechaCierre).format('YYYY-MM-DD')}.pdf`);
    
    // Pipe del documento a la respuesta
    doc.pipe(res);
    
    // Título
    doc.fontSize(20).text('REPORTE DE CIERRE DE CAJA', { align: 'center' });
    doc.moveDown();
    
    // Información del período
    doc.fontSize(12);
    doc.text(`Fecha de Cierre: ${moment(cierre.fechaCierre).format('DD/MM/YYYY HH:mm')}`, { align: 'left' });
    doc.text(`Período: ${moment(cierre.periodoInicio).format('DD/MM/YYYY')} - ${moment(cierre.periodoFin).format('DD/MM/YYYY')}`, { align: 'left' });
    doc.text(`Usuario: ${cierre.usuarioAdmin}`, { align: 'left' });
    doc.moveDown();
    
    // Resumen Financiero
    const resumen = cierre.resumenFinanciero || {};
    doc.fontSize(16).text('RESUMEN FINANCIERO', { underline: true });
    doc.fontSize(12);
    doc.text(`Total Comandas: ${resumen.totalComandas || 0}`);
    doc.text(`Monto Total Vendido: S/. ${(resumen.montoTotalVendido || 0).toFixed(2)}`);
    if ((resumen.totalDescuentos || 0) > 0) {
      doc.text(`Descuentos aplicados: -S/. ${Number(resumen.totalDescuentos).toFixed(2)}`);
    }
    doc.text(`Ticket Promedio: S/. ${(resumen.ticketPromedio || 0).toFixed(2)}`);
    doc.moveDown();
    
    // Comandas por Estado
    if (resumen.comandasPorEstado) {
      doc.fontSize(14).text('Comandas por Estado:', { underline: true });
      doc.fontSize(12);
      doc.text(`  Pendientes: ${resumen.comandasPorEstado.pendientes || 0}`);
      doc.text(`  En Proceso: ${resumen.comandasPorEstado.enProceso || 0}`);
      doc.text(`  Completadas: ${resumen.comandasPorEstado.completadas || 0}`);
      doc.text(`  Canceladas: ${resumen.comandasPorEstado.canceladas || 0}`);
      doc.moveDown();
    }
    
    // Top Productos
    const productos = cierre.productos || {};
    if (productos.topProductos && productos.topProductos.length > 0) {
      doc.fontSize(16).text('TOP PRODUCTOS', { underline: true });
      doc.moveDown(0.5);
      productos.topProductos.slice(0, 10).forEach((p, index) => {
        doc.fontSize(11);
        doc.text(`${index + 1}. ${p.nombre} - Cantidad: ${p.cantidad} - Monto: S/. ${p.monto.toFixed(2)}`);
      });
      doc.moveDown();
    }
    
    // Desempeño de Mozos
    const mozos = cierre.mozos || {};
    if (mozos.desempeñoPorMozo && mozos.desempeñoPorMozo.length > 0) {
      doc.fontSize(16).text('DESEMPEÑO DE MOZOS', { underline: true });
      doc.moveDown(0.5);
      mozos.desempeñoPorMozo.forEach((m, index) => {
        doc.fontSize(11);
        doc.text(`${m.nombre}: ${m.comandasAtendidas} comandas - S/. ${m.montoTotalVendido.toFixed(2)}`);
      });
      doc.moveDown();
    }
    
    // Rendimiento de Cocineros
    const cocineros = cierre.cocineros || {};
    if (cocineros.desempeñoPorCocinero && cocineros.desempeñoPorCocinero.length > 0) {
      doc.fontSize(16).text('RENDIMIENTO DE COCINEROS', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12);
      doc.text(`Total Platos: ${cocineros.totalPlatosPreparados || 0}`);
      doc.text(`Tiempo Promedio: ${cocineros.tiempoPromedioPreparacion || 0} min`);
      doc.text(`% Dentro SLA: ${cocineros.porcentajeDentroSLA || 0}%`);
      doc.moveDown(0.5);
      doc.fontSize(11);
      cocineros.desempeñoPorCocinero.slice(0, 10).forEach((c, index) => {
        doc.text(`${index + 1}. ${c.alias || c.nombre}: ${c.totalPlatos} platos - ${c.tiempoPromedioPlato}min prom - SLA ${c.porcentajeSLA}%`);
      });
      doc.moveDown();
    }
    
    // Ocupación por Área
    const mesas = cierre.mesas || {};
    if (mesas.ocupacionPorArea) {
      doc.fontSize(16).text('OCUPACIÓN POR ÁREA', { underline: true });
      doc.moveDown(0.5);
      Object.entries(mesas.ocupacionPorArea).forEach(([area, cantidad]) => {
        doc.fontSize(11);
        doc.text(`${area}: ${cantidad} usos`);
      });
      doc.moveDown();
    }
    
    // Auditoría
    const auditoria = cierre.auditoria || {};
    if (auditoria.comandasCanceladas && auditoria.comandasCanceladas.length > 0) {
      doc.fontSize(16).text('COMANDAS CANCELADAS', { underline: true });
      doc.moveDown(0.5);
      auditoria.comandasCanceladas.forEach((c, index) => {
        doc.fontSize(10);
        doc.text(`Comanda #${c.comandaNumber}: ${c.motivo} - S/. ${c.monto.toFixed(2)}`);
      });
      doc.moveDown();
    }
    
    // Notas
    if (cierre.informacionOperativa?.notasAdmin) {
      doc.fontSize(14).text('NOTAS DEL ADMINISTRADOR', { underline: true });
      doc.fontSize(11);
      doc.text(cierre.informacionOperativa.notasAdmin);
    }
    
    // Finalizar documento
    doc.end();
    
  } catch (error) {
    logger.error('Error al exportar PDF', { error: error.message });
    res.status(500).json({
      error: 'Error al exportar PDF',
      message: error.message
    });
  }
});

/**
 * GET /api/cierre-caja/:id/exportar-excel
 * Exportar cierre de caja a Excel
 */
router.get('/cierre-caja/:id/exportar-excel', adminAuth, checkPermission('ver-cierre-caja'), async (req, res) => {
  try {
    const { id } = req.params;
    const cierre = await CierreCajaRestaurante.findById(id).lean();
    
    if (!cierre) {
      return res.status(404).json({ error: 'Cierre de caja no encontrado' });
    }
    
    // Intentar usar xlsx, si no está disponible, retornar error
    let XLSX;
    try {
      XLSX = require('xlsx');
    } catch (e) {
      return res.status(500).json({
        error: 'Librería xlsx no instalada',
        message: 'Instale xlsx con: npm install xlsx'
      });
    }
    
    const workbook = XLSX.utils.book_new();
    
    // Hoja 1: Resumen Financiero
    const resumen = cierre.resumenFinanciero || {};
    const resumenData = [
      ['REPORTE DE CIERRE DE CAJA'],
      ['Fecha de Cierre', moment(cierre.fechaCierre).format('DD/MM/YYYY HH:mm')],
      ['Período', `${moment(cierre.periodoInicio).format('DD/MM/YYYY')} - ${moment(cierre.periodoFin).format('DD/MM/YYYY')}`],
      ['Usuario', cierre.usuarioAdmin],
      [],
      ['RESUMEN FINANCIERO'],
      ['Total Comandas', resumen.totalComandas || 0],
      ['Monto Total Vendido', `S/. ${(resumen.montoTotalVendido || 0).toFixed(2)}`],
      ['Descuentos aplicados', `S/. ${(resumen.totalDescuentos || 0).toFixed(2)}`],
      ['Ticket Promedio', `S/. ${(resumen.ticketPromedio || 0).toFixed(2)}`],
      [],
      ['Comandas por Estado'],
      ['Pendientes', resumen.comandasPorEstado?.pendientes || 0],
      ['En Proceso', resumen.comandasPorEstado?.enProceso || 0],
      ['Completadas', resumen.comandasPorEstado?.completadas || 0],
      ['Canceladas', resumen.comandasPorEstado?.canceladas || 0]
    ];
    const resumenSheet = XLSX.utils.aoa_to_sheet(resumenData);
    XLSX.utils.book_append_sheet(workbook, resumenSheet, 'Resumen');
    
    // Hoja 2: Productos
    const productos = cierre.productos || {};
    if (productos.topProductos && productos.topProductos.length > 0) {
      const productosData = [
        ['Producto', 'Cantidad', 'Monto (S/.)', 'Categoría']
      ];
      productos.topProductos.forEach(p => {
        productosData.push([p.nombre, p.cantidad, p.monto.toFixed(2), p.categoria || '']);
      });
      const productosSheet = XLSX.utils.aoa_to_sheet(productosData);
      XLSX.utils.book_append_sheet(workbook, productosSheet, 'Productos');
    }
    
    // Hoja 3: Mozos
    const mozos = cierre.mozos || {};
    if (mozos.desempeñoPorMozo && mozos.desempeñoPorMozo.length > 0) {
      const mozosData = [
        ['Mozo', 'Comandas Atendidas', 'Monto Total (S/.)', 'Ticket Promedio (S/.)', 'Tiempo Promedio (min)']
      ];
      mozos.desempeñoPorMozo.forEach(m => {
        mozosData.push([
          m.nombre,
          m.comandasAtendidas,
          m.montoTotalVendido.toFixed(2),
          m.ticketPromedio.toFixed(2),
          m.tiempoPromedioAtencion || 0
        ]);
      });
      const mozosSheet = XLSX.utils.aoa_to_sheet(mozosData);
      XLSX.utils.book_append_sheet(workbook, mozosSheet, 'Mozos');
    }
    
    // Hoja 3.5: Cocineros
    const cocineros = cierre.cocineros || {};
    if (cocineros.desempeñoPorCocinero && cocineros.desempeñoPorCocinero.length > 0) {
      const cocinerosData = [
        ['RENDIMIENTO DE COCINEROS'],
        ['Total Platos Preparados', cocineros.totalPlatosPreparados || 0],
        ['Tiempo Promedio (min)', cocineros.tiempoPromedioPreparacion || 0],
        ['% Dentro SLA', (cocineros.porcentajeDentroSLA || 0) + '%'],
        ['Cocineros Activos', cocineros.cocinerosActivos || 0],
        [],
        ['Cocinero', 'Alias', 'Total Platos', 'Tickets', 'T. Promedio (min)', 'P/Hora', '% SLA', 'Participación %', 'Score']
      ];
      cocineros.desempeñoPorCocinero.forEach(c => {
        cocinerosData.push([
          c.nombre,
          c.alias || c.nombre,
          c.totalPlatos,
          c.totalTickets,
          c.tiempoPromedioPlato,
          c.platosHora,
          c.porcentajeSLA + '%',
          c.participacion + '%',
          c.score
        ]);
      });
      const cocinerosSheet = XLSX.utils.aoa_to_sheet(cocinerosData);
      XLSX.utils.book_append_sheet(workbook, cocinerosSheet, 'Cocineros');
    }
    
    // Hoja 4: Ventas por Día
    if (resumen.ventasPorDia && resumen.ventasPorDia.length > 0) {
      const ventasDiaData = [
        ['Fecha', 'Monto (S/.)', 'Cantidad Comandas']
      ];
      resumen.ventasPorDia.forEach(v => {
        ventasDiaData.push([
          moment(v.fecha).format('DD/MM/YYYY'),
          v.monto.toFixed(2),
          v.cantidadComandas || 0
        ]);
      });
      const ventasDiaSheet = XLSX.utils.aoa_to_sheet(ventasDiaData);
      XLSX.utils.book_append_sheet(workbook, ventasDiaSheet, 'Ventas por Día');
    }
    
    // Hoja 5: Auditoría
    const auditoria = cierre.auditoria || {};
    if (auditoria.comandasCanceladas && auditoria.comandasCanceladas.length > 0) {
      const auditoriaData = [
        ['Comanda #', 'Fecha', 'Mozo', 'Monto (S/.)', 'Motivo']
      ];
      auditoria.comandasCanceladas.forEach(c => {
        auditoriaData.push([
          c.comandaNumber,
          moment(c.fecha).format('DD/MM/YYYY HH:mm'),
          c.mozo,
          c.monto.toFixed(2),
          c.motivo
        ]);
      });
      const auditoriaSheet = XLSX.utils.aoa_to_sheet(auditoriaData);
      XLSX.utils.book_append_sheet(workbook, auditoriaSheet, 'Auditoría');
    }
    
    // Generar buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Enviar respuesta
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=cierre_caja_${id}_${moment(cierre.fechaCierre).format('YYYY-MM-DD')}.xlsx`);
    res.send(excelBuffer);
    
  } catch (error) {
    logger.error('Error al exportar Excel', { error: error.message });
    res.status(500).json({
      error: 'Error al exportar Excel',
      message: error.message
    });
  }
});

module.exports = router;

