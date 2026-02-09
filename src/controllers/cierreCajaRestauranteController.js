const express = require('express');
const router = express.Router();
const CierreCajaRestaurante = require('../database/models/cierreCajaRestaurante.model');
const Comanda = require('../database/models/comanda.model');
const Plato = require('../database/models/plato.model');
const Mozo = require('../database/models/mozos.model');
const Mesa = require('../database/models/mesas.model');
const Cliente = require('../database/models/cliente.model');
const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
const moment = require('moment-timezone');
const logger = require('../utils/logger');

/**
 * POST /api/cierre-caja
 * Generar cierre de caja completo del restaurante
 */
router.post('/cierre-caja', async (req, res) => {
  try {
    // Paso 1: Verificar autenticación y permisos
    const usuarioAdmin = req.body.usuarioAdmin || req.headers['x-user-id'] || 'admin';
    
    // Paso 2: Obtener fecha del último cierre
    const ultimoCierre = await CierreCajaRestaurante.findOne()
      .sort({ fechaCierre: -1 })
      .select('fechaCierre periodoFin')
      .lean();
    
    const fechaUltimoCierre = ultimoCierre?.fechaCierre || null;
    const periodoInicio = ultimoCierre?.periodoFin || new Date('2024-01-01'); // Fecha base si es primer cierre
    const periodoFin = moment.tz("America/Lima").toDate();
    
    logger.info('Iniciando cierre de caja', {
      usuarioAdmin,
      periodoInicio,
      periodoFin,
      fechaUltimoCierre
    });
    
    // Paso 3 y 4: Consultar comandas del período (solo las no incluidas en cierres anteriores)
    const comandas = await Comanda.find({
      createdAt: { $gte: periodoInicio, $lte: periodoFin },
      $or: [
        { incluidoEnCierre: null },
        { incluidoEnCierre: { $exists: false } }
      ]
    })
    .populate('mozos', 'name mozoId')
    .populate({
      path: 'mesas',
      select: 'nummesa area',
      populate: {
        path: 'area',
        select: 'nombre'
      }
    })
    .populate('cliente', 'nombre DNI')
    .populate('platos.plato', 'nombre precio categoria')
    .lean();
    
    if (comandas.length === 0) {
      return res.status(400).json({
        error: 'No hay comandas pendientes de cerrar en el período especificado'
      });
    }
    
    // Paso 5: Calcular métricas financieras
    const resumenFinanciero = calcularResumenFinanciero(comandas, periodoInicio, periodoFin);
    
    // Paso 6: Analizar productos vendidos
    const productos = await analizarProductos(comandas);
    
    // Paso 7: Evaluar desempeño de mozos
    const mozos = await analizarMozos(comandas);
    
    // Paso 8: Analizar uso de mesas
    const mesas = await analizarMesas(comandas);
    
    // Paso 9: Procesar información de clientes
    const clientes = analizarClientes(comandas);
    
    // Paso 10: Recopilar auditoría de operaciones
    const auditoria = await recopilarAuditoria(periodoInicio, periodoFin, comandas);
    
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
      datosGraficos: generarDatosGraficos(resumenFinanciero, productos, mozos, mesas)
    });
    
    // Paso 12: Guardar cierre en base de datos
    await cierre.save();
    
    // Paso 13: Marcar comandas como procesadas (CRÍTICO)
    const comandaIds = comandas.map(c => c._id);
    await Comanda.updateMany(
      { _id: { $in: comandaIds } },
      { $set: { incluidoEnCierre: cierre._id } }
    );
    
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
 * GET /api/cierre-caja/historial
 * Listar cierres históricos con paginación y filtros
 */
router.get('/cierre-caja/historial', async (req, res) => {
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
      .select('fechaCierre periodoInicio periodoFin resumenFinanciero usuarioAdmin estado')
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
 * GET /api/cierre-caja/:id
 * Obtener un cierre específico con todos sus detalles
 */
router.get('/cierre-caja/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const cierre = await CierreCajaRestaurante.findById(id).lean();
    
    if (!cierre) {
      return res.status(404).json({ error: 'Cierre de caja no encontrado' });
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
router.get('/cierre-caja/estado/actual', async (req, res) => {
  try {
    const ultimoCierre = await CierreCajaRestaurante.findOne()
      .sort({ fechaCierre: -1 })
      .select('fechaCierre periodoFin')
      .lean();
    
    const periodoInicio = ultimoCierre?.periodoFin || new Date('2024-01-01');
    const periodoFin = moment.tz("America/Lima").toDate();
    
    const comandasPendientes = await Comanda.countDocuments({
      createdAt: { $gte: periodoInicio, $lte: periodoFin },
      $or: [
        { incluidoEnCierre: null },
        { incluidoEnCierre: { $exists: false } }
      ]
    });
    
    const montoPendiente = await Comanda.aggregate([
      {
        $match: {
          createdAt: { $gte: periodoInicio, $lte: periodoFin },
          status: { $in: ['completadas', 'pagado'] },
          $or: [
            { incluidoEnCierre: null },
            { incluidoEnCierre: { $exists: false } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$precioTotal' }
        }
      }
    ]);
    
    const diasTranscurridos = ultimoCierre 
      ? Math.floor((periodoFin - ultimoCierre.fechaCierre) / (1000 * 60 * 60 * 24))
      : Math.floor((periodoFin - periodoInicio) / (1000 * 60 * 60 * 24));
    
    res.json({
      ultimoCierre: ultimoCierre?.fechaCierre || null,
      periodoInicio,
      periodoFin,
      diasTranscurridos,
      comandasPendientes,
      montoPendiente: montoPendiente[0]?.total || 0
    });
    
  } catch (error) {
    logger.error('Error al obtener estado actual', { error: error.message });
    res.status(500).json({
      error: 'Error al obtener estado actual',
      message: error.message
    });
  }
});

// ========== FUNCIONES AUXILIARES ==========

function calcularResumenFinanciero(comandas, periodoInicio, periodoFin) {
  const totalComandas = comandas.length;
  const comandasCompletadas = comandas.filter(c => 
    c.status === 'pagado' || c.status === 'entregado'
  );
  
  const montoTotalVendido = comandasCompletadas.reduce((sum, c) => sum + (c.precioTotal || 0), 0);
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
    dia.monto += c.precioTotal || 0;
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
    horaData.monto += c.precioTotal || 0;
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
  
  comandas.forEach(comanda => {
    if (!comanda.platos || !Array.isArray(comanda.platos)) return;
    
    comanda.platos.forEach((itemPlato, index) => {
      if (itemPlato.eliminado) return;
      
      const plato = itemPlato.plato;
      if (!plato || !plato._id) return;
      
      const cantidad = comanda.cantidades?.[index] || 1;
      const precio = plato.precio || 0;
      const monto = cantidad * precio;
      
      totalProductosVendidos += cantidad;
      
      if (!productosMap.has(plato._id.toString())) {
        productosMap.set(plato._id.toString(), {
          platoId: plato._id,
          nombre: plato.nombre || 'Sin nombre',
          cantidad: 0,
          monto: 0,
          categoria: plato.categoria || 'Sin categoría'
        });
      }
      
      const producto = productosMap.get(plato._id.toString());
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
    margenPorProducto: [] // Se puede calcular si hay costos
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
    mozo.montoTotalVendido += comanda.precioTotal || 0;
    
    // Contar comandas completadas por separado
    if (comanda.status === 'pagado' || comanda.status === 'entregado') {
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
    
    // Rotación por mesa
    if (!mesasMap.has(mesaId)) {
      mesasMap.set(mesaId, {
        mesaId: comanda.mesas._id,
        numMesa,
        area,
        usos: 0
      });
    }
    mesasMap.get(mesaId).usos += 1;
    
    // Ocupación por área
    if (!areasMap.has(area)) {
      areasMap.set(area, 0);
    }
    areasMap.set(area, areasMap.get(area) + 1);
    
    // Horas pico
    const hora = moment(comanda.createdAt).hour();
    if (!horasPicoMap.has(hora)) {
      horasPicoMap.set(hora, new Set());
    }
    horasPicoMap.get(hora).add(mesaId);
  });
  
  const mesasUsadas = Array.from(mesasMap.values());
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
  
  return {
    mesasUsadas,
    rotacionPorMesa,
    ocupacionPorArea,
    tiempoPromedioOcupacion: 0, // Se puede calcular si hay timestamps de inicio/fin
    horasPicoOcupacion
  };
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
      cliente.montoTotal += comanda.precioTotal || 0;
      montoTotalClientes += comanda.precioTotal || 0;
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

async function recopilarAuditoria(periodoInicio, periodoFin, comandas) {
  // Comandas canceladas
  const comandasCanceladas = comandas
    .filter(c => !c.IsActive || c.motivoEliminacion)
    .map(c => ({
      comandaId: c._id,
      comandaNumber: c.comandaNumber,
      fecha: c.fechaEliminacion || c.createdAt,
      mozo: c.mozos?.name || 'Desconocido',
      monto: c.precioTotal || 0,
      motivo: c.motivoEliminacion || 'Sin motivo registrado'
    }));
  
  // Buscar en auditoría acciones del período
  const accionesAuditoria = await AuditoriaAcciones.find({
    timestamp: { $gte: periodoInicio, $lte: periodoFin }
  })
  .populate('usuario', 'name')
  .sort({ timestamp: -1 })
  .limit(100)
  .lean();
  
  const modificaciones = accionesAuditoria
    .filter(a => a.accion !== 'comanda_eliminada' && a.entidadTipo === 'comanda')
    .map(a => ({
      tipo: a.accion,
      comandaId: a.entidadId || null,
      fecha: a.timestamp,
      usuario: a.usuario?.name || a.metadata?.usuarioNombre || 'Desconocido',
      descripcion: a.motivo || a.accion
    }));
  
  // Descuentos aplicados (se pueden obtener de auditoría o de comandas)
  const descuentosAplicados = [];
  
  // Operaciones especiales (mesas fusionadas/divididas)
  const operacionesEspeciales = accionesAuditoria
    .filter(a => a.entidadTipo === 'mesa' || a.accion.includes('mesa'))
    .map(a => ({
      tipo: a.accion,
      fecha: a.timestamp,
      descripcion: a.motivo || a.accion
    }));
  
  return {
    comandasCanceladas,
    modificaciones,
    descuentosAplicados,
    operacionesEspeciales
  };
}

function generarDatosGraficos(resumenFinanciero, productos, mozos, mesas) {
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
    }))
  };
}

/**
 * GET /api/cierre-caja/:id/exportar-pdf
 * Exportar cierre de caja a PDF
 */
router.get('/cierre-caja/:id/exportar-pdf', async (req, res) => {
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
router.get('/cierre-caja/:id/exportar-excel', async (req, res) => {
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

