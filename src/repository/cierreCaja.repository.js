const CierreCaja = require('../database/models/cierreCaja.model');
const Boucher = require('../database/models/boucher.model');
const Mozos = require('../database/models/mozos.model');
const moment = require('moment-timezone');

/**
 * Repository de Cierre de Caja
 * Lógica de negocio para gestión de cierres diarios
 */
class CierreCajaRepository {
  
  /**
   * Generar cierre automático por mozo/fecha/turno
   * Calcula totales desde Bouchers del día
   */
  static async generarCierreAutomatico(mozoId, fecha, turno, createdBy) {
    try {
      // 1. Validar no existe cierre para mozo/fecha/turno
      const fechaDate = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").toDate();
      const inicioDia = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
      const finDia = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
      
      const existe = await CierreCaja.findOne({ 
        mozoId, 
        fechaCierre: { $gte: inicioDia, $lte: finDia },
        turno 
      });
      
      if (existe && existe.estado !== 'rechazado') {
        throw new Error('Ya existe cierre para este mozo/turno/fecha');
      }
      
      // 2. Obtener nombre del mozo
      const mozo = await Mozos.findOne({ mozoId });
      if (!mozo) {
        throw new Error('Mozo no encontrado');
      }
      
      // 3. Calcular totales desde Bouchers del día
      // Nota: Asumiendo que todos los bouchers son efectivo por ahora
      // Si hay método de pago, se debe agregar al modelo Boucher
      const match = {
        mozo: mozo._id, // Buscar por ObjectId del mozo
        fechaPago: { $gte: inicioDia, $lte: finDia },
        isActive: true,
        anulado: { $ne: true }
      };
      
      const bouchers = await Boucher.find(match);
      
      // Calcular totales
      let totalEfectivoSistema = 0;
      let totalTarjetaSistema = 0;
      let totalYapeSistema = 0;
      let totalPlinSistema = 0;
      let totalTransferenciaSistema = 0;
      let totalPropinas = 0;
      let totalDescuentos = 0;
      let totalSistema = 0;
      
      bouchers.forEach(boucher => {
        const total = boucher.total || 0;
        totalSistema += total;
        
        // Por defecto, todos son efectivo hasta que se agregue metodoPago al modelo
        // TODO: Agregar campo metodoPago al modelo Boucher
        totalEfectivoSistema += total;
        
        // Si hay propinas o descuentos, agregarlos
        // TODO: Agregar campos propina y descuento al modelo Boucher si no existen
      });
      
      // 4. Crear cierre
      const cierre = new CierreCaja({
        mozoId,
        nombreMozo: mozo.name,
        fechaCierre: inicioDia,
        turno,
        totalEfectivoSistema,
        totalTarjetaSistema,
        totalYapeSistema,
        totalPlinSistema,
        totalTransferenciaSistema,
        totalPropinas,
        totalDescuentos,
        totalSistema,
        totalEfectivoFisico: 0, // Se llenará al validar
        diferencia: 0,
        estado: 'borrador',
        createdBy
      });
      
      await cierre.save();
      console.log(`✅ Cierre de caja generado: ${cierre.cierreId} para mozo ${mozoId}`);
      
      return cierre;
    } catch (error) {
      console.error('❌ Error generando cierre de caja:', error);
      throw error;
    }
  }
  
  /**
   * Validar cierre físico
   * Actualiza totalEfectivoFisico y calcula diferencia
   */
  static async validarCierreFisico(cierreId, totalEfectivoFisico, aprobadoPor) {
    try {
      const cierre = await CierreCaja.findById(cierreId);
      
      if (!cierre) {
        throw new Error('Cierre no encontrado');
      }
      
      if (cierre.estado !== 'borrador' && cierre.estado !== 'pendiente') {
        throw new Error('Cierre no válido para validación. Estado actual: ' + cierre.estado);
      }
      
      // Actualizar efectivo físico
      cierre.totalEfectivoFisico = totalEfectivoFisico;
      
      // Calcular diferencia
      cierre.calcularDiferencia();
      
      // Validar estado según diferencia
      cierre.validarEstado();
      
      if (cierre.estado === 'aprobado') {
        cierre.aprobadoPor = aprobadoPor;
        cierre.aprobadoAt = new Date();
      }
      
      await cierre.save();
      console.log(`✅ Cierre ${cierreId} validado. Estado: ${cierre.estado}, Diferencia: S/. ${cierre.diferencia.toFixed(2)}`);
      
      return cierre;
    } catch (error) {
      console.error('❌ Error validando cierre:', error);
      throw error;
    }
  }
  
  /**
   * Verificar si mozo tiene cierre pendiente
   * Usado por middleware para bloquear transacciones
   */
  static async tieneCierrePendiente(mozoId, fecha) {
    try {
      const fechaDate = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").toDate();
      const inicioDia = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
      const finDia = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
      
      const pendiente = await CierreCaja.findOne({
        mozoId,
        fechaCierre: { $gte: inicioDia, $lte: finDia },
        estado: { $in: ['borrador', 'pendiente'] }
      });
      
      return pendiente;
    } catch (error) {
      console.error('❌ Error verificando cierre pendiente:', error);
      return null;
    }
  }
  
  /**
   * Listar cierres con filtros
   */
  static async listarCierres(filtros = {}) {
    try {
      const { mozoId, fechaDesde, fechaHasta, estado } = filtros;
      
      const match = {};
      
      if (mozoId) {
        match.mozoId = mozoId;
      }
      
      if (fechaDesde || fechaHasta) {
        match.fechaCierre = {};
        if (fechaDesde) {
          match.fechaCierre.$gte = moment.tz(fechaDesde, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
        }
        if (fechaHasta) {
          match.fechaCierre.$lte = moment.tz(fechaHasta, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
        }
      }
      
      if (estado) {
        match.estado = estado;
      } else {
        // Por defecto, excluir borradores
        match.estado = { $ne: 'borrador' };
      }
      
      const cierres = await CierreCaja.find(match)
        .populate('mozoId', 'name DNI')
        .sort({ fechaCierre: -1, createdAt: -1 });
      
      return cierres;
    } catch (error) {
      console.error('❌ Error listando cierres:', error);
      throw error;
    }
  }
  
  /**
   * Obtener cierre por ID
   */
  static async obtenerCierrePorId(cierreId) {
    try {
      const cierre = await CierreCaja.findById(cierreId)
        .populate('mozoId', 'name DNI')
        .populate('createdBy', 'name')
        .populate('aprobadoPor', 'name');
      
      return cierre;
    } catch (error) {
      console.error('❌ Error obteniendo cierre:', error);
      throw error;
    }
  }
}

module.exports = CierreCajaRepository;

