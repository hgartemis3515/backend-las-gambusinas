/**
 * ============================================
 * COSMOS-STYLE SEARCH BAR
 * Las Gambusinas Dashboard
 * ============================================
 * 
 * Barra de búsqueda estilo Cosmos.so con:
 * - Glassmorphism UI
 * - Command Palette (⌘K / Ctrl+K)
 * - Búsqueda unificada de mesas, comandas, platos, clientes
 * - Navegación por teclado
 * - Sidebar de categorías con navegación contextual
 */

class CosmosSearch {
  constructor(options = {}) {
    this.options = {
      placeholder: 'Buscar platos, mesas, comandas, clientes, bouchers...',
      shortcutKey: 'k',
      apiEndpoint: '/api/search',
      maxResults: 8,
      ...options
    };
    
    this.isOpen = false;
    this.query = '';
    this.results = [];
    this.selectedIndex = 0;
    this.activeCategory = 'comandas'; // Categoría activa en el sidebar
    
    // Placeholders dinámicos por categoría
    this.categoryPlaceholders = {
      comandas: 'Buscar comandas por número, mesa o cliente...',
      platos: 'Buscar platos por nombre, categoría o código...',
      mesas: 'Buscar mesas por número o estado...',
      bouchers: 'Buscar bouchers por código o estado...',
      reportes: 'Buscar reportes por fecha o tipo...',
      all: 'Buscar por nombre, mesa, #comanda, código boucher...'
    };
    
    // Configuración del sidebar
    this.sidebarItems = [
      { id: 'comandas', label: 'Comandas', icon: 'clipboard-list', navigable: true },
      { id: 'platos', label: 'Platos', icon: 'utensils', navigable: true },
      { id: 'mesas', label: 'Mesas', icon: 'grid-3x3', navigable: true },
      { id: 'bouchers', label: 'Bouchers', icon: 'ticket', navigable: true },
      { id: 'reportes', label: 'Reportes', icon: 'bar-chart-2', navigable: true },
      { id: 'configuracion', label: 'Configuración', icon: 'settings', navigable: false, isExternal: true }
    ];
    
    this.dataCache = {
      platos: [],
      mesas: [],
      clientes: [],
      comandas: [],
      bouchers: []
    };
    
    // Elementos DOM
    this.triggerEl = null;
    this.modalEl = null;
    this.inputEl = null;
    this.listEl = null;
    this.sidebarEl = null;
    
    this.init();
  }
  
  init() {
    this.createModal();
    this.bindEvents();
    this.loadData();
  }
  
  // ==========================================
  // CREATE MODAL
  // ==========================================
  
  createModal() {
    // Crear container del modal con la nueva estructura
    const modalHTML = `
      <div class="cosmos-command-palette" id="cosmos-command-palette">
        <div class="cosmos-command-container">
          <!-- Header (Buscador) - 100% ancho superior -->
          <div class="cosmos-command-header">
            <span class="search-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </span>
            <input 
              type="text" 
              class="cosmos-command-input" 
              id="cosmos-command-input"
              placeholder="Buscar comandas por número, mesa o cliente..."
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
            >
            <button class="cosmos-command-close" id="cosmos-command-close" title="Cerrar (Esc)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          
          <!-- Cuerpo dividido (Flex Row) -->
          <div class="cosmos-command-body">
            <!-- Sidebar (Izquierda) - w-56 -->
            <aside class="cosmos-command-sidebar" id="cosmos-command-sidebar">
              <nav class="cosmos-sidebar-nav">
                ${this.renderSidebarItems()}
              </nav>
            </aside>
            
            <!-- Área de Resultados (Derecha) - flex-1 -->
            <div class="cosmos-command-results" id="cosmos-command-list">
              <!-- Los resultados se renderizan dinámicamente -->
            </div>
          </div>
          
          <!-- Footer (Atajos) - 100% ancho inferior -->
          <div class="cosmos-command-footer">
            <div class="cosmos-command-footer-hint">
              <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
              <span><kbd>↵</kbd> seleccionar</span>
              <span><kbd>Esc</kbd> cerrar</span>
            </div>
            <div class="cosmos-command-footer-hint">
              <span><kbd>Ctrl</kbd>+<kbd>K</kbd> abrir búsqueda</span>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Insertar en el DOM
    const container = document.createElement('div');
    container.innerHTML = modalHTML;
    document.body.appendChild(container.firstElementChild);
    
    // Referencias a elementos
    this.modalEl = document.getElementById('cosmos-command-palette');
    this.inputEl = document.getElementById('cosmos-command-input');
    this.listEl = document.getElementById('cosmos-command-list');
    this.sidebarEl = document.getElementById('cosmos-command-sidebar');
    this.closeBtn = document.getElementById('cosmos-command-close');
  }
  
  // Renderizar items del sidebar
  renderSidebarItems() {
    return this.sidebarItems.map(item => {
      const isActive = this.activeCategory === item.id;
      const activeClass = isActive ? 'cosmos-sidebar-item-active' : '';
      const externalIcon = item.isExternal ? `
        <svg class="cosmos-external-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      ` : '';
      
      return `
        <button 
          class="cosmos-sidebar-item ${activeClass}" 
          data-category="${item.id}"
          data-navigable="${item.navigable}"
          data-external="${item.isExternal || false}"
          title="${item.label}"
        >
          <span class="cosmos-sidebar-icon">
            ${this.getIcon(item.icon)}
          </span>
          <span class="cosmos-sidebar-label">${item.label}</span>
          ${externalIcon}
        </button>
      `;
    }).join('');
  }
  
  // Obtener iconos SVG de Lucide
  getIcon(name) {
    const icons = {
      'clipboard-list': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
        <path d="M12 11h4"/>
        <path d="M12 16h4"/>
        <path d="M8 11h.01"/>
        <path d="M8 16h.01"/>
      </svg>`,
      'utensils': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>
        <path d="M7 2v20"/>
        <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
      </svg>`,
      'grid-3x3': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
      </svg>`,
      'ticket': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
        <path d="M13 5v2"/>
        <path d="M13 17v2"/>
        <path d="M13 11v2"/>
      </svg>`,
      'bar-chart-2': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>`,
      'settings': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
      </svg>`
    };
    return icons[name] || '';
  }
  
  // ==========================================
  // BIND EVENTS
  // ==========================================
  
  bindEvents() {
    // Teclado global: Ctrl+K o Cmd+K para abrir
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === this.options.shortcutKey) {
        e.preventDefault();
        this.toggle();
      }
      
      // Escape para cerrar
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
    
    // Click en el trigger (barra flotante)
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('.cosmos-search-box');
      if (trigger) {
        e.preventDefault();
        this.open();
      }
    });
    
    // Click en backdrop para cerrar
    this.modalEl?.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.close();
      }
    });
    
    // Botón cerrar
    this.closeBtn?.addEventListener('click', () => this.close());
    
    // Input de búsqueda
    this.inputEl?.addEventListener('input', (e) => {
      this.query = e.target.value;
      this.search();
    });
    
    // Navegación por teclado dentro del modal
    this.inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.navigateResults(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.navigateResults(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.selectResult();
      } else if (e.key === 'Tab') {
        // Navegación entre sidebar y resultados con Tab
        e.preventDefault();
        this.navigateSidebar(e.shiftKey ? -1 : 1);
      }
    });
    
    // Click en items del sidebar
    this.sidebarEl?.addEventListener('click', (e) => {
      const item = e.target.closest('.cosmos-sidebar-item');
      if (item) {
        this.handleSidebarClick(item);
      }
    });
    
    // Hover en sidebar items
    this.sidebarEl?.querySelectorAll('.cosmos-sidebar-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        // Solo actualizar visual en hover, no cambiar categoría
      });
    });
  }
  
  // Manejar click en sidebar
  handleSidebarClick(item) {
    const category = item.dataset.category;
    const navigable = item.dataset.navigable === 'true';
    const isExternal = item.dataset.external === 'true';
    
    // Si es Configuración (enlace externo), cerrar modal y redirigir
    if (isExternal || !navigable) {
      this.handleNavigateToConfig();
      return;
    }
    
    // Si es navegable, actualizar categoría
    this.setActiveCategory(category);
  }
  
  // Establecer categoría activa
  setActiveCategory(category) {
    this.activeCategory = category;
    
    // Actualizar placeholder del input
    this.inputEl.placeholder = this.categoryPlaceholders[category] || this.categoryPlaceholders.all;
    
    // Re-renderizar sidebar para actualizar estado visual
    this.sidebarEl.querySelector('.cosmos-sidebar-nav').innerHTML = this.renderSidebarItems();
    
    // Re-bind events para el nuevo sidebar
    this.sidebarEl.querySelectorAll('.cosmos-sidebar-item').forEach(item => {
      item.addEventListener('click', () => this.handleSidebarClick(item));
    });
    
    // Re-renderizar resultados para la nueva categoría
    if (!this.query.trim()) {
      this.renderDefaultResults();
    } else {
      this.search();
    }
    
    // Focus en el input
    this.inputEl?.focus();
  }
  
  // Navegación por teclado en sidebar
  navigateSidebar(direction) {
    const items = this.sidebarEl.querySelectorAll('.cosmos-sidebar-item');
    const currentIndex = Array.from(items).findIndex(item => item.dataset.category === this.activeCategory);
    let newIndex = currentIndex + direction;
    
    if (newIndex < 0) newIndex = items.length - 1;
    if (newIndex >= items.length) newIndex = 0;
    
    const newItem = items[newIndex];
    if (newItem) {
      const category = newItem.dataset.category;
      const isExternal = newItem.dataset.external === 'true';
      
      if (!isExternal) {
        this.setActiveCategory(category);
      }
    }
  }
  
  // Manejar navegación a configuración
  handleNavigateToConfig() {
    this.close();
    // Redirección a la página de configuración
    setTimeout(() => {
      window.location.href = '/configuracion.html';
    }, 150);
  }
  
  // ==========================================
  // OPEN / CLOSE / TOGGLE
  // ==========================================
  
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.modalEl?.classList.add('open');
    this.inputEl?.focus();
    this.selectedIndex = 0;
    
    // Resetear a categoría por defecto
    this.activeCategory = 'comandas';
    this.inputEl.placeholder = this.categoryPlaceholders.comandas;
    
    // Re-renderizar sidebar
    this.sidebarEl.querySelector('.cosmos-sidebar-nav').innerHTML = this.renderSidebarItems();
    this.sidebarEl.querySelectorAll('.cosmos-sidebar-item').forEach(item => {
      item.addEventListener('click', () => this.handleSidebarClick(item));
    });
    
    // Renderizar resultados iniciales (recientes/populares)
    if (!this.query) {
      this.renderDefaultResults();
    }
  }
  
  close() {
    this.isOpen = false;
    this.modalEl?.classList.remove('open');
    this.inputEl.value = '';
    this.query = '';
    this.results = [];
  }
  
  toggle() {
    this.isOpen ? this.close() : this.open();
  }
  
  // ==========================================
  // LOAD DATA
  // ==========================================
  
  async loadData() {
    try {
      // Intentar cargar datos desde la API
      const [platos, mesas, clientes, comandas, bouchers] = await Promise.all([
        this.fetchData('/api/platos?limit=50'),
        this.fetchData('/api/mesas'),
        this.fetchData('/api/clientes?limit=50'),
        this.fetchData('/api/comanda?limit=30'),
        this.fetchData('/api/boucher?limit=50')
      ]);
      
      this.dataCache.platos = platos || [];
      this.dataCache.mesas = mesas || [];
      this.dataCache.clientes = clientes || [];
      this.dataCache.comandas = comandas || [];
      this.dataCache.bouchers = bouchers || [];
    } catch (error) {
      console.warn('CosmosSearch: Error loading data, using cache', error);
    }
  }
  
  async fetchData(endpoint) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken')}`
        }
      });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) ? data : (data.platos || data.mesas || data.clientes || data.comandas || data.datos || []);
    } catch {
      return null;
    }
  }
  
  // ==========================================
  // SEARCH
  // ==========================================
  
  search() {
    if (!this.query.trim()) {
      this.renderDefaultResults();
      return;
    }
    
    const q = this.query.toLowerCase().trim();
    const results = [];
    
    // Filtrar búsqueda según categoría activa
    const searchInCategory = (category) => {
      switch (category) {
        case 'comandas':
          this.searchComandas(q, results);
          break;
        case 'platos':
          this.searchPlatos(q, results);
          break;
        case 'mesas':
          this.searchMesas(q, results);
          break;
        case 'bouchers':
          this.searchBouchers(q, results);
          break;
        case 'reportes':
          // Los reportes son acciones, no datos
          break;
        default:
          // Buscar en todos lados
          this.searchPlatos(q, results);
          this.searchMesas(q, results);
          this.searchClientes(q, results);
          this.searchComandas(q, results);
          this.searchBouchers(q, results);
      }
    };
    
    searchInCategory(this.activeCategory);
    
    this.results = results.slice(0, this.options.maxResults);
    this.selectedIndex = 0;
    this.renderResults();
  }
  
  // Búsquedas específicas por categoría
  searchPlatos(q, results) {
    this.dataCache.platos.forEach(item => {
      const name = (item.nombre || item.name || '').toLowerCase();
      const code = (item.codigo || item._id || '').toLowerCase();
      const category = (item.categoria || item.category || '').toLowerCase();
      
      if (name.includes(q) || code.includes(q) || category.includes(q)) {
        results.push({
          type: 'plato',
          id: item._id,
          title: item.nombre || item.name,
          subtitle: `${item.categoria || 'Sin categoría'} · S/.${item.precio || 0}`,
          icon: '🍽️',
          url: `/platos.html?edit=${item._id}`,
          badge: 'Plato',
          badgeClass: 'cosmos-badge-plato'
        });
      }
    });
  }
  
  searchMesas(q, results) {
    this.dataCache.mesas.forEach(item => {
      const num = String(item.numMesa || item.numero || item.num || '').toLowerCase();
      const area = (item.area?.nombre || item.area || '').toLowerCase();
      const estado = (item.estado || '').toLowerCase();
      
      if (num.includes(q) || area.includes(q) || estado.includes(q)) {
        results.push({
          type: 'mesa',
          id: item._id,
          title: `Mesa ${item.numMesa || item.numero}`,
          subtitle: `${item.area?.nombre || item.area || 'Sin área'} · ${this.normalizeEstado(item.estado)}`,
          icon: '🪑',
          url: `/comandas.html?mesa=${item._id}`,
          badge: 'Mesa',
          badgeClass: 'cosmos-badge-mesa'
        });
      }
    });
  }
  
  searchClientes(q, results) {
    this.dataCache.clientes.forEach(item => {
      const name = (item.nombre || item.name || '').toLowerCase();
      const email = (item.email || '').toLowerCase();
      const phone = (item.telefono || item.phone || '').toLowerCase();
      
      if (name.includes(q) || email.includes(q) || phone.includes(q)) {
        results.push({
          type: 'cliente',
          id: item._id,
          title: item.nombre || item.name,
          subtitle: `${item.email || item.telefono || 'Sin contacto'}`,
          icon: '👤',
          url: `/clientes.html?edit=${item._id}`,
          badge: 'Cliente',
          badgeClass: 'cosmos-badge-cliente'
        });
      }
    });
  }
  
  searchComandas(q, results) {
    this.dataCache.comandas.forEach(item => {
      const num = String(item.comandaNumber || item._id?.slice(-4) || '').toLowerCase();
      const numWithHash = '#' + num;
      const mesa = String(item.mesa?.numMesa || item.mesaNum || '').toLowerCase();
      const cliente = (item.cliente?.nombre || item.cliente || '').toLowerCase();
      
      if (num.includes(q) || numWithHash.includes(q) || mesa.includes(q) || cliente.includes(q)) {
        results.push({
          type: 'comanda',
          id: item._id,
          title: `Comanda #${item.comandaNumber || item._id?.slice(-4)}`,
          subtitle: `Mesa ${item.mesa?.numMesa || item.mesaNum || '—'} · ${item.status || item.estado || 'Activa'}`,
          icon: '📋',
          url: `/comandas.html?id=${item._id}`,
          badge: 'Comanda',
          badgeClass: 'cosmos-badge-comanda'
        });
      }
    });
  }
  
  searchBouchers(q, results) {
    this.dataCache.bouchers.forEach(item => {
      const codigo = (item.codigo || item._id || '').toLowerCase();
      const estado = (item.estado || item.status || '').toLowerCase();
      
      if (codigo.includes(q) || estado.includes(q)) {
        results.push({
          type: 'boucher',
          id: item._id,
          title: `Boucher ${item.codigo || item._id?.slice(-8)}`,
          subtitle: `${item.descuento ? item.descuento + '% descuento' : 'Sin descuento'} · ${item.estado || 'Activo'}`,
          icon: '🎫',
          url: `/bouchers.html?codigo=${item.codigo || item._id}`,
          badge: 'Boucher',
          badgeClass: 'cosmos-badge-boucher'
        });
      }
    });
  }
  
  normalizeEstado(estado) {
    const map = {
      'libre': 'Libre',
      'ocupada': 'Ocupada',
      'pedido': 'Pedido',
      'preparado': 'Preparado',
      'pagado': 'Pagado',
      'reservado': 'Reservado'
    };
    return map[estado?.toLowerCase()] || estado || 'Libre';
  }
  
  // ==========================================
  // RENDER
  // ==========================================
  
  renderDefaultResults() {
    // Acciones rápidas según categoría activa
    const categoryActions = {
      comandas: [
        { type: 'accion', title: 'Nueva Comanda', subtitle: 'Crear una nueva comanda', icon: '➕', url: '/comandas.html?new=true', badge: 'Acción', badgeClass: 'cosmos-badge-accion' },
        { type: 'accion', title: 'Ver Comandas Activas', subtitle: 'Gestionar comandas activas', icon: '📋', url: '/comandas.html', badge: 'Acción', badgeClass: 'cosmos-badge-accion' }
      ],
      platos: [
        { type: 'accion', title: 'Nuevo Plato', subtitle: 'Agregar un nuevo plato al menú', icon: '➕', url: '/platos.html?new=true', badge: 'Acción', badgeClass: 'cosmos-badge-accion' },
        { type: 'accion', title: 'Ver Menú Completo', subtitle: 'Gestionar todos los platos', icon: '🍽️', url: '/platos.html', badge: 'Acción', badgeClass: 'cosmos-badge-accion' }
      ],
      mesas: [
        { type: 'accion', title: 'Mapa de Mesas', subtitle: 'Ver estado de todas las mesas', icon: '🗺️', url: '/mesas.html', badge: 'Acción', badgeClass: 'cosmos-badge-accion' },
        { type: 'accion', title: 'Nueva Mesa', subtitle: 'Agregar una nueva mesa', icon: '➕', url: '/mesas.html?new=true', badge: 'Acción', badgeClass: 'cosmos-badge-accion' }
      ],
      bouchers: [
        { type: 'accion', title: 'Nuevo Boucher', subtitle: 'Crear un nuevo boucher', icon: '➕', url: '/bouchers.html?new=true', badge: 'Acción', badgeClass: 'cosmos-badge-accion' },
        { type: 'accion', title: 'Ver Bouchers', subtitle: 'Gestionar todos los bouchers', icon: '🎫', url: '/bouchers.html', badge: 'Acción', badgeClass: 'cosmos-badge-accion' }
      ],
      reportes: [
        { type: 'accion', title: 'Reporte de Ventas', subtitle: 'Ver estadísticas de ventas', icon: '📊', url: '/reportes.html?tab=ventas', badge: 'Acción', badgeClass: 'cosmos-badge-accion' },
        { type: 'accion', title: 'Reporte de Platos', subtitle: 'Platos más vendidos', icon: '🍽️', url: '/reportes.html?tab=platos', badge: 'Acción', badgeClass: 'cosmos-badge-accion' },
        { type: 'accion', title: 'Reporte de Mesas', subtitle: 'Ocupación por mesa', icon: '🪑', url: '/reportes.html?tab=mesas', badge: 'Acción', badgeClass: 'cosmos-badge-accion' }
      ]
    };
    
    // Obtener acciones para la categoría activa
    const quickActions = categoryActions[this.activeCategory] || categoryActions.comandas;
    
    // Agregar elementos recientes según categoría
    let recentItems = [];
    
    switch (this.activeCategory) {
      case 'comandas':
        recentItems = this.dataCache.comandas.slice(0, 4).map(item => ({
          type: 'comanda',
          id: item._id,
          title: `Comanda #${item.comandaNumber || item._id?.slice(-4)}`,
          subtitle: `Mesa ${item.mesa?.numMesa || '—'} · ${item.status || 'Activa'}`,
          icon: '📋',
          url: `/comandas.html?id=${item._id}`,
          badge: 'Comanda',
          badgeClass: 'cosmos-badge-comanda'
        }));
        break;
      case 'mesas':
        recentItems = this.dataCache.mesas
          .filter(m => m.estado && m.estado.toLowerCase() !== 'libre')
          .slice(0, 4)
          .map(m => ({
            type: 'mesa',
            id: m._id,
            title: `Mesa ${m.numMesa || m.numero}`,
            subtitle: `${this.normalizeEstado(m.estado)}`,
            icon: '🪑',
            url: `/comandas.html?mesa=${m._id}`,
            badge: 'Mesa',
            badgeClass: 'cosmos-badge-mesa'
          }));
        break;
      case 'platos':
        recentItems = this.dataCache.platos.slice(0, 4).map(item => ({
          type: 'plato',
          id: item._id,
          title: item.nombre || item.name,
          subtitle: `${item.categoria || 'Sin categoría'} · S/.${item.precio || 0}`,
          icon: '🍽️',
          url: `/platos.html?edit=${item._id}`,
          badge: 'Plato',
          badgeClass: 'cosmos-badge-plato'
        }));
        break;
      case 'bouchers':
        recentItems = this.dataCache.bouchers.slice(0, 4).map(item => ({
          type: 'boucher',
          id: item._id,
          title: `Boucher ${item.codigo || item._id?.slice(-8)}`,
          subtitle: `${item.descuento ? item.descuento + '% descuento' : 'Sin descuento'}`,
          icon: '🎫',
          url: `/bouchers.html?codigo=${item.codigo || item._id}`,
          badge: 'Boucher',
          badgeClass: 'cosmos-badge-boucher'
        }));
        break;
    }
    
    this.results = [...quickActions, ...recentItems];
    this.selectedIndex = 0;
    this.renderResults();
  }
  
  renderResults() {
    // Título de la sección según categoría
    const categoryTitles = {
      comandas: 'Comandas',
      platos: 'Platos',
      mesas: 'Mesas',
      bouchers: 'Bouchers',
      reportes: 'Reportes'
    };
    
    if (this.results.length === 0) {
      this.listEl.innerHTML = `
        <div class="cosmos-command-empty">
          <div class="cosmos-command-empty-icon">🔍</div>
          <p class="cosmos-command-empty-text">No se encontraron resultados para "${this.query}"</p>
          <p class="cosmos-command-empty-hint">Intenta con otro término de búsqueda</p>
        </div>
      `;
      return;
    }
    
    // Agrupar por tipo
    const grouped = {};
    this.results.forEach(item => {
      if (!grouped[item.type]) grouped[item.type] = [];
      grouped[item.type].push(item);
    });
    
    const typeLabels = {
      plato: '🍽️ Platos',
      mesa: '🪑 Mesas',
      cliente: '👤 Clientes',
      comanda: '📋 Comandas',
      boucher: '🎫 Bouchers',
      accion: '⚡ Acciones rápidas'
    };
    
    let html = '';
    let globalIndex = 0;
    
    Object.keys(grouped).forEach(type => {
      html += `<div class="cosmos-command-group">
        <div class="cosmos-command-group-title">${typeLabels[type] || type}</div>`;
      
      grouped[type].forEach(item => {
        const selectedClass = globalIndex === this.selectedIndex ? 'selected' : '';
        html += `
          <div class="cosmos-command-item ${selectedClass}" data-index="${globalIndex}" data-url="${item.url}">
            <div class="cosmos-command-item-icon">${item.icon}</div>
            <div class="cosmos-command-item-content">
              <div class="cosmos-command-item-title">${item.title}</div>
              <div class="cosmos-command-item-subtitle">${item.subtitle}</div>
            </div>
            <span class="cosmos-command-item-kbd ${item.badgeClass || ''}">${item.badge || ''}</span>
          </div>
        `;
        globalIndex++;
      });
      
      html += '</div>';
    });
    
    this.listEl.innerHTML = html;
    
    // Bind click events
    this.listEl.querySelectorAll('.cosmos-command-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        if (url) {
          window.location.href = url;
        }
      });
      
      item.addEventListener('mouseenter', () => {
        const idx = parseInt(item.dataset.index);
        this.selectedIndex = idx;
        this.updateSelection();
      });
    });
  }
  
  // ==========================================
  // NAVIGATION
  // ==========================================
  
  navigateResults(direction) {
    const max = this.results.length - 1;
    this.selectedIndex = Math.max(0, Math.min(max, this.selectedIndex + direction));
    this.updateSelection();
  }
  
  updateSelection() {
    const items = this.listEl.querySelectorAll('.cosmos-command-item');
    items.forEach((item, idx) => {
      item.classList.toggle('selected', idx === this.selectedIndex);
    });
    
    // Scroll al elemento seleccionado
    const selected = items[this.selectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  
  selectResult() {
    const item = this.results[this.selectedIndex];
    if (item && item.url) {
      window.location.href = item.url;
    }
  }
}

// ==========================================
// INICIALIZACIÓN AUTOMÁTICA
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Crear instancia global
  window.cosmosSearch = new CosmosSearch();
});

// ==========================================
// FUNCIÓN HELPER PARA CREAR TRIGGER
// ==========================================

function createCosmosSearchTrigger(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const placeholder = options.placeholder || 'Buscar platos, mesas, comandas, clientes, bouchers...';
  
  container.innerHTML = `
    <div class="cosmos-search-trigger">
      <div class="cosmos-search-box gold-theme" role="button" tabindex="0" aria-label="Abrir búsqueda">
        <span class="cosmos-search-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        </span>
        <input 
          type="text" 
          class="cosmos-search-input" 
          placeholder="${placeholder}" 
          readonly 
          tabindex="-1"
        >
        <span class="cosmos-search-kbd">
          <span>⌘</span>
          <span>K</span>
        </span>
      </div>
    </div>
  `;
}
