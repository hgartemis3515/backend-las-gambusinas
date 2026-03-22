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
    // Crear container del modal
    const modalHTML = `
      <div class="cosmos-command-palette" id="cosmos-command-palette">
        <div class="cosmos-command-container">
          <!-- Header -->
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
              placeholder="Buscar por nombre, mesa, #comanda, código boucher..."
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
          
          <!-- Results List -->
          <div class="cosmos-command-list" id="cosmos-command-list">
            <!-- Los resultados se renderizan dinámicamente -->
          </div>
          
          <!-- Footer -->
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
    this.closeBtn = document.getElementById('cosmos-command-close');
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
      }
    });
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
    
    // Buscar en platos
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
    
    // Buscar en mesas
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
    
    // Buscar en clientes
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
    
    // Buscar en comandas (soporta formato #472 o número directo)
    this.dataCache.comandas.forEach(item => {
      const num = String(item.comandaNumber || item._id?.slice(-4) || '').toLowerCase();
      const numWithHash = '#' + num;
      const mesa = String(item.mesa?.numMesa || item.mesaNum || '').toLowerCase();
      const cliente = (item.cliente?.nombre || item.cliente || '').toLowerCase();
      
      // Buscar por número de comanda (con o sin #)
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
    
    // Buscar en bouchers por código (ej: b08408038d9d)
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
    
    this.results = results.slice(0, this.options.maxResults);
    this.selectedIndex = 0;
    this.renderResults();
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
    // Mostrar resultados recientes/populares
    const quickActions = [
      { type: 'accion', title: 'Ver Comandas', subtitle: 'Gestionar comandas activas', icon: '📋', url: '/comandas.html', badge: 'Acción', badgeClass: 'cosmos-badge-accion' },
      { type: 'accion', title: 'Mapa de mesas', subtitle: 'Ver estado de todas las mesas', icon: '🗺️', url: '/mesas.html', badge: 'Acción', badgeClass: 'cosmos-badge-accion' },
      { type: 'accion', title: 'Reportes', subtitle: 'Acceder a reportes y estadísticas', icon: '📊', url: '/reportes.html', badge: 'Acción', badgeClass: 'cosmos-badge-accion' },
      { type: 'accion', title: 'Configuración', subtitle: 'Ajustes del sistema', icon: '⚙️', url: '/configuracion.html', badge: 'Acción', badgeClass: 'cosmos-badge-accion' }
    ];
    
    // Agregar mesas activas
    const mesasActivas = this.dataCache.mesas
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
    
    this.results = [...quickActions, ...mesasActivas];
    this.selectedIndex = 0;
    this.renderResults();
  }
  
  renderResults() {
    if (this.results.length === 0) {
      this.listEl.innerHTML = `
        <div class="cosmos-command-empty">
          <div class="cosmos-command-empty-icon">🔍</div>
          <p class="cosmos-command-empty-text">No se encontraron resultados para "${this.query}"</p>
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
