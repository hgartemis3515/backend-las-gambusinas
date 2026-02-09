const mongoose = require('mongoose');
const moment = require('moment-timezone');

/**
 * Modelo de Cierre de Caja del Restaurante
 * Sistema completo de auditoría financiera y operativa
 * Captura todas las métricas del restaurante desde el último cierre hasta el cierre actual
 */
const cierreCajaRestauranteSchema = new mongoose.Schema({
  // Bloque 1: Información temporal y control
  fechaCierre: {
    type: Date,
    required: true,
    default: () => moment.tz("America/Lima").toDate(),
    index: true
  },
  fechaUltimoCierre: {
    type: Date,
    default: null // null si es el primer cierre
  },
  periodoInicio: {
    type: Date,
    required: true,
    index: true
  },
  periodoFin: {
    type: Date,
    required: true,
    index: true
  },
  usuarioAdmin: {
    type: String, // Nombre o ID del administrador que ejecutó el cierre
    required: true
  },
  
  // Bloque 2: Resumen financiero comandas
  resumenFinanciero: {
    totalComandas: { type: Number, default: 0 },
    montoTotalVendido: { type: Number, default: 0 },
    ticketPromedio: { type: Number, default: 0 },
    comandasPorEstado: {
      pendientes: { type: Number, default: 0 },
      enProceso: { type: Number, default: 0 },
      completadas: { type: Number, default: 0 },
      canceladas: { type: Number, default: 0 }
    },
    ventasPorDia: [{
      fecha: Date,
      monto: Number,
      cantidadComandas: Number
    }],
    ventasPorHora: [{
      hora: Number, // 0-23
      monto: Number,
      cantidadComandas: Number
    }],
    picoVentas: {
      hora: Number,
      dia: Date,
      monto: Number
    }
  },
  
  // Bloque 3: Análisis detallado de productos
  productos: {
    totalProductosVendidos: { type: Number, default: 0 },
    topProductos: [{
      platoId: { type: mongoose.Schema.Types.ObjectId, ref: 'platos' },
      nombre: String,
      cantidad: Number,
      monto: Number,
      categoria: String
    }],
    productosPorCategoria: mongoose.Schema.Types.Mixed, // Objeto dinámico con categorías
    productosMenosVendidos: [{
      platoId: { type: mongoose.Schema.Types.ObjectId, ref: 'platos' },
      nombre: String,
      cantidad: Number,
      monto: Number
    }],
    margenPorProducto: [{
      platoId: { type: mongoose.Schema.Types.ObjectId, ref: 'platos' },
      nombre: String,
      ingreso: Number,
      costo: Number, // Si está disponible
      margen: Number
    }]
  },
  
  // Bloque 4: Desempeño de mozos
  mozos: {
    totalMozos: { type: Number, default: 0 },
    desempeñoPorMozo: [{
      mozoId: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos' },
      nombre: String,
      comandasAtendidas: Number,
      montoTotalVendido: Number,
      ticketPromedio: Number,
      tiempoPromedioAtencion: Number // en minutos
    }],
    rankingMozos: [{
      mozoId: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos' },
      nombre: String,
      posicion: Number,
      score: Number // Puntuación combinada de métricas
    }]
  },
  
  // Bloque 5: Ocupación y uso de mesas
  mesas: {
    mesasUsadas: [{
      mesaId: { type: mongoose.Schema.Types.ObjectId, ref: 'mesas' },
      numMesa: Number,
      area: String
    }],
    rotacionPorMesa: mongoose.Schema.Types.Mixed, // Objeto con mesaId: cantidad de usos
    ocupacionPorArea: mongoose.Schema.Types.Mixed, // Objeto con área: cantidad de usos
    tiempoPromedioOcupacion: { type: Number, default: 0 }, // en minutos
    horasPicoOcupacion: [{
      hora: Number,
      cantidadMesas: Number
    }]
  },
  
  // Bloque 6: Análisis de clientes
  clientes: {
    totalClientes: { type: Number, default: 0 },
    clientesNuevos: { type: Number, default: 0 },
    clientesRecurrentes: { type: Number, default: 0 },
    ticketPromedioPorCliente: { type: Number, default: 0 },
    topClientes: [{
      clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente' },
      nombre: String,
      montoTotal: Number,
      cantidadVisitas: Number
    }]
  },
  
  // Bloque 7: Auditoría de cambios y operaciones
  auditoria: {
    comandasCanceladas: [{
      comandaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comanda' },
      comandaNumber: Number,
      fecha: Date,
      mozo: String,
      monto: Number,
      motivo: String
    }],
    modificaciones: [{
      tipo: String, // 'comanda_editada', 'plato_eliminado', etc.
      comandaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comanda' },
      fecha: Date,
      usuario: String,
      descripcion: String
    }],
    descuentosAplicados: [{
      comandaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comanda' },
      montoDescuento: Number,
      fecha: Date,
      motivo: String
    }],
    operacionesEspeciales: [{
      tipo: String, // 'mesa_fusionada', 'mesa_dividida', etc.
      fecha: Date,
      descripcion: String
    }]
  },
  
  // Bloque 8: Información operativa adicional
  informacionOperativa: {
    horariosOperacion: {
      inicio: Date,
      fin: Date
    },
    reservas: {
      cumplidas: { type: Number, default: 0 },
      noCumplidas: { type: Number, default: 0 }
    },
    problemasReportados: [{
      tipo: String,
      descripcion: String,
      fecha: Date
    }],
    notasAdmin: String
  },
  
  // Estado del cierre
  estado: {
    type: String,
    enum: ['completado', 'error'],
    default: 'completado'
  },
  
  // Datos procesados para gráficos (optimización)
  datosGraficos: {
    ventasPorDia: [{
      fecha: String, // Formato YYYY-MM-DD
      monto: Number
    }],
    ventasPorHora: [{
      hora: Number,
      monto: Number
    }],
    productosTop: [{
      nombre: String,
      cantidad: Number,
      monto: Number
    }],
    mozosRanking: [{
      nombre: String,
      monto: Number,
      comandas: Number
    }],
    ocupacionAreas: [{
      area: String,
      cantidad: Number
    }]
  }
}, {
  timestamps: true
});

// Índices para optimizar consultas
cierreCajaRestauranteSchema.index({ fechaCierre: -1 });
cierreCajaRestauranteSchema.index({ periodoInicio: 1, periodoFin: 1 });

const CierreCajaRestaurante = mongoose.model('CierreCajaRestaurante', cierreCajaRestauranteSchema);

module.exports = CierreCajaRestaurante;


