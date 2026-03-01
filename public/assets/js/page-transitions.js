/**
 * Las Gambusinas - Page Transitions JS
 * Sistema de animaciones de transicion entre paginas
 * Basado en Aprycot Template + Animaciones personalizadas
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  const CONFIG = {
    defaultTransition: 'slide-right', // fade, slide-right, slide-left, scale, slide-up, bounce
    transitionDuration: 400,
    loaderDuration: 300,
    enableOnNavClick: true,
    enableOnSidebarClick: true,
    animateContentOnLoad: true,
    excludedLinks: [
      '#',
      'javascript:',
      'mailto:',
      'tel:',
      'http://localhost:3000/login',
      '/login'
    ]
  };

  // ============================================
  // STATE
  // ============================================
  let isTransitioning = false;
  let currentPage = window.location.pathname;
  let navigationHistory = [currentPage];

  // ============================================
  // CREATE OVERLAY ELEMENT
  // ============================================
  function createOverlay() {
    if (document.getElementById('page-transition-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'page-transition-overlay';
    overlay.className = 'page-transition-overlay';
    overlay.innerHTML = `
      <div class="transition-loader"></div>
    `;
    document.body.appendChild(overlay);
  }

  // ============================================
  // SHOW TRANSITION LOADER
  // ============================================
  function showLoader(callback) {
    if (isTransitioning) return;
    isTransitioning = true;

    const overlay = document.getElementById('page-transition-overlay');
    if (!overlay) {
      createOverlay();
      return showLoader(callback);
    }

    overlay.classList.remove('fade-out');
    overlay.classList.add('active');

    if (typeof callback === 'function') {
      setTimeout(callback, CONFIG.loaderDuration);
    }
  }

  // ============================================
  // HIDE TRANSITION LOADER
  // ============================================
  function hideLoader() {
    const overlay = document.getElementById('page-transition-overlay');
    if (!overlay) return;

    overlay.classList.add('fade-out');
    
    setTimeout(() => {
      overlay.classList.remove('active', 'fade-out');
      isTransitioning = false;
    }, CONFIG.loaderDuration);
  }

  // ============================================
  // PAGE TRANSITION
  // ============================================
  function navigateTo(url, transition = CONFIG.defaultTransition) {
    if (isTransitioning) return false;

    // Check if it's an excluded link
    const isExcluded = CONFIG.excludedLinks.some(excluded => 
      url.includes(excluded)
    );
    
    if (isExcluded) {
      window.location.href = url;
      return true;
    }

    // Check if it's an external link
    if (url.startsWith('http') && !url.includes(window.location.host)) {
      window.open(url, '_blank');
      return true;
    }

    // Check if it's same page
    if (url === window.location.pathname || url === window.location.href) {
      return false;
    }

    // Determine transition direction based on navigation history
    const historyIndex = navigationHistory.indexOf(url);
    if (historyIndex !== -1 && historyIndex < navigationHistory.length - 1) {
      // Going back in history - use left transition
      transition = 'slide-left';
      navigationHistory = navigationHistory.slice(0, historyIndex + 1);
    } else {
      // Going forward - use right transition
      transition = 'slide-right';
      navigationHistory.push(url);
    }

    showLoader(() => {
      // Store transition type for next page
      sessionStorage.setItem('pageTransition', transition);
      sessionStorage.setItem('pageTransitionTime', Date.now().toString());
      
      // Navigate
      window.location.href = url;
    });

    return true;
  }

  // ============================================
  // ANIMATE PAGE ENTRY
  // ============================================
  function animatePageEntry() {
    const transition = sessionStorage.getItem('pageTransition') || 'fade';
    const transitionTime = parseInt(sessionStorage.getItem('pageTransitionTime') || '0');
    
    // Only apply transition if it was recent (within 2 seconds)
    if (Date.now() - transitionTime > 2000) {
      document.body.style.opacity = '1';
      return;
    }

    // Clear stored transition
    sessionStorage.removeItem('pageTransition');
    sessionStorage.removeItem('pageTransitionTime');

    // Apply entry animation to main content
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.classList.add(`page-enter-${transition}`);
      
      // Remove class after animation
      setTimeout(() => {
        mainContent.classList.remove(`page-enter-${transition}`);
      }, CONFIG.transitionDuration);
    }

    // Animate content elements
    animateContentElements();
  }

  // ============================================
  // ANIMATE CONTENT ELEMENTS
  // ============================================
  function animateContentElements() {
    // Animate KPI cards
    const kpiCards = document.querySelectorAll('.bg-bg-card');
    kpiCards.forEach((card, index) => {
      if (index < 5) { // Only first 5 cards
        card.classList.add('kpi-card-animate');
        setTimeout(() => {
          card.classList.remove('kpi-card-animate');
        }, 500 + (index * 100));
      }
    });

    // Animate table rows
    const tableRows = document.querySelectorAll('tbody tr');
    tableRows.forEach((row, index) => {
      if (index < 10) {
        row.classList.add('table-row-animate');
        setTimeout(() => {
          row.classList.remove('table-row-animate');
        }, 300 + (index * 50));
      }
    });

    // Animate sidebar items
    const sidebarItems = document.querySelectorAll('.sidebar-item, nav button');
    sidebarItems.forEach((item, index) => {
      item.classList.add('sidebar-item-animate');
      setTimeout(() => {
        item.classList.remove('sidebar-item-animate');
      }, 300 + (index * 30));
    });

    // Animate charts
    const chartContainers = document.querySelectorAll('canvas');
    chartContainers.forEach(canvas => {
      const parent = canvas.parentElement;
      if (parent) {
        parent.classList.add('chart-container-animate');
        setTimeout(() => {
          parent.classList.remove('chart-container-animate');
        }, 800);
      }
    });
  }

  // ============================================
  // INTERCEPT LINK CLICKS
  // ============================================
  function interceptLinks() {
    document.addEventListener('click', (e) => {
      // Find closest anchor
      const link = e.target.closest('a');
      
      if (!link) return;
      
      const href = link.getAttribute('href');
      
      // Skip if no href or excluded
      if (!href || href === '#') return;
      
      // Skip if target="_blank"
      if (link.target === '_blank') return;
      
      // Skip if modifier keys
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      
      // Skip if it's a hash link on same page
      if (href.startsWith('#') && !href.includes('.html')) {
        return;
      }

      // Skip download links
      if (link.hasAttribute('download')) return;

      // Check if it's an internal link
      const isInternal = href.startsWith('/') || 
                        href.startsWith('./') || 
                        href.startsWith('../') ||
                        href.includes(window.location.host) ||
                        (!href.startsWith('http') && !href.startsWith('//'));
      
      if (isInternal) {
        e.preventDefault();
        navigateTo(href);
      }
    }, true);
  }

  // ============================================
  // INTERCEPT SIDEBAR NAVIGATION (Alpine.js)
  // ============================================
  function interceptAlpineNav() {
    // Watch for Alpine.js page changes
    document.addEventListener('alpine:init', () => {
      Alpine.magic('navigate', (el) => (url) => {
        navigateTo(url);
      });
    });

    // Override sidebar clicks in Alpine context
    setTimeout(() => {
      const sidebarButtons = document.querySelectorAll('nav button[data-nav], [x-data] button');
      sidebarButtons.forEach(btn => {
        // These are handled by Alpine.js @click, we just add transition effect
      });
    }, 1000);
  }

  // ============================================
  // HANDLE BROWSER BACK/FORWARD
  // ============================================
  function handlePopState() {
    window.addEventListener('popstate', () => {
      const url = window.location.pathname;
      const historyIndex = navigationHistory.indexOf(url);
      
      if (historyIndex !== -1) {
        navigationHistory = navigationHistory.slice(0, historyIndex + 1);
      }
      
      // Reload page with transition
      sessionStorage.setItem('pageTransition', 'slide-left');
      sessionStorage.setItem('pageTransitionTime', Date.now().toString());
      location.reload();
    });
  }

  // ============================================
  // COUNTER ANIMATION
  // ============================================
  function animateCounters() {
    const counters = document.querySelectorAll('[data-counter]');
    
    counters.forEach(counter => {
      const target = parseInt(counter.getAttribute('data-counter'));
      const duration = parseInt(counter.getAttribute('data-duration')) || 1000;
      const start = 0;
      const startTime = performance.now();
      
      function updateCounter(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (ease-out)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        const current = Math.floor(start + (target - start) * easeOut);
        counter.textContent = current.toLocaleString('es-PE');
        
        if (progress < 1) {
          requestAnimationFrame(updateCounter);
        } else {
          counter.textContent = target.toLocaleString('es-PE');
        }
      }
      
      requestAnimationFrame(updateCounter);
    });
  }

  // ============================================
  // PROGRESS BAR ANIMATION
  // ============================================
  function animateProgressBars() {
    const progressBars = document.querySelectorAll('[data-progress]');
    
    progressBars.forEach(bar => {
      const target = bar.getAttribute('data-progress');
      bar.style.width = '0%';
      
      setTimeout(() => {
        bar.style.transition = 'width 1s ease-out';
        bar.style.width = target + '%';
      }, 100);
    });
  }

  // ============================================
  // SKELETON LOADING
  // ============================================
  function showSkeletonLoading(container, count = 3) {
    const skeletonHTML = `
      <div class="skeleton skeleton-card mb-4"></div>
    `.repeat(count);
    
    container.innerHTML = skeletonHTML;
  }

  function hideSkeletonLoading(container, content) {
    container.innerHTML = content;
    animateContentElements();
  }

  // ============================================
  // NOTIFICATION ANIMATION
  // ============================================
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed top-20 right-4 z-50 p-4 rounded-lg shadow-lg notification-enter ${
      type === 'success' ? 'bg-st-preparado' : 
      type === 'error' ? 'bg-st-pagado' : 
      type === 'warning' ? 'bg-st-esperando' : 'bg-st-pedido'
    }`;
    notification.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="text-lg">${
          type === 'success' ? '✓' : 
          type === 'error' ? '✕' : 
          type === 'warning' ? '⚠' : 'ℹ'
        }</span>
        <span class="text-white text-sm">${message}</span>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.remove('notification-enter');
      notification.classList.add('notification-leave');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // ============================================
  // INITIALIZE
  // ============================================
  function init() {
    // Create overlay
    createOverlay();
    
    // Hide initial loader
    document.addEventListener('DOMContentLoaded', () => {
      // Small delay for initial page load
      setTimeout(() => {
        hideLoader();
        animatePageEntry();
      }, 100);
    });
    
    // Intercept link clicks
    interceptLinks();
    
    // Handle browser navigation
    handlePopState();
    
    // Intercept Alpine.js navigation
    interceptAlpineNav();
    
    // Set initial body opacity
    document.body.style.opacity = '1';
    
    console.log('🎨 Page Transitions initialized');
  }

  // ============================================
  // EXPOSE API
  // ============================================
  window.PageTransitions = {
    navigate: navigateTo,
    showLoader,
    hideLoader,
    animateEntry: animatePageEntry,
    animateCounters,
    animateProgressBars,
    showNotification,
    showSkeleton: showSkeletonLoading,
    hideSkeleton: hideSkeletonLoading,
    isTransitioning: () => isTransitioning
  };

  // Start
  init();

})();
