/**
 * SIDEBAR.JS - Sidebar Premium 100% Funcional PosDash
 * Navegación SPA + Toggle + Submenús + Estados Visuales + Responsive
 */

(function() {
    'use strict';
    
    const SIDEBAR_STORAGE_KEY = 'sidebarState';
    const ACTIVE_PAGE_KEY = 'activePage';
    const OPEN_SUBMENUS_KEY = 'openSubmenus';
    
    let sidebar = null;
    let contentPage = null;
    let isInitialized = false;
    
    // ========== INICIALIZACIÓN ==========
    function init() {
        if (isInitialized) return;
        
        sidebar = document.querySelector('.iq-sidebar');
        contentPage = document.querySelector('.content-page');
        
        if (!sidebar) {
            console.warn('⚠️ Sidebar no encontrado');
            return;
        }
        
        console.log('📋 Inicializando sidebar completo...');
        console.log('📱 Ancho de ventana:', window.innerWidth);
        
        // INICIALIZAR MOBILE PRIMERO (antes de restaurar estado)
        if (window.innerWidth <= 991) {
            sidebar.classList.add('sidebar-mobile');
            sidebar.classList.remove('sidebar-open');
            console.log('📱 Modo móvil activado');
        }
        
        // Restaurar estado desde localStorage (solo en desktop)
        if (window.innerWidth > 991) {
            restoreSidebarState();
        }
        
        // Event delegation para mejor performance
        setupEventDelegation();
        
        // Navegación SPA
        setupSPANavigation();
        
        // Browser back/forward
        setupHistoryNavigation();
        
        // Responsive mobile (DEBE ir después de event delegation)
        setupMobileResponsive();
        
        // Scrollbar suave
        setupSmoothScrollbar();
        
        // Sincronizar con header hamburguesa (DEBE ir después de mobile)
        syncWithHeaderToggle();
        
        // Cargar página inicial
        loadInitialPage();
        
        isInitialized = true;
        console.log('✅ Sidebar inicializado correctamente');
    }
    
    // ========== EVENT DELEGATION ==========
    function setupEventDelegation() {
        // TOGGLE WRAPPER-MENU EXACTO COMO POSDASH (jQuery style)
        // Usar event delegation global como PosDash
        document.addEventListener('click', (e) => {
            const wrapperMenu = e.target.closest('.wrapper-menu');
            
            if (wrapperMenu) {
                e.preventDefault();
                e.stopPropagation();
                
                // Toggle clase open (como PosDash)
                wrapperMenu.classList.toggle('open');
                
                // Toggle body.sidebar-main (como PosDash)
                if (window.innerWidth > 991) {
                    // Desktop: toggle colapsar/expandir
                    document.body.classList.toggle('sidebar-main');
                    
                    // Guardar estado
                    if (document.body.classList.contains('sidebar-main')) {
                        saveSidebarState('collapsed');
                    } else {
                        saveSidebarState('expanded');
                    }
                } else {
                    // Mobile: toggle abrir/cerrar overlay
                    toggleSidebarMobile();
                }
                
                return;
            }
        });
        
        // Click en items del menú
        sidebar.addEventListener('click', (e) => {
            const link = e.target.closest('a[data-page]') || e.target.closest('a[href^="/dashboard"]');
            const submenuToggle = e.target.closest('[data-toggle="collapse"]');
            
            if (link && !link.hasAttribute('data-toggle')) {
                e.preventDefault();
                const page = link.getAttribute('data-page') || extractPageFromHref(link.getAttribute('href'));
                if (page) {
                    navigateToPage(page);
                }
            }
            
            if (submenuToggle) {
                e.preventDefault();
                toggleSubmenu(submenuToggle);
            }
        });
        
        // Click fuera del sidebar (mobile) para cerrar
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 991 && sidebar && !sidebar.contains(e.target) && !e.target.closest('.iq-top-navbar')) {
                if (sidebar.classList.contains('sidebar-open')) {
                    closeSidebarMobile();
                    // Remover clase open de wrapper-menu
                    const wrapperMenus = document.querySelectorAll('.wrapper-menu');
                    wrapperMenus.forEach(menu => menu.classList.remove('open'));
                }
            }
        });
    }
    
    // ========== TOGGLE COLAPSAR/EXPANDIR ==========
    function toggleSidebar() {
        if (!sidebar) return;
        
        const isCollapsed = sidebar.classList.contains('sidebar-mini');
        
        if (isCollapsed) {
            expandSidebar();
        } else {
            collapseSidebar();
        }
    }
    
    function collapseSidebar() {
        if (!sidebar) return;
        
        // Usar sidebar-main como PosDash
        document.body.classList.add('sidebar-main');
        
        // Toggle clase open en wrapper-menu
        const wrapperMenus = document.querySelectorAll('.wrapper-menu');
        wrapperMenus.forEach(menu => menu.classList.add('open'));
        
        // Cerrar todos los submenús al colapsar
        closeAllSubmenus();
        
        saveSidebarState('collapsed');
        console.log('📦 Sidebar colapsado');
    }
    
    function expandSidebar() {
        if (!sidebar) return;
        
        // Remover sidebar-main como PosDash
        document.body.classList.remove('sidebar-main');
        
        // Toggle clase open en wrapper-menu
        const wrapperMenus = document.querySelectorAll('.wrapper-menu');
        wrapperMenus.forEach(menu => menu.classList.remove('open'));
        
        // Restaurar submenús abiertos
        restoreOpenSubmenus();
        
        saveSidebarState('expanded');
        console.log('📖 Sidebar expandido');
    }
    
    // ========== SUBMENÚS ACORDEÓN ==========
    function toggleSubmenu(toggleElement) {
        if (!toggleElement) return;
        
        const targetId = toggleElement.getAttribute('href') || toggleElement.getAttribute('data-target');
        if (!targetId) return;
        
        const submenu = document.querySelector(targetId);
        if (!submenu) return;
        
        const isOpen = submenu.classList.contains('show');
        const arrow = toggleElement.querySelector('.iq-arrow-right, .arrow-active');
        
        // Cerrar todos los demás submenús (acordeón)
        closeAllSubmenus();
        
        if (!isOpen) {
            // Abrir este submenú
            submenu.classList.add('show');
            toggleElement.classList.remove('collapsed');
            toggleElement.setAttribute('aria-expanded', 'true');
            
            // Rotar flecha
            if (arrow) {
                arrow.style.transform = 'rotate(90deg)';
            }
            
            // Guardar estado
            saveOpenSubmenu(targetId);
        } else {
            // Cerrar este submenú
            submenu.classList.remove('show');
            toggleElement.classList.add('collapsed');
            toggleElement.setAttribute('aria-expanded', 'false');
            
            // Rotar flecha
            if (arrow) {
                arrow.style.transform = 'rotate(0deg)';
            }
            
            // Remover de guardados
            removeOpenSubmenu(targetId);
        }
    }
    
    function closeAllSubmenus() {
        const submenus = sidebar.querySelectorAll('.iq-submenu.show');
        submenus.forEach(submenu => {
            submenu.classList.remove('show');
            const toggle = sidebar.querySelector(`[href="#${submenu.id}"], [data-target="#${submenu.id}"]`);
            if (toggle) {
                toggle.classList.add('collapsed');
                toggle.setAttribute('aria-expanded', 'false');
                const arrow = toggle.querySelector('.iq-arrow-right, .arrow-active');
                if (arrow) {
                    arrow.style.transform = 'rotate(0deg)';
                }
            }
        });
    }
    
    // ========== NAVEGACIÓN SPA ==========
    function navigateToPage(page) {
        console.log('🧭 Navegando a:', page);
        
        // Actualizar estado activo
        setActiveMenuItem(page);
        
        // Si es dashboard, cargar contenido directamente
        if (page === 'dashboard' || page === 'index') {
            loadDashboardContent();
            updateHistory('/dashboard', { page: 'dashboard' });
            return;
        }
        
        // Cargar página desde /dashboard/pages/
        const pageUrl = `/dashboard/pages/${page}.html`;
        
        // Mostrar loader
        showPageLoader();
        
        fetch(pageUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }
                return response.text();
            })
            .then(html => {
                // Insertar HTML en content-page
                if (contentPage) {
                    contentPage.innerHTML = html;
                } else {
                    // Si no existe content-page, crear uno
                    const wrapper = document.querySelector('.wrapper');
                    if (wrapper) {
                        const newContent = document.createElement('div');
                        newContent.className = 'content-page';
                        newContent.innerHTML = html;
                        wrapper.appendChild(newContent);
                        contentPage = newContent;
                    }
                }
                
                // Ejecutar scripts de la página
                executePageScripts(page);
                
                // Actualizar history
                updateHistory(`/dashboard/${page}`, { page });
                
                // Guardar página activa
                localStorage.setItem(ACTIVE_PAGE_KEY, page);
                
                console.log('✅ Página cargada:', page);
            })
            .catch(error => {
                console.error('❌ Error cargando página:', error);
                showPageError(error.message);
            })
            .finally(() => {
                hidePageLoader();
            });
    }
    
    function loadDashboardContent() {
        // El dashboard ya está cargado, solo asegurar que esté visible
        if (contentPage) {
            contentPage.style.display = 'block';
        }
    }
    
    function executePageScripts(page) {
        // Buscar y ejecutar scripts inline en la página cargada
        const scripts = contentPage.querySelectorAll('script');
        scripts.forEach(script => {
            const newScript = document.createElement('script');
            if (script.src) {
                newScript.src = script.src;
            } else {
                newScript.textContent = script.textContent;
            }
            document.body.appendChild(newScript);
        });
        
        // Llamar a función específica de la página si existe
        if (typeof window[`pageLoaded_${page}`] === 'function') {
            window[`pageLoaded_${page}`]();
        }
    }
    
    function extractPageFromHref(href) {
        if (!href) return null;
        
        // Remover query params y hash
        href = href.split('?')[0].split('#')[0];
        
        // /dashboard/pages/mesas.html -> mesas
        const match = href.match(/\/pages\/([^\/]+)\.html/);
        if (match) return match[1];
        
        // /dashboard/mesas -> mesas
        const match2 = href.match(/\/dashboard\/([^\/]+)/);
        if (match2 && match2[1] !== 'pages') return match2[1];
        
        // /dashboard -> dashboard
        if (href === '/dashboard' || href === '/dashboard/' || href.endsWith('/dashboard')) return 'dashboard';
        
        return null;
    }
    
    // ========== ESTADOS VISUALES ==========
    function setActiveMenuItem(page) {
        // Remover active de todos
        const allItems = sidebar.querySelectorAll('.iq-menu > li');
        allItems.forEach(li => li.classList.remove('active'));
        
        // Agregar active al item correspondiente
        const activeLink = sidebar.querySelector(`a[data-page="${page}"], a[href*="${page}"]`);
        if (activeLink) {
            const parentLi = activeLink.closest('li');
            if (parentLi) {
                parentLi.classList.add('active');
            }
        }
    }
    
    // ========== HISTORY NAVIGATION ==========
    function setupHistoryNavigation() {
        window.addEventListener('popstate', (e) => {
            const state = e.state;
            if (state && state.page) {
                navigateToPage(state.page);
            } else {
                // Detectar página desde URL
                const path = window.location.pathname;
                const page = extractPageFromHref(path);
                if (page) {
                    navigateToPage(page);
                }
            }
        });
    }
    
    function updateHistory(url, state) {
        window.history.pushState(state, '', url);
    }
    
    // ========== RESPONSIVE MOBILE ==========
    function setupMobileResponsive() {
        // Inicializar estado móvil al cargar
        if (window.innerWidth <= 991) {
            sidebar.classList.add('sidebar-mobile');
            sidebar.classList.remove('sidebar-open');
        }
        
        // Toggle en mobile - MÚLTIPLES SELECTORES (como PosDash)
        const hamburgerBtns = document.querySelectorAll('.wrapper-menu, .iq-menu-bt-sidebar, .iq-menu-bt-sidebar .wrapper-menu');
        hamburgerBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (window.innerWidth <= 991) {
                    toggleSidebarMobile();
                } else {
                    toggleSidebar();
                }
            });
        });
        
        // Cerrar sidebar al hacer click en overlay (mobile) - DELEGACIÓN
        document.addEventListener('click', (e) => {
            const overlay = document.querySelector('.sidebar-overlay');
            if (overlay && overlay.contains(e.target)) {
                closeSidebarMobile();
            }
        });
        
        // Cerrar sidebar al hacer click fuera (mobile)
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 991 && sidebar && sidebar.classList.contains('sidebar-open')) {
                if (!sidebar.contains(e.target) && !e.target.closest('.iq-navbar-logo') && !e.target.closest('.iq-menu-bt-sidebar')) {
                    closeSidebarMobile();
                }
            }
        });
        
        // Swipe gestures
        setupSwipeGestures();
        
        // Media query para auto-colapsar en tablet (usando addEventListener moderno)
        const mediaQuery = window.matchMedia('(max-width: 991px)');
        
        // Función handler
        function handleMediaChange(mq) {
            if (mq.matches) {
                // Mobile: sidebar overlay
                sidebar.classList.add('sidebar-mobile');
                sidebar.classList.remove('sidebar-open');
                closeSidebarMobile(); // Asegurar que esté cerrado
            } else {
                // Desktop: sidebar normal
                sidebar.classList.remove('sidebar-mobile');
                sidebar.classList.remove('sidebar-open');
                // Remover overlay si existe
                const overlay = document.querySelector('.sidebar-overlay');
                if (overlay) {
                    overlay.style.display = 'none';
                }
            }
        }
        
        // Usar addEventListener si está disponible (moderno)
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleMediaChange);
        } else {
            // Fallback para navegadores antiguos
            mediaQuery.addListener(handleMediaChange);
        }
        
        // Ejecutar una vez al inicio
        handleMediaChange(mediaQuery);
    }
    
    function toggleSidebarMobile() {
        if (!sidebar) return;
        
        const isOpen = sidebar.classList.contains('sidebar-open');
        
        if (isOpen) {
            closeSidebarMobile();
        } else {
            openSidebarMobile();
        }
    }
    
    function openSidebarMobile() {
        if (!sidebar) return;
        
        console.log('📱 Abriendo sidebar móvil...');
        
        // Asegurar que sidebar tenga clase mobile
        sidebar.classList.add('sidebar-mobile');
        sidebar.classList.add('sidebar-open');
        document.body.classList.add('sidebar-open');
        document.body.style.overflow = 'hidden'; // Prevenir scroll del body
        
        // Crear overlay si no existe (como PosDash)
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
            
            // Agregar listener al overlay
            overlay.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeSidebarMobile();
            });
        }
        overlay.style.display = 'block';
        overlay.style.opacity = '1';
        
        console.log('✅ Sidebar móvil abierto');
    }
    
    function closeSidebarMobile() {
        if (!sidebar) return;
        
        console.log('📱 Cerrando sidebar móvil...');
        
        sidebar.classList.remove('sidebar-open');
        document.body.classList.remove('sidebar-open');
        document.body.style.overflow = ''; // Restaurar scroll
        
        // Remover clase open de todos los wrapper-menu (como PosDash)
        const wrapperMenus = document.querySelectorAll('.wrapper-menu');
        wrapperMenus.forEach(menu => menu.classList.remove('open'));
        
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.style.opacity = '0';
        }
        
        console.log('✅ Sidebar móvil cerrado');
    }
    
    function setupSwipeGestures() {
        let touchStartX = 0;
        let touchEndX = 0;
        
        document.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        });
        
        document.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        });
        
        function handleSwipe() {
            const swipeThreshold = 50;
            const diff = touchStartX - touchEndX;
            
            if (Math.abs(diff) > swipeThreshold) {
                if (diff > 0) {
                    // Swipe izquierda: cerrar sidebar
                    if (window.innerWidth <= 991 && sidebar && sidebar.classList.contains('sidebar-open')) {
                        closeSidebarMobile();
                    }
                } else {
                    // Swipe derecha: abrir sidebar
                    if (window.innerWidth <= 991 && sidebar && !sidebar.classList.contains('sidebar-open')) {
                        openSidebarMobile();
                    }
                }
            }
        }
    }
    
    // ========== SCROLLBAR SUAVE ==========
    function setupSmoothScrollbar() {
        const scrollbar = sidebar.querySelector('.data-scrollbar');
        if (!scrollbar) return;
        
        // Agregar clase para scrollbar custom
        scrollbar.classList.add('smooth-scrollbar');
        
        // Smooth scroll behavior
        scrollbar.style.scrollBehavior = 'smooth';
    }
    
    // ========== SYNC CON HEADER ==========
    // Ya está manejado por setupEventDelegation con .wrapper-menu
    // Esta función ya no es necesaria, pero la mantenemos por compatibilidad
    function syncWithHeaderToggle() {
        // El toggle ya está manejado globalmente en setupEventDelegation
        // Solo verificamos que los elementos existan
        const wrapperMenus = document.querySelectorAll('.wrapper-menu');
        console.log(`✅ ${wrapperMenus.length} botones wrapper-menu encontrados`);
    }
    
    // ========== LOADER Y ERRORES ==========
    function showPageLoader() {
        if (contentPage) {
            const loader = document.createElement('div');
            loader.id = 'page-loader';
            loader.className = 'page-loader';
            loader.innerHTML = '<div class="loader-spinner"><i class="las la-spinner la-spin"></i> Cargando...</div>';
            contentPage.appendChild(loader);
        }
    }
    
    function hidePageLoader() {
        const loader = document.getElementById('page-loader');
        if (loader) {
            loader.remove();
        }
    }
    
    function showPageError(message) {
        if (contentPage) {
            contentPage.innerHTML = `
                <div class="container-fluid">
                    <div class="row">
                        <div class="col-12">
                            <div class="alert alert-danger">
                                <h4><i class="las la-exclamation-triangle"></i> Error cargando página</h4>
                                <p>${message}</p>
                                <button class="btn btn-primary" onclick="window.location.reload()">Recargar</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    // ========== LOCALSTORAGE ==========
    function saveSidebarState(state) {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, state);
    }
    
    function restoreSidebarState() {
        const state = localStorage.getItem(SIDEBAR_STORAGE_KEY);
        if (state === 'collapsed' && sidebar && window.innerWidth > 991) {
            document.body.classList.add('sidebar-main');
            const wrapperMenus = document.querySelectorAll('.wrapper-menu');
            wrapperMenus.forEach(menu => menu.classList.add('open'));
        }
    }
    
    function saveOpenSubmenu(submenuId) {
        const open = getOpenSubmenus();
        if (!open.includes(submenuId)) {
            open.push(submenuId);
            localStorage.setItem(OPEN_SUBMENUS_KEY, JSON.stringify(open));
        }
    }
    
    function removeOpenSubmenu(submenuId) {
        const open = getOpenSubmenus();
        const index = open.indexOf(submenuId);
        if (index > -1) {
            open.splice(index, 1);
            localStorage.setItem(OPEN_SUBMENUS_KEY, JSON.stringify(open));
        }
    }
    
    function getOpenSubmenus() {
        const stored = localStorage.getItem(OPEN_SUBMENUS_KEY);
        return stored ? JSON.parse(stored) : [];
    }
    
    function restoreOpenSubmenus() {
        const open = getOpenSubmenus();
        open.forEach(submenuId => {
            const submenu = document.querySelector(submenuId);
            const toggle = sidebar.querySelector(`[href="${submenuId}"], [data-target="${submenuId}"]`);
            if (submenu && toggle) {
                submenu.classList.add('show');
                toggle.classList.remove('collapsed');
                toggle.setAttribute('aria-expanded', 'true');
                const arrow = toggle.querySelector('.iq-arrow-right, .arrow-active');
                if (arrow) {
                    arrow.style.transform = 'rotate(90deg)';
                }
            }
        });
    }
    
    // ========== LOAD INITIAL PAGE ==========
    function loadInitialPage() {
        // Detectar página desde URL
        const path = window.location.pathname;
        const page = extractPageFromHref(path);
        
        if (page && page !== 'dashboard') {
            navigateToPage(page);
        } else {
            // Dashboard por defecto
            setActiveMenuItem('dashboard');
            localStorage.setItem(ACTIVE_PAGE_KEY, 'dashboard');
        }
    }
    
    // ========== INICIALIZAR AL CARGAR ==========
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Exportar funciones globales
    window.toggleSidebar = toggleSidebar;
    window.navigateToPage = navigateToPage;
    
})();

