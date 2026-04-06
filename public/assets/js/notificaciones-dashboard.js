/**
 * Las Gambusinas - Sistema de Notificaciones del Dashboard
 * Gestiona el panel de notificaciones en el topbar
 */

class NotificacionesDashboard {
    constructor() {
        this.notificaciones = [];
        this.noLeidas = 0;
        this.socket = null;
        this.pollingInterval = null;
        this.containerId = 'notificaciones-container';
        this.badgeId = 'notificaciones-badge';
        this.dropdownId = 'notificaciones-dropdown';
        
        // Configuración
        this.config = {
            pollingTime: 30000, // 30 segundos
            maxVisibles: 10,
            autoMarkRead: false // Si true, marca como leída al abrir
        };
    }

    /**
     * Inicializar el sistema
     */
    async init() {
        console.log('🔔 Inicializando sistema de notificaciones...');
        
        // Cargar notificaciones iniciales
        await this.cargarNotificaciones();
        
        // Conectar WebSocket
        this.conectarSocket();
        
        // Iniciar polling como fallback
        this.iniciarPolling();
        
        // Event listeners
        this.setupEventListeners();
        
        console.log('✅ Sistema de notificaciones listo');
    }

    /**
     * Cargar notificaciones desde la API
     */
    async cargarNotificaciones() {
        try {
            // Verificar que apiGet está disponible
            if (typeof apiGet !== 'function') {
                console.warn('🔔 apiGet no disponible aún');
                return;
            }
            
            const response = await apiGet('/notificaciones?limit=20');
            
            if (response && response.success) {
                this.notificaciones = response.data || [];
                this.noLeidas = response.meta?.noLeidas || 0;
                this.actualizarUI();
            }
        } catch (error) {
            // Error silencioso - las notificaciones son opcionales
            if (error?.message?.includes('401') || error?.message?.includes('Unauthorized')) {
                console.warn('🔔 Sesión expirada, notificaciones deshabilitadas');
            } else {
                console.warn('🔔 Error cargando notificaciones (no crítico):', error?.message || error);
            }
        }
    }

    /**
     * Conectar Socket.io para actualizaciones en tiempo real
     */
    conectarSocket() {
        // Verificar si Socket.io client está disponible
        if (typeof io === 'undefined') {
            console.warn('Socket.io client no está cargado, usando solo polling');
            return;
        }

        const token = getToken();
        if (!token) return;

        try {
            // Usar el namespace /admin
            this.socket = io('/admin', {
                auth: { token },
                transports: ['websocket', 'polling']
            });

            this.socket.on('connect', () => {
                console.log('🔔 Socket de notificaciones conectado');
            });

            this.socket.on('nueva-notificacion', (notificacion) => {
                this.agregarNotificacion(notificacion);
            });

            this.socket.on('notificacion-actualizada', (data) => {
                this.actualizarNotificacion(data);
            });

            this.socket.on('disconnect', () => {
                console.log('🔔 Socket de notificaciones desconectado');
            });

        } catch (error) {
            console.warn('No se pudo conectar Socket.io para notificaciones:', error);
        }
    }

    /**
     * Iniciar polling como fallback
     */
    iniciarPolling() {
        this.pollingInterval = setInterval(() => {
            this.cargarNotificaciones();
        }, this.config.pollingTime);
    }

    /**
     * Detener polling
     */
    detenerPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    /**
     * Agregar nueva notificación (desde WebSocket)
     */
    agregarNotificacion(notificacion) {
        // Agregar al inicio
        this.notificaciones.unshift(notificacion);
        
        // Incrementar contador
        if (!notificacion.leida) {
            this.noLeidas++;
        }
        
        // Limitar cantidad
        if (this.notificaciones.length > 50) {
            this.notificaciones = this.notificaciones.slice(0, 50);
        }
        
        // Actualizar UI
        this.actualizarUI();
        
        // Mostrar toast si está disponible
        this.mostrarToastNotificacion(notificacion);
    }

    /**
     * Actualizar notificación existente
     */
    actualizarNotificacion(data) {
        const index = this.notificaciones.findIndex(n => n._id === data._id);
        if (index !== -1) {
            this.notificaciones[index] = { ...this.notificaciones[index], ...data };
            this.actualizarUI();
        }
    }

    /**
     * Actualizar la interfaz de usuario
     */
    actualizarUI() {
        this.actualizarBadge();
        this.renderDropdown();
    }

    /**
     * Actualizar badge de contador
     */
    actualizarBadge() {
        const badge = document.getElementById(this.badgeId);
        if (badge) {
            badge.textContent = this.noLeidas > 99 ? '99+' : this.noLeidas;
            badge.classList.toggle('hidden', this.noLeidas === 0);
        }
    }

    /**
     * Renderizar el dropdown de notificaciones
     */
    renderDropdown() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const noLeidasList = this.notificaciones.filter(n => !n.leida).slice(0, this.config.maxVisibles);
        const leidasList = this.notificaciones.filter(n => n.leida).slice(0, 5);

        container.innerHTML = `
            <div class="flex items-center justify-between px-4 py-3 border-b border-[rgba(212,175,55,0.1)]">
                <span class="font-semibold text-sm">Notificaciones</span>
                ${this.noLeidas > 0 ? `
                    <button onclick="notificacionesDashboard.marcarTodasLeidas()" class="text-xs text-gold cursor-pointer hover:underline">
                        Marcar todas leídas
                    </button>
                ` : ''}
            </div>
            <div class="max-h-72 overflow-y-auto">
                ${this.notificaciones.length === 0 ? `
                    <div class="px-4 py-8 text-center text-txt-muted text-sm">
                        <span class="text-2xl block mb-2">🔔</span>
                        No hay notificaciones
                    </div>
                ` : ''}
                ${noLeidasList.map(n => this.renderNotificacionItem(n, true)).join('')}
                ${leidasList.length > 0 ? `
                    <div class="px-4 py-2 text-xs text-txt-muted border-t border-[rgba(212,175,55,0.05)]">
                        Anteriores
                    </div>
                    ${leidasList.map(n => this.renderNotificacionItem(n, false)).join('')}
                ` : ''}
            </div>
            <div class="px-4 py-2.5 text-center border-t border-[rgba(212,175,55,0.1)]">
                <a href="/auditoria.html" class="text-xs text-gold cursor-pointer hover:underline">
                    Ver historial completo
                </a>
            </div>
        `;
    }

    /**
     * Renderizar item individual de notificación
     */
    renderNotificacionItem(notif, esNueva) {
        const tiempoTranscurrido = this.tiempoTranscurrido(notif.createdAt);
        const bgClass = esNueva ? 'bg-[rgba(212,175,55,0.04)]' : '';
        
        return `
            <div 
                class="flex gap-3 px-4 py-3 hover:bg-gold-20 cursor-pointer border-b border-[rgba(212,175,55,0.05)] ${bgClass} ${esNueva ? 'font-medium' : ''}"
                onclick="notificacionesDashboard.handleClickNotificacion('${notif._id}', '${notif.accion?.url || ''}')"
            >
                <span class="text-lg mt-0.5 flex-shrink-0">${notif.icono || '🔔'}</span>
                <div class="flex-1 min-w-0">
                    <p class="text-sm truncate">${notif.titulo}</p>
                    ${notif.mensaje ? `<p class="text-xs text-txt-muted truncate">${notif.mensaje}</p>` : ''}
                    <p class="text-[10px] text-txt-muted mt-1">${tiempoTranscurrido}</p>
                </div>
                ${esNueva ? '<span class="w-2 h-2 rounded-full bg-gold mt-2 flex-shrink-0"></span>' : ''}
            </div>
        `;
    }

    /**
     * Manejar click en notificación
     */
    async handleClickNotificacion(id, url) {
        // Marcar como leída
        await this.marcarLeida(id);
        
        // Navegar si hay URL
        if (url) {
            window.location.href = url;
        }
    }

    /**
     * Marcar notificación como leída
     */
    async marcarLeida(id) {
        try {
            await apiPatch(`/notificaciones/${id}/leida`);
            
            // Actualizar localmente
            const notif = this.notificaciones.find(n => n._id === id);
            if (notif && !notif.leida) {
                notif.leida = true;
                notif.fechaLectura = new Date();
                this.noLeidas = Math.max(0, this.noLeidas - 1);
                this.actualizarUI();
            }
        } catch (error) {
            console.error('Error marcando notificación como leída:', error);
        }
    }

    /**
     * Marcar todas como leídas
     */
    async marcarTodasLeidas() {
        try {
            await apiPatch('/notificaciones/leidas');
            
            // Actualizar localmente
            this.notificaciones.forEach(n => {
                if (!n.leida) {
                    n.leida = true;
                    n.fechaLectura = new Date();
                }
            });
            this.noLeidas = 0;
            this.actualizarUI();
            
            // Mostrar notificación toast
            if (window.GambusinasNotifications) {
                GambusinasNotifications.success('Notificaciones', 'Todas marcadas como leídas');
            }
        } catch (error) {
            console.error('Error marcando todas como leídas:', error);
        }
    }

    /**
     * Mostrar toast de nueva notificación
     */
    mostrarToastNotificacion(notif) {
        if (window.GambusinasNotifications) {
            const categoria = this.mapearCategoria(notif.tipo);
            
            if (categoria === 'auditoria') {
                GambusinasNotifications.audit({
                    eventType: notif.tipo,
                    title: notif.titulo,
                    message: notif.mensaje,
                    entityId: notif.entidadId,
                    entityType: notif.entidadTipo
                });
            } else {
                GambusinasNotifications[categoria](notif.titulo, notif.mensaje, {
                    icon: notif.icono
                });
            }
        }
    }

    /**
     * Mapear tipo de notificación a categoría del sistema toast
     */
    mapearCategoria(tipo) {
        const mapa = {
            'sistema': 'info',
            'comanda': 'info',
            'mesa': 'warning',
            'pago': 'success',
            'alerta': 'warning',
            'auditoria': 'audit'
        };
        return mapa[tipo] || 'info';
    }

    /**
     * Calcular tiempo transcurrido
     */
    tiempoTranscurrido(fecha) {
        const ahora = new Date();
        const fechaNotif = new Date(fecha);
        const diff = ahora - fechaNotif;
        
        const minutos = Math.floor(diff / 60000);
        const horas = Math.floor(diff / 3600000);
        const dias = Math.floor(diff / 86400000);
        
        if (minutos < 1) return 'Ahora';
        if (minutos < 60) return `hace ${minutos} min`;
        if (horas < 24) return `hace ${horas} h`;
        if (dias < 7) return `hace ${dias} días`;
        
        return fechaNotif.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
    }

    /**
     * Configurar event listeners
     */
    setupEventListeners() {
        // Detectar cuando se abre el dropdown para opcionalmente marcar como leídas
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById(this.dropdownId);
            const trigger = e.target.closest('[data-notificaciones-trigger]');
            
            if (trigger && dropdown) {
                // Opcional: marcar todas como leídas al abrir
                if (this.config.autoMarkRead && this.noLeidas > 0) {
                    this.marcarTodasLeidas();
                }
            }
        });
    }

    /**
     * Destruir instancia
     */
    destroy() {
        this.detenerPolling();
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Crear instancia global
const notificacionesDashboard = new NotificacionesDashboard();

// Auto-inicializar cuando el DOM esté listo (con manejo de errores)
function initNotificacionesDashboard() {
    try {
        // Verificar que las dependencias están cargadas
        if (typeof apiGet !== 'function' || typeof getToken !== 'function') {
            console.warn('🔔 Notificaciones: dependencias (shared.js) no cargadas, reintentando...');
            setTimeout(initNotificacionesDashboard, 500);
            return;
        }
        notificacionesDashboard.init().catch(err => {
            console.warn('🔔 Notificaciones: error al inicializar (no crítico)', err);
        });
    } catch (err) {
        console.warn('🔔 Notificaciones: error en inicialización (no crítico)', err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotificacionesDashboard);
} else {
    setTimeout(initNotificacionesDashboard, 200);
}

// Exponer globalmente
window.NotificacionesDashboard = NotificacionesDashboard;
window.notificacionesDashboard = notificacionesDashboard;
