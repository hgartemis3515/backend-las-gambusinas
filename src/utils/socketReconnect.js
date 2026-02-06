/**
 * Utilidad para reconexión WebSocket robusta con backoff exponencial
 * Para usar en el cliente (frontend)
 */

class SocketReconnectManager {
  constructor(socket, options = {}) {
    this.socket = socket;
    this.maxReconnectAttempts = options.maxReconnectAttempts || Infinity;
    this.initialDelay = options.initialDelay || 1000; // 1 segundo
    this.maxDelay = options.maxDelay || 30000; // 30 segundos
    this.reconnectAttempts = 0;
    this.reconnectTimeout = null;
    this.isManualDisconnect = false;
    
    this.setupListeners();
  }

  setupListeners() {
    this.socket.on('connect', () => {
      console.log('✅ WebSocket conectado');
      this.reconnectAttempts = 0;
      this.onConnect();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket desconectado:', reason);
      
      // No reconectar si fue desconexión manual
      if (this.isManualDisconnect) {
        return;
      }

      // Reconectar automáticamente
      this.scheduleReconnect();
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Error de conexión WebSocket:', error.message);
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    // Limpiar timeout anterior si existe
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    // Verificar límite de intentos
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Máximo de intentos de reconexión alcanzado');
      this.onMaxAttemptsReached();
      return;
    }

    // Calcular delay con backoff exponencial
    const delay = Math.min(
      this.initialDelay * Math.pow(2, this.reconnectAttempts),
      this.maxDelay
    );

    console.log(`🔄 Reintentando conexión en ${delay}ms (intento ${this.reconnectAttempts + 1})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.socket.connect();
    }, delay);
  }

  // Métodos para sobrescribir en implementación
  onConnect() {
    // Override en implementación
  }

  onMaxAttemptsReached() {
    // Override en implementación
  }

  disconnect() {
    this.isManualDisconnect = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.socket.disconnect();
  }

  destroy() {
    this.disconnect();
    this.socket.removeAllListeners();
  }
}

module.exports = SocketReconnectManager;

