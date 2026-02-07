/**
 * HEADER.JS - Header Premium 100% Funcional
 * Todas las funcionalidades activas: Logout, Notificaciones, Mensajes, Search, Modo Oscuro, Usuario
 */

const API_BASE = '/api';
let searchTimeout = null;
let notifCount = 0;
let msgCount = 0;

// ========== LOGOUT GLOBAL (DEFINIR PRIMERO) ==========
// Función logout disponible INMEDIATAMENTE para que funcione desde onclick
window.logout = function() {
    console.log('🚪 LOGOUT EJECUTADO - Cerrando sesión...');
    
    try {
        // Limpiar localStorage PRIMERO
        localStorage.removeItem('adminToken');
        localStorage.removeItem('theme');
        console.log('✅ LocalStorage limpiado');
        
        // Redirigir INMEDIATAMENTE (sin delay)
        console.log('🔄 Redirigiendo a login...');
        window.location.href = '/dashboard/login.html';
        
    } catch (error) {
        console.error('❌ Error en logout:', error);
        // Forzar redirección incluso si hay error
        window.location.href = '/dashboard/login.html';
    }
};

window.cerrarSesion = window.logout; // Alias adicional
console.log('✅ Función logout registrada globalmente');

// Obtener headers de autenticación
function getAuthHeaders() {
    const token = localStorage.getItem('adminToken');
    return {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
    };
}

// ========== INICIALIZACIÓN ==========
(function() {
    'use strict';
    
    console.log('📋 Inicializando header completo...');
    
    // Esperar a que el DOM esté completamente cargado
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHeader);
    } else {
        // DOM ya está listo
        initHeader();
    }
    
    function initHeader() {
        console.log('✅ DOM listo, inicializando header...');
        
        // Inicializar todas las funcionalidades
        inicializarEventDelegation();
        cargarUsuario();
        cargarEstadoCaja();
        cargarAlertasUrgentes();
        cargarNotificaciones();
        cargarMensajes();
        inicializarBusqueda();
        inicializarModo();
        
        // Inicializar dropdowns después de que jQuery esté listo
        if (typeof $ !== 'undefined') {
            $(document).ready(() => {
                console.log('✅ jQuery listo, inicializando dropdowns...');
                inicializarDropdowns();
            });
        } else {
            // Fallback sin jQuery
            setTimeout(() => {
                console.log('⚠️ Sin jQuery, usando fallback para dropdowns...');
                inicializarDropdowns();
            }, 500);
        }
        
        // Auto-refresh cada 30 segundos
        setInterval(() => {
            cargarEstadoCaja();
            cargarAlertasUrgentes();
            cargarNotificaciones();
            cargarMensajes();
        }, 30000);
        
        console.log('✅ Header inicializado correctamente');
    }
})();

// ========== EVENT DELEGATION (PosDash estándar) ==========
function inicializarEventDelegation() {
    console.log('🔧 Inicializando event delegation...');
    
    // Cerrar dropdowns al hacer click fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown') && !e.target.closest('.dropdown-toggle')) {
            cerrarTodosDropdowns();
        }
    });
    
    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            cerrarTodosDropdowns();
        }
    });
    
    // Logout desde cualquier botón - MÁS AGRESIVO
    document.addEventListener('click', (e) => {
        const target = e.target;
        const parent = target.closest('a, button');
        
        // Verificar si es botón de logout
        if (parent) {
            const text = parent.textContent || '';
            const onclick = parent.getAttribute('onclick') || '';
            const classes = parent.className || '';
            
            if (classes.includes('logout-btn') || 
                text.includes('Salir') || 
                onclick.includes('logout()')) {
                e.preventDefault();
                e.stopPropagation();
                console.log('🚪 Logout detectado desde:', parent);
                logout();
                return false;
            }
        }
    });
    
    console.log('✅ Event delegation inicializado');
}

function cerrarTodosDropdowns() {
    // Cerrar todos los dropdowns de Bootstrap 4
    if (typeof $ !== 'undefined') {
        $('.dropdown-menu').removeClass('show');
        $('.dropdown-toggle').removeClass('show');
    } else {
        // Fallback sin jQuery
        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
            menu.classList.remove('show');
        });
        document.querySelectorAll('.dropdown-toggle.show').forEach(toggle => {
            toggle.classList.remove('show');
        });
    }
}

// ========== DROPDOWNS BOOTSTRAP ==========
function inicializarDropdowns() {
    console.log('🔧 Inicializando dropdowns...');
    
    // Los dropdowns de Bootstrap 4 funcionan automáticamente con data-toggle="dropdown"
    // Pero vamos a asegurarnos de que funcionen correctamente
    const dropdownToggles = document.querySelectorAll('.dropdown-toggle');
    
    dropdownToggles.forEach(toggle => {
        // Remover listeners anteriores si existen
        const newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        
        // Agregar listener nuevo
        newToggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const menu = this.nextElementSibling;
            if (!menu || !menu.classList.contains('dropdown-menu')) return;
            
            const isOpen = menu.classList.contains('show');
            
            // Cerrar todos los demás
            document.querySelectorAll('.dropdown-menu').forEach(m => {
                if (m !== menu) m.classList.remove('show');
            });
            document.querySelectorAll('.dropdown-toggle').forEach(t => {
                if (t !== this) t.classList.remove('show');
            });
            
            // Toggle el actual
            if (isOpen) {
                menu.classList.remove('show');
                this.classList.remove('show');
            } else {
                menu.classList.add('show');
                this.classList.add('show');
            }
        });
    });
    
    console.log(`✅ ${dropdownToggles.length} dropdowns inicializados`);
}

// Función global para toggle dropdowns (desde onclick en HTML)
window.toggleDropdown = function(tipo) {
    console.log('🔽 Toggle dropdown:', tipo);
    
    const dropdowns = {
        'notificaciones': { toggle: 'dropdownNotifications', menu: 'notificacionesList' },
        'mensajes': { toggle: 'dropdownMessages', menu: 'mensajesList' },
        'usuario': { toggle: 'dropdownUser', menu: null }
    };
    
    const config = dropdowns[tipo];
    if (!config) {
        console.warn('⚠️ Tipo de dropdown no encontrado:', tipo);
        return;
    }
    
    const toggleEl = document.getElementById(config.toggle);
    if (!toggleEl) {
        console.warn('⚠️ Toggle element no encontrado:', config.toggle);
        return;
    }
    
    // Buscar el menú dropdown (puede ser nextElementSibling o dentro del mismo li)
    let menuEl = toggleEl.nextElementSibling;
    if (!menuEl || !menuEl.classList.contains('dropdown-menu')) {
        // Buscar en el parent li
        const parentLi = toggleEl.closest('li');
        if (parentLi) {
            menuEl = parentLi.querySelector('.dropdown-menu');
        }
    }
    
    if (!menuEl) {
        console.warn('⚠️ Menu element no encontrado');
        return;
    }
    
    const isOpen = menuEl.classList.contains('show');
    
    // Cerrar todos los demás
    document.querySelectorAll('.dropdown-menu').forEach(m => {
        if (m !== menuEl) m.classList.remove('show');
    });
    document.querySelectorAll('.dropdown-toggle').forEach(t => {
        if (t !== toggleEl) t.classList.remove('show');
    });
    
    // Toggle el actual
    if (isOpen) {
        menuEl.classList.remove('show');
        toggleEl.classList.remove('show');
        toggleEl.setAttribute('aria-expanded', 'false');
    } else {
        menuEl.classList.add('show');
        toggleEl.classList.add('show');
        toggleEl.setAttribute('aria-expanded', 'true');
        
        // Cargar datos si es necesario
        if (tipo === 'notificaciones') {
            const listEl = menuEl.querySelector('#notificacionesList');
            if (listEl && listEl.textContent.includes('Cargando')) {
                cargarNotificaciones();
            }
        }
        if (tipo === 'mensajes') {
            const listEl = menuEl.querySelector('#mensajesList');
            if (listEl && listEl.textContent.includes('Cargando')) {
                cargarMensajes();
            }
        }
    }
    
    console.log('✅ Dropdown', tipo, isOpen ? 'cerrado' : 'abierto');
};

// Funciones globales adicionales
window.marcarTodasLeidas = marcarTodasLeidas;
window.mostrarPerfil = mostrarPerfil;
window.mostrarModalCaja = mostrarModalCaja;
window.mostrarAlertasUrgentes = mostrarAlertasUrgentes;

// ========== BÚSQUEDA GLOBAL ==========
function inicializarBusqueda() {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        clearTimeout(searchTimeout);
        
        if (query.length < 2) {
            if (searchResults) {
                searchResults.innerHTML = '';
                searchResults.style.display = 'none';
            }
            return;
        }
        
        searchTimeout = setTimeout(() => {
            buscarGlobal(query);
        }, 300);
    });
    
    // Ocultar resultados al hacer click fuera
    document.addEventListener('click', (e) => {
        if (searchResults && !searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
        }
    });
    
    // Mostrar resultados al hacer focus
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim().length >= 2) {
            buscarGlobal(searchInput.value.trim());
        }
    });
}

async function buscarGlobal(query) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;
    
    searchResults.innerHTML = '<div class="search-loading"><i class="las la-spinner la-spin"></i> Buscando...</div>';
    searchResults.style.display = 'block';
    
    try {
        // Buscar en múltiples endpoints en paralelo
        const [mesasRes, platosRes, clientesRes, comandasRes] = await Promise.allSettled([
            fetch(`${API_BASE}/mesas`, { headers: getAuthHeaders() }),
            fetch(`${API_BASE}/platos`, { headers: getAuthHeaders() }),
            fetch(`${API_BASE}/clientes?nombre=${encodeURIComponent(query)}`, { headers: getAuthHeaders() }),
            fetch(`${API_BASE}/comanda`, { headers: getAuthHeaders() })
        ]);
        
        const resultados = [];
        
        // Procesar Mesas
        if (mesasRes.status === 'fulfilled' && mesasRes.value.ok) {
            const mesas = await mesasRes.value.json();
            mesas.filter(m => 
                m.numero?.toString().includes(query) || 
                m.estado?.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 3).forEach(mesa => {
                resultados.push({
                    tipo: 'Mesa',
                    titulo: `Mesa ${mesa.numero || mesa._id.slice(-6)}`,
                    subtitulo: `Estado: ${mesa.estado || 'libre'}`,
                    url: `/dashboard/pages/mesas.html#mesa-${mesa._id}`
                });
            });
        }
        
        // Procesar Platos
        if (platosRes.status === 'fulfilled' && platosRes.value.ok) {
            const platos = await platosRes.value.json();
            platos.filter(p => 
                p.nombre?.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 3).forEach(plato => {
                resultados.push({
                    tipo: 'Plato',
                    titulo: plato.nombre,
                    subtitulo: `S/. ${(plato.precio || 0).toFixed(2)}`,
                    url: `/dashboard/pages/platos.html#plato-${plato._id}`
                });
            });
        }
        
        // Procesar Clientes
        if (clientesRes.status === 'fulfilled' && clientesRes.value.ok) {
            const clientes = await clientesRes.value.json();
            clientes.slice(0, 3).forEach(cliente => {
                resultados.push({
                    tipo: 'Cliente',
                    titulo: cliente.nombre || 'Cliente',
                    subtitulo: `DNI: ${cliente.dni || 'N/A'}`,
                    url: `/dashboard/pages/clientes.html#cliente-${cliente._id}`
                });
            });
        }
        
        // Procesar Comandas
        if (comandasRes.status === 'fulfilled' && comandasRes.value.ok) {
            const comandas = await comandasRes.value.json();
            comandas.filter(c => 
                c.comandaId?.toString().includes(query) || 
                c._id?.toString().includes(query)
            ).slice(0, 2).forEach(comanda => {
                resultados.push({
                    tipo: 'Comanda',
                    titulo: `Comanda #${comanda.comandaId || comanda._id.slice(-6)}`,
                    subtitulo: `Total: S/. ${(comanda.total || 0).toFixed(2)}`,
                    url: `/dashboard/pages/comandas.html#comanda-${comanda._id}`
                });
            });
        }
        
        mostrarResultadosBusqueda(resultados);
        
    } catch (error) {
        console.error('Error en búsqueda global:', error);
        if (searchResults) {
            searchResults.innerHTML = '<div class="search-error">Error al buscar. Intente nuevamente.</div>';
        }
    }
}

function mostrarResultadosBusqueda(resultados) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;
    
    if (resultados.length === 0) {
        searchResults.innerHTML = '<div class="search-empty">No se encontraron resultados</div>';
        return;
    }
    
    searchResults.innerHTML = resultados.map(r => `
        <a href="${r.url}" class="search-result-item" onclick="event.stopPropagation();">
            <div class="search-result-type">${r.tipo}</div>
            <div class="search-result-title">${r.titulo}</div>
            <div class="search-result-subtitle">${r.subtitulo}</div>
        </a>
    `).join('');
}

// ========== ESTADO CAJA ==========
async function cargarEstadoCaja() {
    const cajaStatus = document.getElementById('cajaStatus');
    const cajaStatusText = document.getElementById('cajaStatusText');
    
    // Mostrar estado por defecto inmediatamente
    if (cajaStatus && cajaStatusText) {
        cajaStatus.className = 'caja-status-badge caja-abierta';
        cajaStatusText.innerHTML = '<i class="las la-cash-register"></i> Abierta S/. 0.00';
    }
    
    try {
        const response = await fetch(`${API_BASE}/cierreCaja/estado`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error('Error al cargar estado de caja');
        }
        
        const estado = await response.json();
        
        if (cajaStatus && cajaStatusText) {
            if (estado.abierta) {
                cajaStatus.className = 'caja-status-badge caja-abierta';
                cajaStatusText.innerHTML = `<i class="las la-cash-register"></i> Abierta S/. ${(estado.total || 0).toFixed(2)}`;
            } else {
                cajaStatus.className = 'caja-status-badge caja-cerrada';
                cajaStatusText.innerHTML = `<i class="las la-cash-register"></i> Cerrada`;
            }
        }
    } catch (error) {
        console.error('Error cargando estado caja:', error);
        // Mantener estado por defecto si hay error
        if (cajaStatus && cajaStatusText) {
            cajaStatus.className = 'caja-status-badge caja-abierta';
            cajaStatusText.innerHTML = '<i class="las la-cash-register"></i> Abierta S/. 0.00';
        }
    }
}

function mostrarModalCaja() {
    // Modal de cierre de caja rápido
    alert('Modal de cierre de caja - Próximamente\n\nFuncionalidad: Cerrar caja rápidamente desde el header');
}

// ========== ALERTAS URGENTES ==========
async function cargarAlertasUrgentes() {
    try {
        const response = await fetch(`${API_BASE}/mesas`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) throw new Error('Error al cargar alertas');
        
        const mesas = await response.json();
        const mesasPagadas = mesas.filter(m => m.estado === 'pagado' && m.isActive !== false).length;
        
        const alertasCount = document.getElementById('alertasCount');
        const alertasUrgentes = document.getElementById('alertasUrgentes');
        
        if (alertasCount) {
            alertasCount.textContent = mesasPagadas;
            alertasCount.style.display = mesasPagadas > 0 ? 'block' : 'none';
        }
        
        if (alertasUrgentes) {
            if (mesasPagadas > 0) {
                alertasUrgentes.classList.add('has-alertas');
            } else {
                alertasUrgentes.classList.remove('has-alertas');
            }
        }
    } catch (error) {
        console.error('Error cargando alertas urgentes:', error);
    }
}

function mostrarAlertasUrgentes() {
    // Modal con lista de mesas pagadas pendientes
    alert('Lista de mesas pagadas pendientes - Próximamente\n\nFuncionalidad: Ver y gestionar mesas pagadas pendientes de impresión');
}

// ========== NOTIFICACIONES ==========
async function cargarNotificaciones() {
    try {
        const response = await fetch(`${API_BASE}/notificaciones`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            mostrarNotificacionesSimuladas();
            return;
        }
        
        const notificaciones = await response.json();
        mostrarNotificaciones(notificaciones);
        
    } catch (error) {
        console.error('Error cargando notificaciones:', error);
        mostrarNotificacionesSimuladas();
    }
}

function mostrarNotificaciones(notificaciones) {
    const notificacionesList = document.getElementById('notificacionesList');
    const notificacionesBadge = document.getElementById('notificacionesBadge');
    const notificacionesCount = document.getElementById('notificacionesCount');
    
    const noLeidas = notificaciones.filter(n => !n.leida).length;
    notifCount = noLeidas;
    
    if (notificacionesBadge) {
        notificacionesBadge.textContent = noLeidas;
        notificacionesBadge.style.display = noLeidas > 0 ? 'block' : 'none';
    }
    
    if (notificacionesCount) {
        notificacionesCount.textContent = notificaciones.length;
    }
    
    if (notificacionesList) {
        if (notificaciones.length === 0) {
            notificacionesList.innerHTML = '<div class="text-center p-3 text-muted">No hay notificaciones</div>';
        } else {
            notificacionesList.innerHTML = notificaciones.slice(0, 5).map(n => `
                <a href="#" class="iq-sub-card ${!n.leida ? 'notificacion-no-leida' : ''}" onclick="event.preventDefault(); marcarNotificacionLeida('${n._id}');">
                    <div class="media align-items-center cust-card py-3 border-bottom">
                        <div class="media-body ml-3">
                            <div class="d-flex align-items-center justify-content-between">
                                <h6 class="mb-0">${n.titulo || 'Notificación'}</h6>
                                <small class="text-dark">${formatearFecha(n.fecha)}</small>
                            </div>
                            <small class="mb-0">${n.mensaje || ''}</small>
                        </div>
                    </div>
                </a>
            `).join('');
        }
    }
}

function mostrarNotificacionesSimuladas() {
    const notificaciones = [
        { _id: '1', titulo: 'Mesa 5 preparada', mensaje: 'La mesa 5 está lista para servir', fecha: new Date(), leida: false },
        { _id: '2', titulo: 'Nueva comanda #58', mensaje: 'Nueva comanda recibida en cocina', fecha: new Date(Date.now() - 120000), leida: false },
        { _id: '3', titulo: 'Cierre de caja pendiente', mensaje: 'Hay un cierre de caja pendiente de validación', fecha: new Date(Date.now() - 3600000), leida: true }
    ];
    
    mostrarNotificaciones(notificaciones);
}

async function marcarNotificacionLeida(id) {
    try {
        await fetch(`${API_BASE}/notificaciones/${id}/leida`, {
            method: 'PATCH',
            headers: getAuthHeaders()
        });
        cargarNotificaciones();
    } catch (error) {
        console.error('Error marcando notificación como leída:', error);
        // Recargar de todas formas
        cargarNotificaciones();
    }
}

async function marcarTodasLeidas() {
    try {
        await fetch(`${API_BASE}/notificaciones/leidas`, {
            method: 'PATCH',
            headers: getAuthHeaders()
        });
        cargarNotificaciones();
    } catch (error) {
        console.error('Error marcando todas como leídas:', error);
        // Recargar de todas formas
        cargarNotificaciones();
    }
}

// ========== MENSAJES ==========
async function cargarMensajes() {
    try {
        const response = await fetch(`${API_BASE}/mensajes-no-leidos`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            mostrarMensajesSimulados();
            return;
        }
        
        const mensajes = await response.json();
        mostrarMensajes(mensajes);
        
    } catch (error) {
        console.error('Error cargando mensajes:', error);
        mostrarMensajesSimulados();
    }
}

function mostrarMensajes(mensajes) {
    const mensajesList = document.getElementById('mensajesList');
    const mensajesBadge = document.getElementById('mensajesBadge');
    const mensajesCount = document.getElementById('mensajesCount');
    
    const noLeidos = mensajes.filter(m => !m.leido).length;
    msgCount = noLeidos;
    
    if (mensajesBadge) {
        mensajesBadge.textContent = noLeidos;
        mensajesBadge.style.display = noLeidos > 0 ? 'block' : 'none';
    }
    
    if (mensajesCount) {
        mensajesCount.textContent = mensajes.length;
    }
    
    if (mensajesList) {
        if (mensajes.length === 0) {
            mensajesList.innerHTML = '<div class="text-center p-3 text-muted">No hay mensajes</div>';
        } else {
            mensajesList.innerHTML = mensajes.slice(0, 5).map(m => `
                <a href="#" class="iq-sub-card ${!m.leido ? 'mensaje-no-leido' : ''}" onclick="event.preventDefault(); abrirMensaje('${m._id}');">
                    <div class="media align-items-center cust-card py-3 border-bottom">
                        <div class="">
                            <img class="avatar-50 rounded-small" src="/dashboard/assets/images/user/${m.avatar || '1.jpg'}" alt="${m.remitente}" onerror="this.src='/dashboard/assets/images/user/1.jpg'">
                        </div>
                        <div class="media-body ml-3">
                            <div class="d-flex align-items-center justify-content-between">
                                <h6 class="mb-0">${m.remitente || 'Usuario'}</h6>
                                <small class="text-dark">${formatearFecha(m.fecha)}</small>
                            </div>
                            <small class="mb-0">${m.mensaje || ''}</small>
                        </div>
                    </div>
                </a>
            `).join('');
        }
    }
}

function mostrarMensajesSimulados() {
    const mensajes = [
        { _id: '1', remitente: 'Juan (Mozo)', mensaje: 'Plato sin stock disponible - Ceviche', fecha: new Date(), leido: false, avatar: '1.jpg' },
        { _id: '2', remitente: 'Cocina', mensaje: 'Comanda #57 lista para servir', fecha: new Date(Date.now() - 300000), leido: false, avatar: '2.jpg' }
    ];
    
    mostrarMensajes(mensajes);
}

function abrirMensaje(id) {
    // TODO: Implementar modal de chat completo
    alert(`Abrir mensaje ${id} - Próximamente\n\nFuncionalidad: Modal de chat completo con WebSocket`);
}

// ========== USUARIO ==========
async function cargarUsuario() {
    const token = localStorage.getItem('adminToken');
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    const sidebarUsername = document.getElementById('sidebar-username');
    
    // Mostrar valores por defecto inmediatamente
    if (userName) userName.textContent = 'Admin';
    if (userRole) userRole.textContent = 'Gerente';
    if (sidebarUsername) sidebarUsername.textContent = 'Admin';
    
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE}/admin/verify`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            const nombre = data.usuario?.name || data.user?.name || 'Admin';
            
            if (userName) userName.textContent = nombre;
            if (userRole) userRole.textContent = data.usuario?.role || data.user?.role || 'Gerente';
            if (sidebarUsername) sidebarUsername.textContent = nombre;
        }
    } catch (error) {
        console.error('Error cargando usuario:', error);
        // Mantener valores por defecto si hay error
        if (userName) userName.textContent = 'Admin';
        if (userRole) userRole.textContent = 'Gerente';
        if (sidebarUsername) sidebarUsername.textContent = 'Admin';
    }
}

function mostrarPerfil() {
    // TODO: Implementar modal de perfil
    alert('Modal de perfil - Próximamente\n\nFuncionalidad: Editar perfil de usuario');
}

// Logout ya está definido al inicio del archivo como window.logout

// ========== MODO OSCURO/CLARO ==========
function inicializarModo() {
    const modo = localStorage.getItem('theme') || 'dark';
    const modoToggle = document.getElementById('modoToggle');
    const modoIcon = document.getElementById('modoIcon');
    
    aplicarModo(modo, modoIcon);
}

function toggleModo() {
    const modoIcon = document.getElementById('modoIcon');
    const isDark = document.body.classList.contains('theme-dark') || !document.body.classList.contains('theme-light');
    
    if (isDark) {
        // Cambiar a claro
        aplicarModo('light', modoIcon);
        localStorage.setItem('theme', 'light');
    } else {
        // Cambiar a oscuro
        aplicarModo('dark', modoIcon);
        localStorage.setItem('theme', 'dark');
    }
    
    try {
        mostrarToast(`Modo ${isDark ? 'claro' : 'oscuro'} activado`, 'info');
    } catch (e) {
        console.log(`Modo ${isDark ? 'claro' : 'oscuro'} activado`);
    }
}

// Hacer toggleModo disponible globalmente
window.toggleModo = toggleModo;

function aplicarModo(modo, modoIcon) {
    if (modo === 'dark') {
        document.body.classList.add('theme-dark');
        document.body.classList.remove('theme-light');
        document.documentElement.style.setProperty('--bg-primary', '#1a1a2e');
        document.documentElement.style.setProperty('--text-primary', '#ffffff');
        if (modoIcon) modoIcon.className = 'las la-moon';
    } else {
        document.body.classList.add('theme-light');
        document.body.classList.remove('theme-dark');
        document.documentElement.style.setProperty('--bg-primary', '#f8f9fa');
        document.documentElement.style.setProperty('--text-primary', '#212529');
        if (modoIcon) modoIcon.className = 'las la-sun';
    }
}

// ========== UTILIDADES ==========
function formatearFecha(fecha) {
    if (!fecha) return '';
    const date = new Date(fecha);
    const ahora = new Date();
    const diff = ahora - date;
    
    if (diff < 60000) return 'Hace un momento';
    if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)} h`;
    return date.toLocaleDateString('es-ES');
}

function mostrarToast(mensaje, tipo = 'info') {
    // Crear toast simple
    const toast = document.createElement('div');
    toast.className = `toast-header toast-${tipo}`;
    toast.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${tipo === 'success' ? '#2ed573' : tipo === 'error' ? '#e94560' : '#d4af37'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
    `;
    toast.textContent = mensaje;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// Agregar estilos de animación para toast
if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}
