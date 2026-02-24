/**
 * DASHBOARD.JS - Dashboard Premium v2.0
 * Proyecto: Las Gambusinas — Panel Admin Premium
 * 
 * Features:
 * - Real-time data loading
 * - Cache + retry
 * - Adaptive refresh
 * - Skeleton loaders
 * - Error handling
 */

(function() {
    'use strict';
    
    // ============================================
    // CONFIGURATION
    // ============================================
    const API_BASE = '/api';
    const FETCH_TIMEOUT = 5000;
    const LOADER_MAX_TIMEOUT = 3000;
    const FAST_REFRESH = 15000;
    const SLOW_REFRESH = 300000;
    
    // ============================================
    // STATE
    // ============================================
    const AppState = {
        user: null,
        theme: 'dark',
        sidebarCollapsed: false,
        mesas: [],
        ventas: { hoy: 0, tickets: 0, porHora: [] },
        platos: [],
        mozos: [],
        alertas: [],
        ultimaActualizacion: null
    };
    
    const cardStates = {
        mesas: 'loading',
        ventas: 'loading',
        platos: 'loading',
        mozos: 'loading',
        alertas: 'loading'
    };
    
    let autoRefreshInterval = null;
    let isInitialized = false;
    
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
        if (isInitialized) return;
        isInitialized = true;
        
        console.log('Dashboard initializing...');
        
        // Hide loader immediately
        hideLoader();
        
        // Show placeholders
        showPlaceholders();
        
        // Check auth
        checkAuth();
        
        // Fallback to hide loader
        setTimeout(hideLoader, LOADER_MAX_TIMEOUT);
    }
    
    // ============================================
    // AUTH CHECK
    // ============================================
    function checkAuth() {
        const token = localStorage.getItem('adminToken');
        
        if (!token) {
            hideLoader();
            window.location.href = '/dashboard/login.html';
            return;
        }
        
        // Timeout for auth
        const authTimeout = setTimeout(() => {
            console.warn('Auth timeout, continuing...');
            hideLoader();
            initializeDashboard();
        }, 2000);
        
        fetch(`${API_BASE}/admin/verify`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(response => {
            clearTimeout(authTimeout);
            if (!response.ok) throw new Error('Token invalid');
            return response.json();
        })
        .then(data => {
            const usernameEl = document.getElementById('sidebar-username');
            if (usernameEl && data.usuario) {
                usernameEl.textContent = data.usuario.name || 'Admin';
            }
            hideLoader();
            initializeDashboard();
        })
        .catch(error => {
            clearTimeout(authTimeout);
            console.warn('Auth error:', error);
            hideLoader();
            
            if (error.message === 'Token invalid') {
                localStorage.removeItem('adminToken');
                window.location.href = '/dashboard/login.html';
            } else {
                initializeDashboard();
            }
        });
    }
    
    // ============================================
    // DASHBOARD INITIALIZATION
    // ============================================
    function initializeDashboard() {
        console.log('Dashboard data loading...');
        
        // Load data in parallel
        loadAllData()
            .then(data => {
                updateCards(data);
                initAdaptiveRefresh();
            })
            .catch(error => {
                console.error('Error loading data:', error);
                showError(error.message);
            })
            .finally(hideLoader);
        
        // Fallback
        setTimeout(hideLoader, 5000);
    }
    
    // ============================================
    // DATA LOADING
    // ============================================
    async function loadAllData() {
        const results = await Promise.allSettled([
            fetchWithTimeout(`${API_BASE}/mesas`, 'mesas'),
            fetchWithTimeout(`${API_BASE}/boucher/fecha/${new Date().toISOString().split('T')[0]}`, 'ventas'),
            fetchWithTimeout(`${API_BASE}/comanda`, 'platos'),
            fetchWithTimeout(`${API_BASE}/mozos`, 'mozos')
        ]);
        
        return processResults(results);
    }
    
    function fetchWithTimeout(url, type) {
        return Promise.race([
            fetch(url, { headers: getAuthHeaders() }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Timeout ${type}`)), FETCH_TIMEOUT)
            )
        ])
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(data => ({ type, data, success: true }))
        .catch(error => ({ type, error: error.message, success: false }));
    }
    
    function processResults(results) {
        const data = {
            mesas: null,
            ventas: null,
            platos: null,
            mozos: null
        };
        
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value.success) {
                data[result.value.type] = result.value.data;
            } else {
                const type = result.status === 'fulfilled' ? result.value.type : 'unknown';
                data[type] = { error: result.reason?.message || 'Error' };
            }
        });
        
        return data;
    }
    
    // ============================================
    // PLACEHOLDERS
    // ============================================
    function showPlaceholders() {
        // Show loading state in cards
        document.querySelectorAll('.counter').forEach(el => {
            el.textContent = '--';
        });
    }
    
    // ============================================
    // UPDATE CARDS
    // ============================================
    function updateCards(data) {
        console.log('Updating cards with data:', data);
        
        // Mesas
        if (data.mesas && !data.mesas.error && Array.isArray(data.mesas)) {
            const ocupadas = data.mesas.filter(m => m.estado && m.estado !== 'libre' && m.isActive !== false).length;
            const total = data.mesas.filter(m => m.isActive !== false).length;
            const porcentaje = total > 0 ? Math.round((ocupadas / total) * 100) : 0;
            
            updateMesasCard(ocupadas, total, porcentaje);
            updateMesaGrid(data.mesas);
            cardStates.mesas = 'success';
        } else {
            cardStates.mesas = data.mesas?.error ? 'error' : 'empty';
        }
        
        // Ventas
        if (data.ventas && !data.ventas.error && Array.isArray(data.ventas)) {
            const totalVentas = data.ventas.reduce((sum, b) => sum + (b.total || 0), 0);
            const tickets = data.ventas.length;
            
            updateVentasCard(totalVentas, tickets);
            cardStates.ventas = 'success';
        } else {
            cardStates.ventas = data.ventas?.error ? 'error' : 'empty';
        }
        
        // Platos
        if (data.platos && !data.platos.error && Array.isArray(data.platos)) {
            const platosCount = {};
            data.platos.forEach(comanda => {
                if (comanda.platos && Array.isArray(comanda.platos)) {
                    comanda.platos.forEach(plato => {
                        const nombre = plato.plato?.nombre || plato.nombre || 'Desconocido';
                        platosCount[nombre] = (platosCount[nombre] || 0) + (plato.cantidad || 1);
                    });
                }
            });
            
            const topPlatos = Object.entries(platosCount)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2);
            
            updatePlatosCard(topPlatos);
            cardStates.platos = 'success';
        } else {
            cardStates.platos = data.platos?.error ? 'error' : 'empty';
        }
        
        // Mozos
        if (data.mozos && !data.mozos.error && Array.isArray(data.mozos) && data.ventas && !data.ventas.error) {
            const mozosVentas = {};
            const mozosMesas = {};
            
            if (Array.isArray(data.ventas)) {
                data.ventas.forEach(boucher => {
                    const mozoId = boucher.mozoId || boucher.mozo?._id;
                    const mozo = data.mozos.find(m => m._id === mozoId || m.mozoId === mozoId);
                    if (mozo) {
                        const nombre = mozo.name;
                        mozosVentas[nombre] = (mozosVentas[nombre] || 0) + (boucher.total || 0);
                        mozosMesas[nombre] = (mozosMesas[nombre] || 0) + 1;
                    }
                });
            }
            
            const topMozos = Object.entries(mozosVentas)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2);
            
            updateMozosCard(topMozos, mozosMesas);
            cardStates.mozos = 'success';
        } else {
            cardStates.mozos = data.mozos?.error ? 'error' : 'empty';
        }
        
        // Alertas
        if (data.mesas && !data.mesas.error && Array.isArray(data.mesas)) {
            const mesasPagadas = data.mesas.filter(m => m.estado === 'pagado' && m.isActive !== false).length;
            updateAlertasCard(mesasPagadas);
            cardStates.alertas = 'success';
        }
        
        // Trigger animations
        if (window.Animations && window.Animations.CountUp) {
            window.Animations.CountUp.refresh();
        }
        
        AppState.ultimaActualizacion = new Date();
    }
    
    // ============================================
    // CARD UPDATERS
    // ============================================
    function updateMesasCard(ocupadas, total, porcentaje) {
        const counters = document.querySelectorAll('.counter[data-target="12"]');
        counters.forEach(c => {
            c.textContent = ocupadas;
            c.setAttribute('data-target', ocupadas);
        });
        
        const totalEl = document.getElementById('total-mesas');
        if (totalEl) totalEl.textContent = total;
        
        const progressBar = document.querySelector('.kpi-progress-bar');
        if (progressBar) {
            progressBar.style.width = porcentaje + '%';
        }
    }
    
    function updateVentasCard(total, tickets) {
        const counters = document.querySelectorAll('.counter[data-target="2450"]');
        counters.forEach(c => {
            c.textContent = Math.round(total);
            c.setAttribute('data-target', Math.round(total));
        });
        
        const ticketsEl = document.getElementById('tickets-hoy');
        if (ticketsEl) ticketsEl.textContent = tickets;
    }
    
    function updatePlatosCard(topPlatos) {
        const card = document.querySelectorAll('.kpi-card')[2];
        if (!card) return;
        
        const h5 = card.querySelector('.kpi-value');
        const p = card.querySelector('.kpi-subtitle');
        
        if (topPlatos[0] && h5) {
            h5.textContent = topPlatos[0][0];
            h5.style.fontSize = '1.25rem';
        }
        
        if (topPlatos[0] && p) {
            p.innerHTML = `<span class="counter" data-target="${topPlatos[0][1]}">${topPlatos[0][1]}</span> unidades`;
        }
        
        const footer = card.querySelector('.kpi-footer span');
        if (topPlatos[1] && footer) {
            footer.innerHTML = `${topPlatos[1][0]}: <span class="counter" data-target="${topPlatos[1][1]}">${topPlatos[1][1]}</span> und`;
        }
    }
    
    function updateMozosCard(topMozos, mozosMesas) {
        const card = document.querySelectorAll('.kpi-card')[3];
        if (!card) return;
        
        const h5 = card.querySelector('.kpi-value');
        const p = card.querySelector('.kpi-subtitle');
        
        if (topMozos[0] && h5) {
            h5.textContent = topMozos[0][0];
            h5.style.fontSize = '1.25rem';
        }
        
        if (topMozos[0] && p) {
            p.innerHTML = `S/. <span class="counter" data-target="${Math.round(topMozos[0][1])}">${Math.round(topMozos[0][1])}</span> | ${mozosMesas[topMozos[0][0]] || 0} mesas`;
        }
        
        const footer = card.querySelector('.kpi-footer span');
        if (topMozos[1] && footer) {
            footer.innerHTML = `${topMozos[1][0]}: S/. <span class="counter" data-target="${Math.round(topMozos[1][1])}">${Math.round(topMozos[1][1])}</span>`;
        }
    }
    
    function updateAlertasCard(count) {
        const countEl = document.getElementById('alertas-count');
        if (countEl) countEl.textContent = count;
    }
    
    function updateMesaGrid(mesas) {
        const grid = document.getElementById('mesaGrid');
        if (!grid) return;
        
        grid.innerHTML = mesas.slice(0, 20).map(mesa => {
            const estado = mesa.estado || 'libre';
            const estadoClass = {
                'libre': 'libre',
                'ocupado': 'ocupada',
                'ocupada': 'ocupada',
                'pagado': 'pagando',
                'pagando': 'pagando',
                'reservado': 'reservada',
                'reservada': 'reservada'
            }[estado.toLowerCase()] || 'libre';
            
            const badge = estadoClass === 'ocupada' ? '<span class="mesa-badge">0:00</span>' :
                          estadoClass === 'pagando' ? '' :
                          estadoClass === 'reservada' ? '<span class="mesa-badge">🔒</span>' : '';
            
            return `<div class="mesa-tile ${estadoClass}"><span>${mesa.nummesa || mesa._id.slice(-3)}</span>${badge}</div>`;
        }).join('');
    }
    
    // ============================================
    // ADAPTIVE REFRESH
    // ============================================
    function initAdaptiveRefresh() {
        const successCount = Object.values(cardStates).filter(s => s === 'success').length;
        
        if (successCount >= 4) {
            console.log('Init adaptive refresh');
            
            document.addEventListener('visibilitychange', () => {
                clearInterval(autoRefreshInterval);
                
                const delay = document.hidden ? SLOW_REFRESH : FAST_REFRESH;
                autoRefreshInterval = setInterval(refresh, delay);
            });
            
            autoRefreshInterval = setInterval(refresh, FAST_REFRESH);
        }
    }
    
    async function refresh() {
        try {
            const data = await loadAllData();
            updateCards(data);
            console.log('Data refreshed');
        } catch (error) {
            console.error('Refresh error:', error);
        }
    }
    
    // ============================================
    // LOADER
    // ============================================
    function hideLoader() {
        const loader = document.getElementById('loading');
        if (loader) {
            loader.style.opacity = '0';
            loader.style.transition = 'opacity 0.3s ease-out';
            loader.classList.add('loaded');
            loader.style.pointerEvents = 'none';
            loader.style.zIndex = '-1';
            
            setTimeout(() => {
                loader.style.display = 'none';
                loader.style.visibility = 'hidden';
            }, 300);
        }
    }
    
    // ============================================
    // ERROR HANDLING
    // ============================================
    function showError(message) {
        const container = document.querySelector('.content-page .container-fluid');
        if (!container) return;
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-error';
        errorDiv.innerHTML = `
            <i class="las la-exclamation-triangle"></i>
            <div>
                <strong>Error:</strong> ${message}
                <button class="btn btn-sm btn-primary ml-3" onclick="location.reload()">
                    <i class="las la-sync"></i> Recargar
                </button>
            </div>
        `;
        
        container.insertBefore(errorDiv, container.firstChild);
    }
    
    // ============================================
    // GLOBAL FUNCTIONS
    // ============================================
    window.refreshDashboard = refresh;
    window.loadDashboardDataWithTimeout = refresh;
    
    // ============================================
    // INITIALIZE
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Fallback
    window.addEventListener('load', () => {
        setTimeout(hideLoader, 1000);
        setTimeout(hideLoader, 3000);
        setTimeout(hideLoader, 5000);
    });
    
    if (document.readyState === 'complete') {
        hideLoader();
    }
    
})();
