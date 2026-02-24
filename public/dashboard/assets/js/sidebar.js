/**
 * SIDEBAR.JS - Sidebar Premium v2.0
 * Proyecto: Las Gambusinas — Panel Admin Premium
 * 
 * Features:
 * - Toggle collapse/expand
 * - Mobile drawer
 * - Active state management
 * - Swipe gestures
 * - Persistent state
 */

(function() {
    'use strict';
    
    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        STORAGE_KEY: 'sidebarState',
        ACTIVE_PAGE_KEY: 'activePage',
        SIDEBAR_WIDTH: 270,
        SIDEBAR_COLLAPSED: 68,
        MOBILE_BREAKPOINT: 991
    };
    
    // ============================================
    // STATE
    // ============================================
    let state = {
        isCollapsed: false,
        isMobile: false,
        isOpen: false
    };
    
    // ============================================
    // DOM ELEMENTS
    // ============================================
    let sidebar = null;
    let overlay = null;
    let contentPage = null;
    let wrapperMenus = null;
    
    // ============================================
    // INITIALIZATION
    // ============================================
    function init() {
        sidebar = document.querySelector('.iq-sidebar');
        overlay = document.getElementById('sidebarOverlay') || createOverlay();
        contentPage = document.querySelector('.content-page');
        wrapperMenus = document.querySelectorAll('.wrapper-menu');
        
        if (!sidebar) {
            console.warn('Sidebar not found');
            return;
        }
        
        console.log('Sidebar initializing...');
        
        // Check initial state
        checkMobileState();
        
        // Restore state from localStorage
        restoreState();
        
        // Setup event listeners
        setupEventListeners();
        
        // Set active menu item
        setActiveMenuItem();
        
        console.log('Sidebar initialized');
    }
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    function setupEventListeners() {
        // Toggle buttons
        wrapperMenus.forEach(menu => {
            menu.addEventListener('click', handleToggle);
        });
        
        // Overlay click (close on mobile)
        if (overlay) {
            overlay.addEventListener('click', closeMobile);
        }
        
        // Click outside sidebar (mobile)
        document.addEventListener('click', handleOutsideClick);
        
        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && state.isOpen) {
                closeMobile();
            }
        });
        
        // Resize handler
        window.addEventListener('resize', debounce(checkMobileState, 100));
        
        // Menu item clicks
        sidebar.querySelectorAll('a[data-page]').forEach(link => {
            link.addEventListener('click', handleMenuClick);
        });
        
        // Touch gestures
        setupTouchGestures();
    }
    
    // ============================================
    // TOGGLE HANDLERS
    // ============================================
    function handleToggle(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (state.isMobile) {
            toggleMobile();
        } else {
            toggleCollapse();
        }
    }
    
    function toggleCollapse() {
        state.isCollapsed = !state.isCollapsed;
        
        if (state.isCollapsed) {
            document.body.classList.add('sidebar-main');
            wrapperMenus.forEach(menu => menu.classList.add('open'));
        } else {
            document.body.classList.remove('sidebar-main');
            wrapperMenus.forEach(menu => menu.classList.remove('open'));
        }
        
        saveState();
        console.log('Sidebar collapsed:', state.isCollapsed);
    }
    
    function collapseSidebar() {
        if (!state.isCollapsed) {
            state.isCollapsed = true;
            document.body.classList.add('sidebar-main');
            wrapperMenus.forEach(menu => menu.classList.add('open'));
            saveState();
        }
    }
    
    function expandSidebar() {
        if (state.isCollapsed) {
            state.isCollapsed = false;
            document.body.classList.remove('sidebar-main');
            wrapperMenus.forEach(menu => menu.classList.remove('open'));
            saveState();
        }
    }
    
    // ============================================
    // MOBILE HANDLERS
    // ============================================
    function toggleMobile() {
        if (state.isOpen) {
            closeMobile();
        } else {
            openMobile();
        }
    }
    
    function openMobile() {
        state.isOpen = true;
        sidebar.classList.add('sidebar-open');
        sidebar.classList.remove('sidebar-mobile-closed');
        
        if (overlay) {
            overlay.style.display = 'block';
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
            });
        }
        
        document.body.style.overflow = 'hidden';
        wrapperMenus.forEach(menu => menu.classList.add('open'));
        
        console.log('Sidebar opened (mobile)');
    }
    
    function closeMobile() {
        state.isOpen = false;
        sidebar.classList.remove('sidebar-open');
        sidebar.classList.add('sidebar-mobile-closed');
        
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 300);
        }
        
        document.body.style.overflow = '';
        wrapperMenus.forEach(menu => menu.classList.remove('open'));
        
        console.log('Sidebar closed (mobile)');
    }
    
    function handleOutsideClick(e) {
        if (!state.isMobile) return;
        
        const isClickInsideSidebar = sidebar.contains(e.target);
        const isClickOnToggle = Array.from(wrapperMenus).some(menu => menu.contains(e.target));
        
        if (!isClickInsideSidebar && !isClickOnToggle && state.isOpen) {
            closeMobile();
        }
    }
    
    function checkMobileState() {
        const wasMobile = state.isMobile;
        state.isMobile = window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;
        
        if (state.isMobile !== wasMobile) {
            if (state.isMobile) {
                // Entering mobile mode
                sidebar.classList.add('sidebar-mobile');
                document.body.classList.remove('sidebar-main');
            } else {
                // Exiting mobile mode
                sidebar.classList.remove('sidebar-mobile', 'sidebar-open');
                closeMobile();
                
                // Restore collapsed state if needed
                if (state.isCollapsed) {
                    document.body.classList.add('sidebar-main');
                }
            }
        }
    }
    
    // ============================================
    // MENU HANDLERS
    // ============================================
    function handleMenuClick(e) {
        const page = this.getAttribute('data-page');
        
        // If it's an external page (not dashboard), let the link navigate normally
        if (page && page !== 'dashboard') {
            // Store active page
            localStorage.setItem(CONFIG.ACTIVE_PAGE_KEY, page);
            return; // Let the default navigation happen
        }
        
        // For dashboard, prevent default and update state
        if (page === 'dashboard') {
            e.preventDefault();
            setActiveMenuItem();
            
            // Close mobile sidebar
            if (state.isMobile) {
                closeMobile();
            }
        }
    }
    
    function setActiveMenuItem() {
        const currentPath = window.location.pathname;
        const currentPage = localStorage.getItem(CONFIG.ACTIVE_PAGE_KEY) || 'dashboard';
        
        // Remove active from all
        sidebar.querySelectorAll('.iq-menu > li').forEach(li => {
            li.classList.remove('active');
        });
        
        // Find and activate the current item
        let activeFound = false;
        
        sidebar.querySelectorAll('a[data-page]').forEach(link => {
            const page = link.getAttribute('data-page');
            const href = link.getAttribute('href');
            
            if (!activeFound) {
                if (page === currentPage || 
                    (currentPage === 'dashboard' && (href === '/dashboard' || href === '/dashboard/')) ||
                    currentPath.includes(`/${page}`)) {
                    link.closest('li').classList.add('active');
                    activeFound = true;
                }
            }
        });
        
        // Default to dashboard if nothing found
        if (!activeFound) {
            const dashboardLink = sidebar.querySelector('a[data-page="dashboard"]');
            if (dashboardLink) {
                dashboardLink.closest('li').classList.add('active');
            }
        }
    }
    
    // ============================================
    // TOUCH GESTURES
    // ============================================
    function setupTouchGestures() {
        let touchStartX = 0;
        let touchEndX = 0;
        const SWIPE_THRESHOLD = 50;
        
        document.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        
        document.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        }, { passive: true });
        
        function handleSwipe() {
            if (!state.isMobile) return;
            
            const diff = touchStartX - touchEndX;
            
            if (Math.abs(diff) > SWIPE_THRESHOLD) {
                if (diff > 0) {
                    // Swipe left - close sidebar
                    if (state.isOpen) {
                        closeMobile();
                    }
                } else {
                    // Swipe right - open sidebar
                    if (!state.isOpen && touchStartX < 30) {
                        openMobile();
                    }
                }
            }
        }
    }
    
    // ============================================
    // PERSISTENCE
    // ============================================
    function saveState() {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
            isCollapsed: state.isCollapsed
        }));
    }
    
    function restoreState() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                state.isCollapsed = parsed.isCollapsed || false;
                
                if (state.isCollapsed && !state.isMobile) {
                    document.body.classList.add('sidebar-main');
                    wrapperMenus.forEach(menu => menu.classList.add('open'));
                }
            }
        } catch (e) {
            console.warn('Error restoring sidebar state:', e);
        }
    }
    
    // ============================================
    // UTILITIES
    // ============================================
    function createOverlay() {
        const overlayEl = document.createElement('div');
        overlayEl.className = 'sidebar-overlay';
        overlayEl.id = 'sidebarOverlay';
        document.body.appendChild(overlayEl);
        return overlayEl;
    }
    
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // ============================================
    // PUBLIC API
    // ============================================
    window.Sidebar = {
        toggle: handleToggle,
        collapse: collapseSidebar,
        expand: expandSidebar,
        open: openMobile,
        close: closeMobile,
        setActiveItem: setActiveMenuItem
    };
    
    // ============================================
    // INITIALIZE
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
