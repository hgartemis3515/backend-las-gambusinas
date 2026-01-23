const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

/**
 * Modelo de Cierre de Caja Diario
 * Sistema profesional de auditoría financiera
 * Inspirado en Toast POS, Square Terminal, Lightspeed Restaurant
 */
const cierreCajaSchema = new mongoose.Schema({
  // Identificadores
  cierreId: { 
    type: Number, 
    unique: true,
    index: true
  },
  mozoId: { 
    type: Number, 
    ref: 'Mozos', 
    required: true, 
    index: true 
  },
  nombreMozo: { 
    type: String, 
    required: true 
  }, // Denormalizado para queries rápidas
  
  // Fecha y turno
  fechaCierre: { 
    type: Date, 
    required: true, 
    index: true 
  },
  turno: { 
    type: String, 
    enum: ['mañana', 'tarde', 'noche'], 
    required: true 
  },
  
  // Totales del día (calculados desde Bouchers)
  totalEfectivoSistema: { 
    type: Number, 
    required: true, 
    min: 0,
    default: 0
  },
  totalTarjetaSistema: { 
    type: Number, 
    default: 0,
    min: 0
  },
  totalYapeSistema: { 
    type: Number, 
    default: 0,
    min: 0
  },
  totalPlinSistema: { 
    type: Number, 
    default: 0,
    min: 0
  },
  totalTransferenciaSistema: { 
    type: Number, 
    default: 0,
    min: 0
  },
  totalPropinas: { 
    type: Number, 
    default: 0,
    min: 0
  },
  totalDescuentos: { 
    type: Number, 
    default: 0,
    min: 0
  },
  
  // Físico reportado por mozo
  totalEfectivoFisico: { 
    type: Number, 
    default: 0,
    min: 0
  },
  
  // Cálculos automáticos
  totalSistema: { 
    type: Number, 
    required: true,
    default: 0
  },
  diferencia: { 
    type: Number, 
    required: true,
    default: 0
  }, // físico - sistema
  
  estado: { 
    type: String, 
    enum: ['borrador', 'pendiente', 'aprobado', 'rechazado'], 
    default: 'borrador',
    index: true
  },
  
  // Auditoría
  createdBy: { 
    type: Number, 
    ref: 'Mozos', 
    required: true 
  },
  aprobadoPor: { 
    type: Number, 
    ref: 'Mozos',
    default: null
  },
  observaciones: {
    type: String,
    default: null
  },
  aprobadoAt: {
    type: Date,
    default: null
  }
}, { 
  timestamps: true 
});

// Índice compuesto para evitar cierres duplicados
cierreCajaSchema.index({ mozoId: 1, fechaCierre: 1, turno: 1 }, { unique: true });

// Auto-incremento para cierreId
cierreCajaSchema.plugin(AutoIncrement, { inc_field: 'cierreId' });

// Método para calcular diferencia
cierreCajaSchema.methods.calcularDiferencia = function() {
  this.diferencia = (this.totalEfectivoFisico || 0) - (this.totalEfectivoSistema || 0);
  return this.diferencia;
};

// Método para validar estado según diferencia
cierreCajaSchema.methods.validarEstado = function() {
  const diferencia = Math.abs(this.diferencia || 0);
  const tolerancia = 5; // S/5 de tolerancia
  
  if (this.estado === 'borrador') {
    if (diferencia > tolerancia) {
      this.estado = 'rechazado';
      this.observaciones = `Diferencia de S/. ${diferencia.toFixed(2)}. Revisar.`;
    } else {
      this.estado = 'aprobado';
      this.aprobadoAt = new Date();
    }
  }
  
  return this.estado;
};

module.exports = mongoose.model('CierreCaja', cierreCajaSchema);

