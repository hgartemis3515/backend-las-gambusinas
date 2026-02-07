/**
 * DASHBOARD.JS - LÓGICA ROBUSTA ANTI-FALLA
 * Dashboard siempre responde - Nunca bloqueado
 * Placeholders inmediatos + Carga paralela + Estados granulares
 */

const API_BASE = '/api';
const FETCH_TIMEOUT = 5000; // 5 segundos por API
const LOADER_MAX_TIMEOUT = 12000; // 12 segundos máximo para loader global
let loaderVisible = false;
let autoRefreshInterval = null;
let cardStates = {
    mesas: 'loading',
    ventas: 'loading',
    platos: 'loading',
    mozos: 'loading',
    alertas: 'loading'
};

// Obtener headers de autenticación
function getAuthHeaders() {
    const token = localStorage.getItem('adminToken');
    return {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
    };
}

// ========== INICIALIZACIÓN ==========
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Dashboard iniciando...');
    
    // CRÍTICO: Ocultar loader inmediatamente al cargar
    hideLoader();
    esconderLoaderGlobal();
    
    // PRINCIPIO #1: Mostrar placeholders inmediatamente
    mostrarPlaceholders();
    
    // Verificar autenticación
    checkAuth();
    
    // Fallback agresivo: Ocultar loader después de 3 segundos máximo
    setTimeout(() => {
        console.log('🛡️ Fallback 3s: Forzando ocultación de loader');
        hideLoader();
        esconderLoaderGlobal();
    }, 3000);
});

// Verificar autenticación
function checkAuth() {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        hideLoader();
        esconderLoaderGlobal();
        window.location.href = '/dashboard/login.html';
        return;
    }
    
    // Timeout rápido para auth (2s) - más agresivo
    const authTimeout = setTimeout(() => {
        console.warn('⚠️ Timeout en verificación de auth, continuando...');
        hideLoader();
        esconderLoaderGlobal();
        initializeDashboard();
    }, 2000);
    
    fetch(`${API_BASE}/admin/verify`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => {
        clearTimeout(authTimeout);
        if (!response.ok) throw new Error('Token inválido');
        return response.json();
    })
    .then(data => {
        const usernameEl = document.getElementById('sidebar-username');
        if (usernameEl && data.usuario) {
            usernameEl.textContent = data.usuario.name || 'Admin';
        }
        hideLoader();
        esconderLoaderGlobal();
        initializeDashboard();
    })
    .catch(error => {
        clearTimeout(authTimeout);
        console.warn('⚠️ Error en auth, continuando sin verificación:', error);
        hideLoader();
        esconderLoaderGlobal();
        if (error.message === 'Token inválido') {
            localStorage.removeItem('adminToken');
            window.location.href = '/dashboard/login.html';
        } else {
            initializeDashboard();
        }
    });
}

// Inicializar dashboard
function initializeDashboard() {
    console.log('✅ Inicializando dashboard...');
    
    // CRÍTICO: Asegurar que el loader esté oculto
    hideLoader();
    esconderLoaderGlobal();
    
    // PRINCIPIO #2: Cargar datos en paralelo con timeouts individuales
    // NO mostrar loader de nuevo - los placeholders ya están visibles
    cargarDatosSeguros()
        .then(datos => {
            console.log('📊 Datos cargados:', datos);
            actualizarCards(datos);
        })
        .catch(error => {
            console.error('❌ Error cargando datos:', error);
            mostrarErrorGlobal(error);
        })
        .finally(() => {
            // Asegurar que el loader esté oculto
            hideLoader();
            esconderLoaderGlobal();
        });
    
    // Inicializar animaciones
    setTimeout(() => {
        initializeCounterUp();
        initializeProgressBars();
    }, 500);
    
    // Fallback adicional: Ocultar loader después de 5 segundos
    setTimeout(() => {
        hideLoader();
        esconderLoaderGlobal();
    }, 5000);
}

// ========== PRINCIPIO #1: PLACEHOLDERS INMEDIATOS ==========
function mostrarPlaceholders() {
    console.log('📋 Mostrando placeholders...');
    
    // Card Mesas
    updateCardMesas({
        ocupadas: '--',
        total: '--',
        porcentaje: 0,
        estado: 'loading',
        mensaje: 'Cargando mesas...'
    });
    
    // Card Ventas
    updateCardVentas({
        total: '--',
        tickets: '--',
        estado: 'loading',
        mensaje: 'Cargando ventas...'
    });
    
    // Card Platos
    updateCardPlatos({
        plato1: { nombre: 'Cargando...', cantidad: '--' },
        plato2: { nombre: '...', cantidad: '--' },
        estado: 'loading',
        mensaje: 'Cargando platos...'
    });
    
    // Card Mozos
    updateCardMozos({
        mozo1: { nombre: 'Cargando...', ventas: '--', mesas: '--' },
        mozo2: { nombre: '...', ventas: '--' },
        estado: 'loading',
        mensaje: 'Cargando mozos...'
    });
    
    // Card Alertas
    updateCardAlertas({
        count: '--',
        estado: 'loading',
        mensaje: 'Verificando alertas...'
    });
}

// ========== PRINCIPIO #2: CARGA PARALELA CON TIMEOUTS ==========
async function cargarDatosSeguros() {
    console.log('🔄 Iniciando carga de datos en paralelo...');
    
    // Promise.allSettled - cada fetch independiente
    const resultados = await Promise.allSettled([
        fetchConTimeout(`${API_BASE}/mesas`, 'mesas'),
        fetchConTimeout(`${API_BASE}/boucher/fecha/${new Date().toISOString().split('T')[0]}`, 'ventas'),
        fetchConTimeout(`${API_BASE}/comanda`, 'platos'),
        fetchConTimeout(`${API_BASE}/mozos`, 'mozos'),
        fetchConTimeout(`${API_BASE}/mesas`, 'alertas') // Reutilizamos mesas para alertas
    ]);
    
    return procesarResultados(resultados);
}

// Fetch con timeout individual
function fetchConTimeout(url, tipo) {
    return Promise.race([
        fetch(url, {
            headers: getAuthHeaders(),
            signal: AbortSignal.timeout(FETCH_TIMEOUT)
        }),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout ${tipo}`)), FETCH_TIMEOUT)
        )
    ])
    .then(async response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${tipo}`);
        }
        const data = await response.json();
        console.log(`✅ ${tipo} cargado:`, data);
        return { tipo, data, success: true };
    })
    .catch(error => {
        console.error(`❌ Error ${tipo}:`, error);
        return { tipo, error: error.message, success: false };
    });
}

// Procesar resultados
function procesarResultados(resultados) {
    const datos = {
        mesas: null,
        ventas: null,
        platos: null,
        mozos: null,
        alertas: null
    };
    
    resultados.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success) {
            datos[result.value.tipo] = result.value.data;
        } else {
            const tipo = result.status === 'fulfilled' ? result.value.tipo : 'unknown';
            datos[tipo] = { error: result.reason?.message || 'Error desconocido' };
        }
    });
    
    return datos;
}

// ========== PRINCIPIO #3: ACTUALIZAR CARDS CON ESTADOS ==========
function actualizarCards(datos) {
    console.log('🎨 Actualizando cards con datos:', datos);
    
    // Procesar Mesas
    if (datos.mesas && !datos.mesas.error && Array.isArray(datos.mesas)) {
        const mesasOcupadas = datos.mesas.filter(m => m.estado && m.estado !== 'libre' && m.isActive !== false).length;
        const totalMesas = datos.mesas.filter(m => m.isActive !== false).length;
        const porcentaje = totalMesas > 0 ? Math.round((mesasOcupadas / totalMesas) * 100) : 0;
        
        updateCardMesas({
            ocupadas: mesasOcupadas,
            total: totalMesas,
            porcentaje,
            estado: 'success',
            mensaje: null
        });
        cardStates.mesas = 'success';
    } else {
        updateCardMesas({
            ocupadas: '--',
            total: '--',
            porcentaje: 0,
            estado: datos.mesas?.error ? 'error' : 'empty',
            mensaje: datos.mesas?.error || 'No hay mesas registradas'
        });
        cardStates.mesas = datos.mesas?.error ? 'error' : 'empty';
    }
    
    // Procesar Ventas
    if (datos.ventas && !datos.ventas.error && Array.isArray(datos.ventas)) {
        const totalVentas = datos.ventas.reduce((sum, b) => sum + (b.total || 0), 0);
        const tickets = datos.ventas.length;
        
        updateCardVentas({
            total: totalVentas.toFixed(2),
            tickets,
            estado: 'success',
            mensaje: null
        });
        cardStates.ventas = 'success';
    } else {
        updateCardVentas({
            total: '0.00',
            tickets: '0',
            estado: datos.ventas?.error ? 'error' : 'empty',
            mensaje: datos.ventas?.error || 'Sin ventas hoy'
        });
        cardStates.ventas = datos.ventas?.error ? 'error' : 'empty';
    }
    
    // Procesar Platos
    if (datos.platos && !datos.platos.error && Array.isArray(datos.platos)) {
        const platosCount = {};
        datos.platos.forEach(comanda => {
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
        
        const plato1 = topPlatos[0] ? { nombre: topPlatos[0][0], cantidad: topPlatos[0][1] } : { nombre: 'Sin ventas', cantidad: 0 };
        const plato2 = topPlatos[1] ? { nombre: topPlatos[1][0], cantidad: topPlatos[1][1] } : { nombre: '...', cantidad: 0 };
        
        updateCardPlatos({
            plato1,
            plato2,
            estado: 'success',
            mensaje: null
        });
        cardStates.platos = 'success';
    } else {
        updateCardPlatos({
            plato1: { nombre: 'Sin datos', cantidad: 0 },
            plato2: { nombre: '...', cantidad: 0 },
            estado: datos.platos?.error ? 'error' : 'empty',
            mensaje: datos.platos?.error || 'No hay platos vendidos'
        });
        cardStates.platos = datos.platos?.error ? 'error' : 'empty';
    }
    
    // Procesar Mozos
    if (datos.mozos && !datos.mozos.error && Array.isArray(datos.mozos) && datos.ventas && !datos.ventas.error) {
        const hoy = new Date().toISOString().split('T')[0];
        const mozosVentas = {};
        const mozosMesas = {};
        
        if (Array.isArray(datos.ventas)) {
            datos.ventas.forEach(boucher => {
                const mozoId = boucher.mozoId || boucher.mozo?._id;
                const mozo = datos.mozos.find(m => m._id === mozoId || m.mozoId === mozoId);
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
        
        const mozo1 = topMozos[0] ? {
            nombre: topMozos[0][0],
            ventas: Math.round(topMozos[0][1]),
            mesas: mozosMesas[topMozos[0][0]] || 0
        } : { nombre: 'Sin ventas', ventas: 0, mesas: 0 };
        
        const mozo2 = topMozos[1] ? {
            nombre: topMozos[1][0],
            ventas: Math.round(topMozos[1][1])
        } : { nombre: '...', ventas: 0 };
        
        updateCardMozos({
            mozo1,
            mozo2,
            estado: 'success',
            mensaje: null
        });
        cardStates.mozos = 'success';
    } else {
        updateCardMozos({
            mozo1: { nombre: 'Sin datos', ventas: 0, mesas: 0 },
            mozo2: { nombre: '...', ventas: 0 },
            estado: datos.mozos?.error ? 'error' : 'empty',
            mensaje: datos.mozos?.error || 'No hay mozos activos'
        });
        cardStates.mozos = datos.mozos?.error ? 'error' : 'empty';
    }
    
    // Procesar Alertas
    if (datos.alertas && !datos.alertas.error && Array.isArray(datos.alertas)) {
        const mesasPagadas = datos.alertas.filter(m => m.estado === 'pagado' && m.isActive !== false).length;
        
        updateCardAlertas({
            count: mesasPagadas,
            estado: 'success',
            mensaje: null
        });
        cardStates.alertas = 'success';
    } else {
        updateCardAlertas({
            count: 0,
            estado: datos.alertas?.error ? 'error' : 'empty',
            mensaje: datos.alertas?.error || 'No hay alertas'
        });
        cardStates.alertas = datos.alertas?.error ? 'error' : 'empty';
    }
    
    // Activar auto-refresh si >80% cards OK
    const successCount = Object.values(cardStates).filter(s => s === 'success').length;
    if (successCount >= 4 && !autoRefreshInterval) {
        console.log('🔄 Activando auto-refresh (80%+ cards OK)');
        autoRefreshInterval = setInterval(() => {
            cargarDatosSeguros()
                .then(datos => actualizarCards(datos))
                .catch(error => console.error('Error en auto-refresh:', error));
        }, 45000);
    }
}

// ========== ACTUALIZAR CARDS INDIVIDUALES ==========
function updateCardMesas({ ocupadas, total, porcentaje, estado, mensaje }) {
    const counter = document.querySelector('.counter[data-target="12"]');
    const totalEl = document.getElementById('total-mesas');
    const progressBar = document.querySelector('.progress-bar-premium');
    
    if (counter) {
        counter.textContent = ocupadas;
        counter.setAttribute('data-target', typeof ocupadas === 'number' ? ocupadas : 0);
    }
    if (totalEl) totalEl.textContent = total;
    if (progressBar) {
        progressBar.style.width = porcentaje + '%';
        progressBar.setAttribute('aria-valuenow', porcentaje);
    }
    
    mostrarEstadoCard('mesas', estado, mensaje);
}

function updateCardVentas({ total, tickets, estado, mensaje }) {
    const counters = document.querySelectorAll('.counter[data-target="2450"]');
    const ticketsEl = document.getElementById('tickets-hoy');
    
    counters.forEach(c => {
        c.textContent = total;
        c.setAttribute('data-target', typeof total === 'number' ? Math.round(total) : 0);
    });
    if (ticketsEl) ticketsEl.textContent = tickets;
    
    mostrarEstadoCard('ventas', estado, mensaje);
}

function updateCardPlatos({ plato1, plato2, estado, mensaje }) {
    const card = document.querySelectorAll('.premium-card')[2];
    if (card) {
        const h5 = card.querySelector('h5');
        const p = card.querySelector('p');
        const small = card.querySelector('small');
        
        if (h5) h5.textContent = plato1.nombre;
        if (p) {
            const counter = p.querySelector('.counter');
            if (counter) {
                counter.textContent = plato1.cantidad;
                counter.setAttribute('data-target', typeof plato1.cantidad === 'number' ? plato1.cantidad : 0);
            }
        }
        if (small) {
            small.innerHTML = `${plato2.nombre}: <span class="counter" data-target="${plato2.cantidad}">${plato2.cantidad}</span> und`;
        }
    }
    
    mostrarEstadoCard('platos', estado, mensaje);
}

function updateCardMozos({ mozo1, mozo2, estado, mensaje }) {
    const card = document.querySelectorAll('.premium-card')[3];
    if (card) {
        const h5 = card.querySelector('h5');
        const p = card.querySelector('p');
        const small = card.querySelector('small');
        
        if (h5) h5.textContent = mozo1.nombre;
        if (p) {
            const counter = p.querySelector('.counter');
            if (counter) {
                counter.textContent = mozo1.ventas;
                counter.setAttribute('data-target', typeof mozo1.ventas === 'number' ? mozo1.ventas : 0);
            }
            const mesasEl = p.querySelector('#mesas-mozo-1');
            if (mesasEl) mesasEl.textContent = mozo1.mesas;
        }
        if (small) {
            small.innerHTML = `${mozo2.nombre}: S/. <span class="counter" data-target="${mozo2.ventas}">${mozo2.ventas}</span>`;
        }
    }
    
    mostrarEstadoCard('mozos', estado, mensaje);
}

function updateCardAlertas({ count, estado, mensaje }) {
    const countEl = document.getElementById('alertas-count');
    if (countEl) countEl.textContent = count;
    
    mostrarEstadoCard('alertas', estado, mensaje);
}

// ========== PRINCIPIO #3: ESTADOS POR CARD ==========
function mostrarEstadoCard(tipo, estado, mensaje) {
    const cards = document.querySelectorAll('.premium-card');
    let cardIndex = { mesas: 0, ventas: 1, platos: 2, mozos: 3, alertas: 4 }[tipo];
    const card = cards[cardIndex];
    
    if (!card) return;
    
    // Remover estados anteriores
    let estadoEl = card.querySelector('.card-estado');
    if (!estadoEl) {
        estadoEl = document.createElement('div');
        estadoEl.className = 'card-estado';
        estadoEl.style.cssText = 'margin-top: 10px; font-size: 0.75rem; text-align: center;';
        card.querySelector('.iq-card-body').appendChild(estadoEl);
    }
    
    if (estado === 'loading') {
        estadoEl.innerHTML = '<i class="las la-spinner la-spin"></i> ' + (mensaje || 'Cargando...');
        estadoEl.className = 'card-estado text-muted';
    } else if (estado === 'error') {
        estadoEl.innerHTML = `<i class="las la-exclamation-circle text-danger"></i> ${mensaje || 'Error'} <button class="btn btn-sm btn-link p-0 ml-2" onclick="retryCard('${tipo}')">Reintentar</button>`;
        estadoEl.className = 'card-estado text-danger';
    } else if (estado === 'empty') {
        estadoEl.innerHTML = '<i class="las la-info-circle text-muted"></i> ' + (mensaje || 'Sin datos disponibles');
        estadoEl.className = 'card-estado text-muted';
    } else {
        estadoEl.innerHTML = '';
        estadoEl.style.display = 'none';
    }
}

// Retry individual por card
function retryCard(tipo) {
    console.log(`🔄 Reintentando ${tipo}...`);
    mostrarEstadoCard(tipo, 'loading', 'Cargando...');
    
    const urls = {
        mesas: `${API_BASE}/mesas`,
        ventas: `${API_BASE}/boucher/fecha/${new Date().toISOString().split('T')[0]}`,
        platos: `${API_BASE}/comanda`,
        mozos: `${API_BASE}/mozos`,
        alertas: `${API_BASE}/mesas`
    };
    
    fetchConTimeout(urls[tipo], tipo)
        .then(result => {
            if (result.success) {
                const datos = { [tipo]: result.data };
                actualizarCards(datos);
            } else {
                mostrarEstadoCard(tipo, 'error', result.error || 'Error de conexión');
            }
        });
}

// ========== PRINCIPIO #4: LOADER GLOBAL CONTROLADO ==========
function mostrarLoaderGlobal() {
    loaderVisible = true;
    const loader = document.getElementById('loading');
    if (loader) {
        loader.style.display = 'flex';
        loader.style.opacity = '1';
        loader.classList.remove('loaded');
    }
    
    // Timeout máximo de 12 segundos
    setTimeout(() => {
        if (loaderVisible) {
            console.warn('⏱️ Timeout máximo alcanzado, ocultando loader');
            esconderLoaderGlobal();
            mostrarErrorGlobal('Tiempo de carga agotado. Algunos datos pueden no estar disponibles.');
        }
    }, LOADER_MAX_TIMEOUT);
}

function esconderLoaderGlobal() {
    loaderVisible = false;
    hideLoader(); // Llamar también a hideLoader para asegurar
}

// Función unificada para ocultar loader (múltiples formas)
function hideLoader() {
    const loader = document.getElementById('loading');
    if (loader) {
        // Forzar ocultación inmediata con múltiples métodos
        loader.style.opacity = '0';
        loader.style.transition = 'opacity 0.3s ease-out';
        loader.classList.add('loaded');
        loader.style.pointerEvents = 'none';
        loader.style.zIndex = '-1';
        
        // Ocultar después de la transición
        setTimeout(() => {
            loader.style.display = 'none';
            loader.style.visibility = 'hidden';
            loader.style.opacity = '0';
        }, 300);
    }
}

// ========== ERROR GLOBAL ==========
function mostrarErrorGlobal(mensaje) {
    const container = document.querySelector('.content-page .container-fluid');
    if (container) {
        let errorDiv = document.getElementById('error-global');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'error-global';
            errorDiv.className = 'alert alert-danger alert-dismissible fade show';
            errorDiv.style.cssText = 'margin-bottom: 20px;';
            container.insertBefore(errorDiv, container.firstChild);
        }
        errorDiv.innerHTML = `
            <i class="las la-exclamation-triangle"></i>
            <strong>Error:</strong> ${mensaje}
            <button type="button" class="close" onclick="this.parentElement.remove()">
                <span>&times;</span>
            </button>
            <button class="btn btn-sm btn-primary ml-3" onclick="location.reload()">
                <i class="las la-sync"></i> Recargar
            </button>
        `;
    }
}

// ========== ANIMACIONES ==========
function initializeCounterUp() {
    if (typeof Waypoint === 'undefined' || typeof counterUp === 'undefined') {
        console.warn('⚠️ CounterUp o Waypoint no disponibles');
        return;
    }
    
    const counters = document.querySelectorAll('.counter');
    counters.forEach(counter => {
        const waypoint = new Waypoint({
            element: counter,
            handler: function() {
                const target = parseInt(counter.getAttribute('data-target')) || 0;
                if (target > 0 && !counter.textContent.includes('--')) {
                    counterUp(counter, { duration: 2000, delay: 10 });
                }
                this.destroy();
            },
            offset: 'bottom-in-view',
        });
    });
}

function initializeProgressBars() {
    if (typeof Waypoint === 'undefined') return;
    
    const progressBars = document.querySelectorAll('.progress-bar-premium');
    progressBars.forEach(bar => {
        const waypoint = new Waypoint({
            element: bar,
            handler: function() {
                const currentValue = bar.getAttribute('aria-valuenow');
                if (currentValue && currentValue !== '0') {
                    bar.style.width = '0%';
                    bar.style.transition = 'width 2s ease';
                    setTimeout(() => {
                        bar.style.width = currentValue + '%';
                    }, 100);
                }
                this.destroy();
            },
            offset: 'bottom-in-view',
        });
    });
}

// ========== UTILIDADES ==========
// Logout se maneja en header.js para evitar conflictos
// Si header.js no está cargado, usar esta función como fallback
if (typeof window.logout === 'undefined') {
    window.logout = function() {
        console.log('🚪 Cerrando sesión (fallback)...');
        localStorage.removeItem('adminToken');
        localStorage.removeItem('theme');
        window.location.href = '/dashboard/login.html';
    };
}

function loadDashboardDataWithTimeout() {
    // Alias para compatibilidad
    cargarDatosSeguros()
        .then(datos => actualizarCards(datos))
        .catch(error => mostrarErrorGlobal(error.message));
}

// Función de refresh global (botón header)
function refreshDashboard() {
    console.log('🔄 Refrescando dashboard...');
    
    // Mostrar loading en todas las cards
    Object.keys(cardStates).forEach(tipo => {
        cardStates[tipo] = 'loading';
        mostrarEstadoCard(tipo, 'loading', 'Actualizando...');
    });
    
    // Cargar datos
    cargarDatosSeguros()
        .then(datos => {
            actualizarCards(datos);
            console.log('✅ Dashboard actualizado');
        })
        .catch(error => {
            console.error('❌ Error actualizando:', error);
            mostrarErrorGlobal('Error al actualizar datos: ' + error.message);
        });
}

// Sidebar toggle
document.addEventListener('DOMContentLoaded', () => {
    const wrapperMenu = document.querySelector('.wrapper-menu');
    const sidebar = document.querySelector('.iq-sidebar');
    
    if (wrapperMenu && sidebar) {
        wrapperMenu.addEventListener('click', () => {
            sidebar.classList.toggle('sidebar-open');
        });
    }
});

// Polyfill para AbortSignal.timeout
if (!AbortSignal.timeout) {
    AbortSignal.timeout = function(ms) {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
    };
}

// Múltiples fallbacks de seguridad
window.addEventListener('load', () => {
    // Fallback 1: Después de 2 segundos
    setTimeout(() => {
        console.log('🛡️ Fallback 2s: Ocultando loader');
        hideLoader();
        esconderLoaderGlobal();
    }, 2000);
    
    // Fallback 2: Después de 5 segundos
    setTimeout(() => {
        console.log('🛡️ Fallback 5s: Forzando ocultación de loader');
        hideLoader();
        esconderLoaderGlobal();
    }, 5000);
    
    // Fallback 3: Después de 10 segundos (máximo)
    setTimeout(() => {
        console.warn('🆘 Fallback final 10s: Forzando ocultación de loader');
        hideLoader();
        esconderLoaderGlobal();
        const loader = document.getElementById('loading');
        if (loader) {
            loader.remove(); // Eliminar completamente si persiste
        }
    }, 10000);
});

// Fallback adicional cuando la página está completamente cargada
if (document.readyState === 'complete') {
    hideLoader();
    esconderLoaderGlobal();
}
