/**
 * Las Gambusinas - Sistema de Notificaciones
 * Módulo central para gestión de notificaciones tipo toast
 * 
 * Categorías:
 * - success: Operaciones CRUD exitosas
 * - error: Errores técnicos y de validación
 * - warning: Acciones potencialmente peligrosas
 * - info: Estados del sistema
 * - audit: Notificaciones de auditoría (alto impacto)
 */

// ============================================
// CONFIGURACIÓN POR DEFECTO
// ============================================
const NotificationDefaults = {
  position: 'bottom-right', // 'top-right', 'top-left', 'bottom-right', 'bottom-left', 'top-center', 'bottom-center'
  duration: {
    success: 4000,
    error: 6000,
    warning: 5000,
    info: 3000,
    audit: 8000 // Más tiempo para leer detalles
  },
  maxVisible: 5,
  pauseOnHover: true,
  showCloseButton: true,
  showProgressBar: true,
  // Animaciones Sileo-style
  animations: {
    enabled: true,
    style: 'spring', // 'spring', 'slide', 'fade', 'bounce'
    springTension: 0.8, // Tensión del efecto spring (0-1)
    iconBounce: true, // Animación del icono al entrar
    progressBarShimmer: true, // Efecto shimmer en la barra de progreso
    exitAnimation: true // Animación al salir
  },
  // Configuración por categoría
  categories: {
    success: { enabled: true, sound: false },
    error: { enabled: true, sound: false },
    warning: { enabled: true, sound: false },
    info: { enabled: true, sound: false },
    audit: { enabled: true, sound: false }
  }
};

// ============================================
// ESTADO GLOBAL
// ============================================
let notificationConfig = { ...NotificationDefaults };
let activeNotifications = [];
let notificationIdCounter = 0;

// ============================================
// CATEGORÍAS DE NOTIFICACIONES
// ============================================
const NotificationCategories = {
  // Éxito - Operaciones CRUD normales
  SUCCESS: 'success',
  // Error - Fallos técnicos
  ERROR: 'error',
  // Advertencia - Acciones peligrosas
  WARNING: 'warning',
  // Información - Estados del sistema
  INFO: 'info',
  // Auditoría - Eventos sensibles
  AUDIT: 'audit'
};

// ============================================
// MAPEO DE EVENTOS A CATEGORÍAS
// ============================================
const EventCategoryMap = {
  // Comandas
  'comanda_creada': { category: 'success', icon: '📋', label: 'Comanda creada' },
  'comanda_eliminada': { category: 'audit', icon: '🗑️', label: 'Comanda eliminada' },
  'comanda_editada': { category: 'success', icon: '✏️', label: 'Comanda editada' },
  'comanda_status_cambiado': { category: 'info', icon: '🔄', label: 'Estado actualizado' },
  
  // Eliminaciones específicas (ALTO IMPACTO)
  'ELIMINAR_ULTIMA_COMANDA': { category: 'audit', icon: '🗑️', label: 'Última comanda eliminada' },
  'ELIMINAR_TODAS_COMANDAS': { category: 'audit', icon: '🗑️', label: 'Todas las comandas eliminadas' },
  'ELIMINAR_COMANDA_INDIVIDUAL': { category: 'audit', icon: '🗑️', label: 'Comanda eliminada' },
  'ELIMINAR_PLATO_COMANDA': { category: 'audit', icon: '🗑️', label: 'Plato eliminado de comanda' },
  'ELIMINAR_PLATO_RECOGER': { category: 'audit', icon: '🗑️', label: 'Plato para recoger eliminado' },
  
  // Anulaciones (ALTO IMPACTO)
  'PLATO_ANULADO_COCINA': { category: 'audit', icon: '🚫', label: 'Plato anulado' },
  'COMANDA_ANULADA_COCINA': { category: 'audit', icon: '🚫', label: 'Comanda anulada' },
  'INTENTO_ANULACION': { category: 'warning', icon: '⚠️', label: 'Intento de anulación fallido' },
  
  // Reversiones
  'reversion_comanda': { category: 'audit', icon: '↩️', label: 'Comanda revertida' },
  'reversion_plato': { category: 'audit', icon: '↩️', label: 'Plato revertido' },
  
  // Platos
  'plato_agregado': { category: 'success', icon: '➕', label: 'Plato agregado' },
  'plato_modificado': { category: 'success', icon: '✏️', label: 'Plato modificado' },
  'plato_eliminado': { category: 'audit', icon: '🗑️', label: 'Plato eliminado' },
  
  // Mesas
  'mesa_creada': { category: 'success', icon: '🪑', label: 'Mesa creada' },
  'mesa_modificada': { category: 'success', icon: '✏️', label: 'Mesa modificada' },
  'mesa_eliminada': { category: 'audit', icon: '🗑️', label: 'Mesa eliminada' },
  'mesa_estado_cambiado': { category: 'info', icon: '🔄', label: 'Estado de mesa actualizado' },
  
  // Pagos y Bouchers
  'pago_procesado': { category: 'success', icon: '💳', label: 'Pago procesado' },
  'boucher_creado': { category: 'success', icon: '🧾', label: 'Boucher creado' },
  'boucher_anulado': { category: 'audit', icon: '🚫', label: 'Boucher anulado' },
  
  // Cierre de Caja
  'cierre_caja_generado': { category: 'audit', icon: '💰', label: 'Cierre de caja generado' },
  'cierre_caja_reapertura': { category: 'audit', icon: '↩️', label: 'Cierre de caja reabierto' },
  
  // Usuarios y Sesiones
  'usuario_autenticado': { category: 'info', icon: '🔐', label: 'Sesión iniciada' },
  'usuario_desconectado': { category: 'info', icon: '🚪', label: 'Sesión cerrada' },
  'rol_cambiado': { category: 'audit', icon: '🔐', label: 'Rol de usuario modificado' },
  
  // Configuración
  'configuracion_actualizada': { category: 'warning', icon: '⚙️', label: 'Configuración actualizada' },
  
  // Conexión
  'conexion_restaurada': { category: 'info', icon: '🟢', label: 'Conexión restaurada' },
  'conexion_perdida': { category: 'error', icon: '🔴', label: 'Conexión perdida' },
  'websocket_reconectado': { category: 'info', icon: '🟢', label: 'WebSocket reconectado' },
  
  // Errores técnicos
  'error_red': { category: 'error', icon: '❌', label: 'Error de red' },
  'error_servidor': { category: 'error', icon: '❌', label: 'Error del servidor' },
  'error_validacion': { category: 'error', icon: '⚠️', label: 'Error de validación' }
};

// ============================================
// ESTILOS POR CATEGORÍA (con animaciones Sileo)
// ============================================
const CategoryStyles = {
  success: {
    bgClass: 'bg-st-preparado',
    borderClass: 'border-st-preparado/40',
    iconBgClass: 'bg-st-preparado/20',
    textClass: 'text-white',
    progressClass: 'bg-white/30',
    // Animación Sileo-style para success
    enterAnimation: 'toast-success-enter',
    exitAnimation: 'toast-exit'
  },
  error: {
    bgClass: 'bg-st-pagado',
    borderClass: 'border-st-pagado/40',
    iconBgClass: 'bg-st-pagado/20',
    textClass: 'text-white',
    progressClass: 'bg-white/30',
    // Animación Sileo-style con shake para error
    enterAnimation: 'toast-error-enter',
    exitAnimation: 'toast-exit'
  },
  warning: {
    bgClass: 'bg-st-esperando',
    borderClass: 'border-st-esperando/40',
    iconBgClass: 'bg-st-esperando/20',
    textClass: 'text-bg-primary',
    progressClass: 'bg-bg-primary/30',
    // Animación Sileo-style con wobble para warning
    enterAnimation: 'toast-warning-enter',
    exitAnimation: 'toast-exit'
  },
  info: {
    bgClass: 'bg-st-pedido',
    borderClass: 'border-st-pedido/40',
    iconBgClass: 'bg-st-pedido/20',
    textClass: 'text-white',
    progressClass: 'bg-white/30',
    // Animación Sileo-style suave para info
    enterAnimation: 'toast-info-enter',
    exitAnimation: 'toast-exit'
  },
  audit: {
    bgClass: 'bg-bg-card border-2',
    borderClass: 'border-gold',
    iconBgClass: 'bg-gold/20',
    textClass: 'text-white',
    progressClass: 'bg-gold/50',
    // Animación Sileo-style premium con glow para audit
    enterAnimation: 'toast-audit-enter notification-morph-glow',
    exitAnimation: 'toast-exit'
  }
};

// ============================================
// GESTIÓN DE CONFIGURACIÓN
// ============================================

/**
 * Carga la configuración de notificaciones desde localStorage
 */
function loadNotificationConfig() {
  try {
    const saved = localStorage.getItem('gambusinas_notification_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      notificationConfig = { ...NotificationDefaults, ...parsed };
      // Asegurar que categories existe
      if (!notificationConfig.categories) {
        notificationConfig.categories = { ...NotificationDefaults.categories };
      }
    }
  } catch (e) {
    console.warn('Error cargando configuración de notificaciones:', e);
  }
  return notificationConfig;
}

/**
 * Guarda la configuración de notificaciones en localStorage
 */
function saveNotificationConfig(config) {
  try {
    notificationConfig = { ...notificationConfig, ...config };
    localStorage.setItem('gambusinas_notification_config', JSON.stringify(notificationConfig));
    return true;
  } catch (e) {
    console.error('Error guardando configuración de notificaciones:', e);
    return false;
  }
}

/**
 * Obtiene la configuración actual
 */
function getNotificationConfig() {
  return { ...notificationConfig };
}

// ============================================
// CREACIÓN DEL CONTAINER
// ============================================

/**
 * Obtiene o crea el container de notificaciones
 */
function getOrCreateContainer() {
  let container = document.getElementById('notification-container');
  
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
    
    // Posicionamiento según configuración
    const positionClasses = {
      'top-right': 'top-4 right-4',
      'top-left': 'top-4 left-4',
      'bottom-right': 'bottom-4 right-4',
      'bottom-left': 'bottom-4 left-4',
      'top-center': 'top-4 left-1/2 -translate-x-1/2',
      'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2'
    };
    
    container.className = `fixed ${positionClasses[notificationConfig.position] || 'bottom-4 right-4'} z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm w-full`;
    document.body.appendChild(container);
  }
  
  return container;
}

// ============================================
// CREACIÓN DE NOTIFICACIÓN
// ============================================

/**
 * Crea una notificación
 * @param {Object} options - Opciones de la notificación
 * @returns {Object} - Notificación creada
 */
function createNotification(options) {
  const {
    category = 'info',
    title = '',
    message = '',
    icon = null,
    duration = null,
    action = null, // { label, onClick }
    auditLink = null, // Para notificaciones de auditoría: { entityType, entityId }
    showNow = true
  } = options;
  
  // Verificar si la categoría está habilitada
  if (notificationConfig.categories && 
      notificationConfig.categories[category] && 
      !notificationConfig.categories[category].enabled) {
    console.log(`Notificación de categoría '${category}' deshabilitada`);
    return null;
  }
  
  const id = ++notificationIdCounter;
  const actualDuration = duration || notificationConfig.duration[category] || 4000;
  const styles = CategoryStyles[category] || CategoryStyles.info;
  
  // Determinar icono
  const displayIcon = icon || getDefaultIcon(category);
  
  const notification = {
    id,
    category,
    title,
    message,
    icon: displayIcon,
    duration: actualDuration,
    action,
    auditLink,
    createdAt: Date.now(),
    element: null,
    timeout: null,
    paused: false,
    remainingTime: actualDuration
  };
  
  if (showNow) {
    showNotification(notification);
  }
  
  return notification;
}

/**
 * Obtiene el icono por defecto para una categoría
 */
function getDefaultIcon(category) {
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
    audit: '🔍'
  };
  return icons[category] || 'ℹ';
}

// ============================================
// MOSTRAR NOTIFICACIÓN
// ============================================

/**
 * Muestra una notificación en el DOM
 */
function showNotification(notification) {
  const container = getOrCreateContainer();
  const styles = CategoryStyles[notification.category] || CategoryStyles.info;
  
  // Determinar animación de entrada basada en posición (Sileo-style)
  const position = notificationConfig.position;
  let positionAnimation = '';
  
  if (position.includes('top')) {
    positionAnimation = position.includes('center') ? 'toast-enter-center' : 'toast-enter-top';
  } else if (position.includes('bottom')) {
    positionAnimation = position.includes('center') ? 'toast-enter-center' : 'toast-enter-bottom';
  }
  
  // Combinar animación de categoría con animación de posición
  const enterAnimation = styles.enterAnimation || 'toast-enter';
  const finalEnterAnimation = positionAnimation || enterAnimation;
  
  // Crear elemento
  const el = document.createElement('div');
  el.id = `notification-${notification.id}`;
  el.className = `
    notification-toast pointer-events-auto
    ${styles.bgClass} ${styles.borderClass} ${styles.textClass}
    rounded-xl shadow-2xl overflow-hidden
    transform translate-x-full opacity-0
    transition-all duration-500 ease-out
    border toast-ripple ${notification.category === 'audit' ? 'shadow-gold/20 shadow-lg' : ''}
  `.trim().replace(/\s+/g, ' ');
  
  // Contenido HTML con animaciones Sileo
  el.innerHTML = `
    <div class="p-4 flex items-start gap-3">
      <!-- Icono con animación bounce -->
      <div class="${styles.iconBgClass} w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 toast-icon-bounce">
        ${notification.icon}
      </div>
      
      <!-- Contenido -->
      <div class="flex-1 min-w-0">
        ${notification.title ? `<p class="font-semibold text-sm">${notification.title}</p>` : ''}
        ${notification.message ? `<p class="text-xs opacity-90 mt-0.5">${notification.message}</p>` : ''}
        
        <!-- Acción o enlace de auditoría -->
        ${notification.action ? `
          <button class="notification-action mt-2 text-xs font-medium underline hover:no-underline opacity-80 hover:opacity-100 transition">
            ${notification.action.label}
          </button>
        ` : ''}
        
        ${notification.auditLink ? `
          <button class="notification-audit-link mt-2 text-xs font-medium text-gold hover:underline flex items-center gap-1">
            <span>Ver en Auditoría</span>
            <span>→</span>
          </button>
        ` : ''}
      </div>
      
      <!-- Botón cerrar con animación -->
      ${notificationConfig.showCloseButton ? `
        <button class="notification-close notification-close-animated w-6 h-6 rounded-lg hover:bg-white/10 flex items-center justify-center text-sm opacity-60 hover:opacity-100 transition flex-shrink-0">
          ✕
        </button>
      ` : ''}
    </div>
    
    <!-- Barra de progreso con shimmer -->
    ${notificationConfig.showProgressBar ? `
      <div class="h-1 bg-white/10">
        <div class="notification-progress notification-progress-animated ${styles.progressClass} h-full transition-all ease-linear" style="width: 100%"></div>
      </div>
    ` : ''}
  `;
  
  // Event listeners
  const closeBtn = el.querySelector('.notification-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissNotification(notification.id);
    });
  }
  
  const actionBtn = el.querySelector('.notification-action');
  if (actionBtn && notification.action) {
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (notification.action.onClick) {
        notification.action.onClick();
      }
      dismissNotification(notification.id);
    });
  }
  
  const auditLinkBtn = el.querySelector('.notification-audit-link');
  if (auditLinkBtn && notification.auditLink) {
    auditLinkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToAudit(notification.auditLink);
      dismissNotification(notification.id);
    });
  }
  
  // Pausar en hover
  if (notificationConfig.pauseOnHover) {
    el.addEventListener('mouseenter', () => pauseNotification(notification.id));
    el.addEventListener('mouseleave', () => resumeNotification(notification.id));
  }
  
  // Agregar al container
  container.appendChild(el);
  notification.element = el;
  
  // Limitar notificaciones visibles
  while (activeNotifications.length >= notificationConfig.maxVisible) {
    const oldest = activeNotifications[0];
    dismissNotification(oldest.id);
  }
  
  activeNotifications.push(notification);
  
  // Animar entrada con spring physics (Sileo-style)
  requestAnimationFrame(() => {
    el.classList.remove('translate-x-full', 'opacity-0');
    el.classList.add(finalEnterAnimation);
  });
  
  // Auto-dismiss
  if (notification.duration > 0) {
    startNotificationTimer(notification);
  }
  
  return notification;
}

// ============================================
// TIMERS Y ANIMACIONES
// ============================================

/**
 * Inicia el timer de auto-dismiss
 */
function startNotificationTimer(notification) {
  if (notification.timeout) {
    clearTimeout(notification.timeout);
  }
  
  const startTime = Date.now();
  const duration = notification.remainingTime;
  
  // Animar barra de progreso
  const progressEl = notification.element?.querySelector('.notification-progress');
  if (progressEl) {
    progressEl.style.transition = `width ${duration}ms linear`;
    progressEl.style.width = '0%';
  }
  
  notification.timeout = setTimeout(() => {
    dismissNotification(notification.id);
  }, duration);
}

/**
 * Pausa una notificación
 */
function pauseNotification(id) {
  const notification = activeNotifications.find(n => n.id === id);
  if (!notification || notification.paused) return;
  
  notification.paused = true;
  
  if (notification.timeout) {
    clearTimeout(notification.timeout);
    notification.timeout = null;
  }
  
  // Calcular tiempo restante
  notification.remainingTime = notification.remainingTime - (Date.now() - notification.createdAt);
  
  // Pausar animación de progreso
  const progressEl = notification.element?.querySelector('.notification-progress');
  if (progressEl) {
    const currentWidth = progressEl.offsetWidth;
    const containerWidth = progressEl.parentElement.offsetWidth;
    const percent = (currentWidth / containerWidth) * 100;
    progressEl.style.transition = 'none';
    progressEl.style.width = `${percent}%`;
  }
}

/**
 * Reanuda una notificación
 */
function resumeNotification(id) {
  const notification = activeNotifications.find(n => n.id === id);
  if (!notification || !notification.paused) return;
  
  notification.paused = false;
  notification.createdAt = Date.now();
  
  startNotificationTimer(notification);
}

// ============================================
// DISMISS
// ============================================

/**
 * Descarta una notificación
 */
function dismissNotification(id) {
  const index = activeNotifications.findIndex(n => n.id === id);
  if (index === -1) return;
  
  const notification = activeNotifications[index];
  const styles = CategoryStyles[notification.category] || CategoryStyles.info;
  
  if (notification.timeout) {
    clearTimeout(notification.timeout);
  }
  
  // Animar salida con spring physics (Sileo-style)
  if (notification.element) {
    // Remover animación de entrada
    notification.element.classList.remove(
      'toast-enter', 'toast-success-enter', 'toast-error-enter', 
      'toast-warning-enter', 'toast-info-enter', 'toast-audit-enter',
      'toast-enter-top', 'toast-enter-bottom', 'toast-enter-left', 'toast-enter-center',
      'translate-x-0', 'opacity-100', 'notification-morph-glow'
    );
    
    // Aplicar animación de salida
    const exitAnimation = styles.exitAnimation || 'toast-exit';
    notification.element.classList.add(exitAnimation);
    
    setTimeout(() => {
      notification.element?.remove();
    }, 400);
  }
  
  activeNotifications.splice(index, 1);
}

/**
 * Descarta todas las notificaciones
 */
function dismissAllNotifications() {
  activeNotifications.forEach(n => dismissNotification(n.id));
}

// ============================================
// NAVEGACIÓN A AUDITORÍA
// ============================================

/**
 * Navega a la página de auditoría con filtros
 */
function navigateToAudit(auditLink) {
  if (!auditLink) return;
  
  const { entityType, entityId, action } = auditLink;
  let url = '/auditoria.html?';
  
  if (entityId) {
    url += `id=${entityId}`;
  }
  if (action) {
    url += `&accion=${encodeURIComponent(action)}`;
  }
  
  window.location.href = url;
}

// ============================================
// API PÚBLICA - MÉTODOS DE CONVENIENCIA
// ============================================

/**
 * Muestra una notificación de éxito
 */
function notifySuccess(title, message = '', options = {}) {
  return createNotification({ category: 'success', title, message, ...options });
}

/**
 * Muestra una notificación de error
 */
function notifyError(title, message = '', options = {}) {
  return createNotification({ category: 'error', title, message, ...options });
}

/**
 * Muestra una notificación de advertencia
 */
function notifyWarning(title, message = '', options = {}) {
  return createNotification({ category: 'warning', title, message, ...options });
}

/**
 * Muestra una notificación informativa
 */
function notifyInfo(title, message = '', options = {}) {
  return createNotification({ category: 'info', title, message, ...options });
}

/**
 * Muestra una notificación de auditoría
 */
function notifyAudit(options) {
  const { 
    eventType, 
    title, 
    message, 
    entityId, 
    entityType, 
    entityName,
    usuario,
    showLink = true 
  } = options;
  
  // Obtener info del tipo de evento
  const eventInfo = EventCategoryMap[eventType] || { icon: '🔍', label: eventType };
  
  const notificationOptions = {
    category: 'audit',
    title: title || eventInfo.label,
    message: message || (entityName ? `Entidad: ${entityName}` : ''),
    icon: eventInfo.icon,
    duration: notificationConfig.duration.audit
  };
  
  // Agregar enlace a auditoría si está habilitado
  if (showLink && entityId) {
    notificationOptions.auditLink = {
      entityId,
      entityType,
      action: eventType
    };
  }
  
  return createNotification(notificationOptions);
}

/**
 * Notificación desde respuesta de API
 */
function notifyFromResponse(response, fallbackTitle = 'Operación completada') {
  if (!response) {
    notifyError('Sin respuesta del servidor');
    return null;
  }
  
  if (response.success) {
    // Verificar si es una acción de auditoría
    if (response.auditEvent) {
      return notifyAudit({
        eventType: response.auditEvent,
        entityId: response.entityId,
        entityType: response.entityType,
        entityName: response.entityName,
        title: response.message || fallbackTitle
      });
    }
    
    return notifySuccess(response.message || fallbackTitle);
  }
  
  if (response.error || response.message) {
    return notifyError(response.error || response.message);
  }
  
  return null;
}

/**
 * Notificación de error de red
 */
function notifyNetworkError(error) {
  return notifyError(
    'Error de conexión',
    error?.message || 'No se pudo conectar con el servidor'
  );
}

// ============================================
// HELPER PARA DETERMINAR CATEGORÍA
// ============================================

/**
 * Determina la categoría de notificación basándose en el evento
 */
function determineCategory(eventType, response) {
  // Buscar en el mapa de eventos
  if (EventCategoryMap[eventType]) {
    return EventCategoryMap[eventType].category;
  }
  
  // Heurísticas basadas en el tipo de evento
  const eventTypeLower = eventType.toLowerCase();
  
  if (eventTypeLower.includes('elimin') || eventTypeLower.includes('anulad')) {
    return 'audit';
  }
  if (eventTypeLower.includes('error') || eventTypeLower.includes('fail')) {
    return 'error';
  }
  if (eventTypeLower.includes('warning') || eventTypeLower.includes('peligro')) {
    return 'warning';
  }
  if (eventTypeLower.includes('cread') || eventTypeLower.includes('agregad') || eventTypeLower.includes('actualizad')) {
    return 'success';
  }
  
  // Basarse en el status de la respuesta
  if (response) {
    if (response.success === false) return 'error';
    if (response.success === true) return 'success';
  }
  
  return 'info';
}

// ============================================
// INICIALIZACIÓN
// ============================================

/**
 * Inicializa el sistema de notificaciones
 */
function initNotifications() {
  loadNotificationConfig();
  getOrCreateContainer();
  console.log('✅ Sistema de notificaciones inicializado');
}

// ============================================
// EXPORTAR GLOBALMENTE
// ============================================

window.GambusinasNotifications = {
  // Métodos de conveniencia
  success: notifySuccess,
  error: notifyError,
  warning: notifyWarning,
  info: notifyInfo,
  audit: notifyAudit,
  
  // Métodos principales
  create: createNotification,
  dismiss: dismissNotification,
  dismissAll: dismissAllNotifications,
  
  // Helpers de respuesta
  fromResponse: notifyFromResponse,
  networkError: notifyNetworkError,
  
  // Configuración
  loadConfig: loadNotificationConfig,
  saveConfig: saveNotificationConfig,
  getConfig: getNotificationConfig,
  
  // Categorías
  Categories: NotificationCategories,
  
  // Utilidades
  determineCategory,
  EventCategoryMap,
  
  // Inicialización
  init: initNotifications
};

// Auto-inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotifications);
} else {
  initNotifications();
}
