/**
 * FASE 5: WebSocket Debounce + Batching
 * 
 * Optimización CRÍTICA: Agrupa eventos de plato-actualizado en batches
 * Reducción: 10 emits → 1 emit (-90% tráfico WebSocket)
 * 
 * Lógica:
 * - Queue eventos de plato-actualizado en memoria
 * - Emitir batch cada 300ms
 * - Merge múltiples platos de misma comanda en 1 evento
 */

const logger = require('./logger');

class WebSocketBatchQueue {
  constructor() {
    this.queue = new Map(); // Map<comandaId, Set<platoData>>
    this.batchInterval = null;
    this.batchDelay = 300; // ms - Delay para agrupar eventos
    this.isProcessing = false;
  }

  /**
   * Agregar evento de plato a la queue
   * @param {Object} platoData - {comandaId, platoId, nuevoEstado, estadoAnterior, mesaId, fecha}
   */
  addPlatoEvent(platoData) {
    const { comandaId } = platoData;
    
    if (!this.queue.has(comandaId)) {
      this.queue.set(comandaId, new Set());
    }
    
    // Agregar o actualizar evento del plato (último estado gana)
    const comandaQueue = this.queue.get(comandaId);
    const existingEvent = Array.from(comandaQueue).find(
      e => e.platoId?.toString() === platoData.platoId?.toString()
    );
    
    if (existingEvent) {
      // Actualizar evento existente (último estado gana)
      comandaQueue.delete(existingEvent);
    }
    
    comandaQueue.add(platoData);
    
    // Iniciar batch timer si no está activo
    if (!this.batchInterval && !this.isProcessing) {
      this.startBatchTimer();
    }
    
    logger.debug('FASE5: Evento agregado a queue', {
      comandaId: comandaId?.toString(),
      platoId: platoData.platoId?.toString(),
      queueSize: this.queue.size,
      totalPlatos: Array.from(this.queue.values()).reduce((sum, set) => sum + set.size, 0)
    });
  }

  /**
   * Iniciar timer para procesar batch
   */
  startBatchTimer() {
    if (this.batchInterval) return;
    
    this.batchInterval = setTimeout(() => {
      this.processBatch();
    }, this.batchDelay);
  }

  /**
   * Procesar batch de eventos y emitirlos
   */
  async processBatch() {
    if (this.isProcessing || this.queue.size === 0) {
      this.batchInterval = null;
      return;
    }
    
    this.isProcessing = true;
    this.batchInterval = null;
    
    try {
      // Crear batches por comanda
      const batches = [];
      
      for (const [comandaId, platosSet] of this.queue.entries()) {
        const platos = Array.from(platosSet);
        
        if (platos.length === 0) continue;
        
        // Agrupar platos por mesaId y fecha para optimizar rooms
        const platosByMesa = new Map();
        
        platos.forEach(plato => {
          const key = `${plato.mesaId || 'all'}-${plato.fecha || 'today'}`;
          if (!platosByMesa.has(key)) {
            platosByMesa.set(key, []);
          }
          platosByMesa.get(key).push(plato);
        });
        
        // Crear batch por mesa/fecha
        for (const [key, platosGroup] of platosByMesa.entries()) {
          batches.push({
            comandaId,
            platos: platosGroup,
            mesaId: platosGroup[0]?.mesaId,
            fecha: platosGroup[0]?.fecha
          });
        }
      }
      
      // Limpiar queue
      this.queue.clear();
      
      // Emitir batches
      if (batches.length > 0 && global.emitPlatoBatch) {
        for (const batch of batches) {
          await global.emitPlatoBatch(batch);
        }
        
        logger.info('FASE5: Batch procesado y emitido', {
          batchesCount: batches.length,
          totalPlatos: batches.reduce((sum, b) => sum + b.platos.length, 0),
          reduction: `${Math.round((1 - batches.length / batches.reduce((sum, b) => sum + b.platos.length, 0)) * 100)}%`
        });
      }
    } catch (error) {
      logger.error('FASE5: Error procesando batch', {
        error: error.message,
        stack: error.stack
      });
    } finally {
      this.isProcessing = false;
      
      // Si hay más eventos en queue, reiniciar timer
      if (this.queue.size > 0) {
        this.startBatchTimer();
      }
    }
  }

  /**
   * Forzar procesamiento inmediato del batch (útil para testing)
   */
  async flush() {
    if (this.batchInterval) {
      clearTimeout(this.batchInterval);
      this.batchInterval = null;
    }
    await this.processBatch();
  }

  /**
   * Obtener estadísticas de la queue
   */
  getStats() {
    const totalPlatos = Array.from(this.queue.values()).reduce((sum, set) => sum + set.size, 0);
    return {
      comandasEnQueue: this.queue.size,
      totalPlatosEnQueue: totalPlatos,
      isProcessing: this.isProcessing,
      batchDelay: this.batchDelay
    };
  }
}

// Singleton instance
const batchQueue = new WebSocketBatchQueue();

module.exports = batchQueue;

