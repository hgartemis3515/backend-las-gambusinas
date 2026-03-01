/**
 * HEADER.JS - Header Premium v2.0
 * Proyecto: Las Gambusinas — Panel Admin Premium
 * 
 * Features:
 * - Global search
 * - Notifications
 * - Messages
 * - Theme toggle
 * - User dropdown
 * - Alerts badge
 * - Caja status
 */

(function() {
    'use strict';
    
    // ============================================
    // CONFIGURATION
    // ============================================
    const API_BASE = '/api';
    const SEARCH_DEBOUNCE = 300;
    const REFRESH_INTERVAL = 30000;
    
    // ============================================
    // STATE
    // ============================================
    let state = {
        searchTimeout: null,
        notifCount: 0,
        msgCount: 0,
        alertCount: 0
    };
    
    // ============================================
    // GLOBAL LOGOUT FUNCTION
    // ============================================
    window.logout = function() {
        console.log('Logout ejecutado');
        
        // Animación de fade out
        document.body.style.transition = 'opacity 300ms ease-out';
        document.body.style.opacity = '0';
        
        setTimeout(() => {
            try {
                // Limpiar localStorage
                localStorage.removeItem('adminToken');
                localStorage.removeItem('gambusinas_auth');
                localStorage.removeItem('theme');
                
                // Limpiar sessionStorage también
                sessionStorage.removeItem('adminToken');
                sessionStorage.removeItem('gambusinas_auth');
                
                // Redirigir al login
                window.location.href = '/login';
            } catch(e) {
                window.location.href = '/login';
            }
        }, 300);
    };
    window.cerrarSesion = window.logout;
    
    // ============================================
    // AUTH HEADERS
    // ============================================
    function getAuthHeaders() {
        const token = localStorage.getItem('adminToken');
        return {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        };
    }
    
    // ============================================
    // INITIALIZATION
    // ============================================
    function init() {
        console.log('Header initializing...');
        
        // Initialize theme
        initTheme();
        
        // Initialize search
        initSearch();
        
        // Initialize dropdowns
        initDropdowns();
        
        // Load data
        loadUserData();
        loadCajaStatus();
        loadAlerts();
        loadNotifications();
        loadMessages();
        
        // Auto-refresh
        setInterval(() => {
            loadCajaStatus();
            loadAlerts();
            loadNotifications();
            loadMessages();
        }, REFRESH_INTERVAL);
        
        console.log('Header initialized');
    }
    
    // ============================================
    // THEME
    // ============================================
    function initTheme() {
        const theme = localStorage.getItem('theme') || 'dark';
        applyTheme(theme);
    }
    
    function applyTheme(theme) {
        const modoIcon = document.getElementById('modoIcon');
        
        if (theme === 'light') {
            document.body.classList.add('theme-light');
            document.body.classList.remove('theme-dark');
            if (modoIcon) modoIcon.className = 'las la-sun';
        } else {
            document.body.classList.add('theme-dark');
            document.body.classList.remove('theme-light');
            if (modoIcon) modoIcon.className = 'las la-moon';
        }
    }
    
    window.toggleModo = function() {
        const isDark = document.body.classList.contains('theme-dark') || 
                       !document.body.classList.contains('theme-light');
        
        const newTheme = isDark ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
        
        showToast(`Modo ${isDark ? 'claro' : 'oscuro'} activado`);
    };
    
    // ============================================
    // SEARCH
    // ============================================
    function initSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');
        
        if (!searchInput) return;
        
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            
            clearTimeout(state.searchTimeout);
            
            if (query.length < 2) {
                if (searchResults) {
                    searchResults.classList.remove('show');
                    searchResults.innerHTML = '';
                }
                return;
            }
            
            state.searchTimeout = setTimeout(() => {
                performSearch(query);
            }, SEARCH_DEBOUNCE);
        });
        
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim().length >= 2) {
                performSearch(searchInput.value.trim());
            }
        });
        
        // Close on click outside
        document.addEventListener('click', (e) => {
            if (searchResults && !searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.remove('show');
            }
        });
    }
    
    async function performSearch(query) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        searchResults.innerHTML = '<div class="search-loading"><i class="las la-spinner la-spin"></i> Buscando...</div>';
        searchResults.classList.add('show');
        
        try {
            const results = await searchAll(query);
            displaySearchResults(results);
        } catch (error) {
            console.error('Search error:', error);
            searchResults.innerHTML = '<div class="search-error">Error al buscar</div>';
        }
    }
    
    async function searchAll(query) {
        const results = [];
        
        // Search mesas
        try {
            const mesasRes = await fetch(`${API_BASE}/mesas`, { headers: getAuthHeaders() });
            if (mesasRes.ok) {
                const mesas = await mesasRes.json();
                mesas.filter(m => 
                    m.nummesa?.toString().includes(query) || 
                    m.estado?.toLowerCase().includes(query.toLowerCase())
                ).slice(0, 3).forEach(m => {
                    results.push({
                        type: 'Mesa',
                        title: `Mesa ${m.nummesa || m._id.slice(-6)}`,
                        subtitle: `Estado: ${m.estado || 'libre'}`,
                        url: `/dashboard/pages/mesas.html#mesa-${m._id}`
                    });
                });
            }
        } catch (e) {}
        
        // Search platos
        try {
            const platosRes = await fetch(`${API_BASE}/platos`, { headers: getAuthHeaders() });
            if (platosRes.ok) {
                const platos = await platosRes.json();
                platos.filter(p => 
                    p.nombre?.toLowerCase().includes(query.toLowerCase())
                ).slice(0, 3).forEach(p => {
                    results.push({
                        type: 'Plato',
                        title: p.nombre,
                        subtitle: `S/. ${(p.precio || 0).toFixed(2)}`,
                        url: `/dashboard/pages/platos.html#plato-${p._id}`
                    });
                });
            }
        } catch (e) {}
        
        return results;
    }
    
    function displaySearchResults(results) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        if (results.length === 0) {
            searchResults.innerHTML = '<div class="search-empty">No se encontraron resultados</div>';
            return;
        }
        
        searchResults.innerHTML = results.map(r => `
            <a href="${r.url}" class="search-result-item" onclick="event.stopPropagation();">
                <div class="search-result-type">${r.type}</div>
                <div class="search-result-title">${r.title}</div>
                <div class="search-result-subtitle">${r.subtitle}</div>
            </a>
        `).join('');
    }
    
    // ============================================
    // DROPDOWNS
    // ============================================
    function initDropdowns() {
        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown') && !e.target.closest('.nav-icon')) {
                closeAllDropdowns();
            }
        });
        
        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeAllDropdowns();
            }
        });
    }
    
    function closeAllDropdowns() {
        document.querySelectorAll('.iq-sub-dropdown, .dropdown-menu').forEach(menu => {
            menu.classList.remove('show');
        });
    }
    
    window.toggleDropdown = function(tipo) {
        const dropdowns = {
            'notificaciones': 'dropdownNotifications',
            'mensajes': 'dropdownMessages',
            'usuario': 'dropdownUser'
        };
        
        const toggleId = dropdowns[tipo];
        if (!toggleId) return;
        
        const toggleEl = document.getElementById(toggleId);
        if (!toggleEl) return;
        
        let menuEl = toggleEl.nextElementSibling;
        if (!menuEl || !menuEl.classList.contains('iq-sub-dropdown')) {
            const parentLi = toggleEl.closest('li');
            if (parentLi) {
                menuEl = parentLi.querySelector('.iq-sub-dropdown');
            }
        }
        
        if (!menuEl) return;
        
        const isOpen = menuEl.classList.contains('show');
        
        closeAllDropdowns();
        
        if (!isOpen) {
            menuEl.classList.add('show');
        }
    };
    
    // ============================================
    // CAJA STATUS
    // ============================================
    async function loadCajaStatus() {
        const cajaStatus = document.getElementById('cajaStatus');
        const cajaStatusText = document.getElementById('cajaStatusText');
        
        if (!cajaStatus) return;
        
        try {
            const response = await fetch(`${API_BASE}/cierreCaja/estado`, {
                headers: getAuthHeaders()
            });
            
            if (response.ok) {
                const estado = await response.json();
                
                if (estado.abierta) {
                    cajaStatus.className = 'caja-status-badge caja-abierta';
                    cajaStatusText.innerHTML = `<i class="las la-cash-register"></i> Abierta S/. ${(estado.total || 0).toFixed(2)}`;
                } else {
                    cajaStatus.className = 'caja-status-badge caja-cerrada';
                    cajaStatusText.innerHTML = '<i class="las la-cash-register"></i> Cerrada';
                }
            }
        } catch (error) {
            console.warn('Error loading caja status:', error);
        }
    }
    
    // ============================================
    // ALERTS
    // ============================================
    async function loadAlerts() {
        const alertasCount = document.getElementById('alertasCount');
        const alertasUrgentes = document.getElementById('alertasUrgentes');
        
        if (!alertasCount) return;
        
        try {
            const response = await fetch(`${API_BASE}/mesas`, {
                headers: getAuthHeaders()
            });
            
            if (response.ok) {
                const mesas = await response.json();
                const mesasPagadas = mesas.filter(m => m.estado === 'pagado' && m.isActive !== false).length;
                
                state.alertCount = mesasPagadas;
                alertasCount.textContent = mesasPagadas;
                alertasCount.style.display = mesasPagadas > 0 ? 'flex' : 'none';
                
                if (alertasUrgentes) {
                    if (mesasPagadas > 0) {
                        alertasUrgentes.classList.add('has-alertas');
                    } else {
                        alertasUrgentes.classList.remove('has-alertas');
                    }
                }
            }
        } catch (error) {
            console.warn('Error loading alerts:', error);
        }
    }
    
    // ============================================
    // NOTIFICATIONS
    // ============================================
    async function loadNotifications() {
        const notificacionesBadge = document.getElementById('notificacionesBadge');
        const notificacionesCount = document.getElementById('notificacionesCount');
        const notificacionesList = document.getElementById('notificacionesList');
        
        // Simulated notifications for now
        const notifications = [
            { id: '1', title: 'Mesa 5 preparada', message: 'La mesa 5 está lista para servir', time: 'Hace 5 min', read: false },
            { id: '2', title: 'Nueva comanda #58', message: 'Nueva comanda recibida en cocina', time: 'Hace 12 min', read: false },
            { id: '3', title: 'Cierre de caja pendiente', message: 'Hay un cierre de caja pendiente', time: 'Hace 1 hora', read: true }
        ];
        
        const unread = notifications.filter(n => !n.read).length;
        state.notifCount = unread;
        
        if (notificacionesBadge) {
            notificacionesBadge.textContent = unread;
            notificacionesBadge.style.display = unread > 0 ? 'flex' : 'none';
        }
        
        if (notificacionesCount) {
            notificacionesCount.textContent = notifications.length;
        }
        
        if (notificacionesList) {
            notificacionesList.innerHTML = notifications.map(n => `
                <a href="#" class="iq-sub-card ${!n.read ? 'notificacion-no-leida' : ''}" onclick="event.preventDefault();">
                    <div class="media align-items-center cust-card py-3">
                        <div class="media-body">
                            <div class="d-flex align-items-center justify-content-between">
                                <h6 class="mb-0" style="font-size: 0.85rem;">${n.title}</h6>
                                <small style="color: var(--text-muted); font-size: 0.7rem;">${n.time}</small>
                            </div>
                            <small style="color: var(--text-muted);">${n.message}</small>
                        </div>
                    </div>
                </a>
            `).join('');
        }
    }
    
    window.marcarTodasLeidas = function() {
        state.notifCount = 0;
        const notificacionesBadge = document.getElementById('notificacionesBadge');
        if (notificacionesBadge) {
            notificacionesBadge.style.display = 'none';
        }
        showToast('Todas las notificaciones marcadas como leídas');
    };
    
    // ============================================
    // MESSAGES
    // ============================================
    async function loadMessages() {
        const mensajesBadge = document.getElementById('mensajesBadge');
        const mensajesCount = document.getElementById('mensajesCount');
        const mensajesList = document.getElementById('mensajesList');
        
        // Simulated messages for now
        const messages = [
            { id: '1', sender: 'Juan (Mozo)', message: 'Plato sin stock - Ceviche', time: 'Hace 2 min', avatar: '1.jpg', read: false },
            { id: '2', sender: 'Cocina', message: 'Comanda #57 lista para servir', time: 'Hace 10 min', avatar: '2.jpg', read: false }
        ];
        
        const unread = messages.filter(m => !m.read).length;
        state.msgCount = unread;
        
        if (mensajesBadge) {
            mensajesBadge.textContent = unread;
            mensajesBadge.style.display = unread > 0 ? 'flex' : 'none';
        }
        
        if (mensajesCount) {
            mensajesCount.textContent = messages.length;
        }
        
        if (mensajesList) {
            mensajesList.innerHTML = messages.map(m => `
                <a href="#" class="iq-sub-card ${!m.read ? 'mensaje-no-leido' : ''}" onclick="event.preventDefault();">
                    <div class="media align-items-center cust-card py-3">
                        <div class="media-body">
                            <div class="d-flex align-items-center justify-content-between">
                                <h6 class="mb-0" style="font-size: 0.85rem;">${m.sender}</h6>
                                <small style="color: var(--text-muted); font-size: 0.7rem;">${m.time}</small>
                            </div>
                            <small style="color: var(--text-muted);">${m.message}</small>
                        </div>
                    </div>
                </a>
            `).join('');
        }
    }
    
    // ============================================
    // USER DATA
    // ============================================
    async function loadUserData() {
        const userName = document.getElementById('userName');
        const userRole = document.getElementById('userRole');
        const sidebarUsername = document.getElementById('sidebar-username');
        
        const token = localStorage.getItem('adminToken');
        if (!token) return;
        
        try {
            const response = await fetch(`${API_BASE}/admin/verify`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                const nombre = data.usuario?.name || data.user?.name || 'Admin';
                
                if (userName) userName.textContent = nombre;
                if (userRole) userRole.textContent = data.usuario?.role || 'Gerente';
                if (sidebarUsername) sidebarUsername.textContent = nombre;
            }
        } catch (error) {
            console.warn('Error loading user data:', error);
        }
    }
    
    // ============================================
    // TOAST
    // ============================================
    function showToast(message, type = 'info') {
        const existing = document.querySelector('.toast-header');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = `toast-header toast-${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }
    
    window.showToast = showToast;
    
    // ============================================
    // INITIALIZE
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
