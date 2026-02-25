/**
 * Las Gambusinas — Alpine.js store global, mockData, reloj, notificaciones, búsqueda, atajos
 */
(function () {
  const MOCK_DATA = {
    areas: [
      { id: '1', nombre: 'Salón Principal', descripcion: 'Área principal' },
      { id: '2', nombre: 'Terraza', descripcion: 'Exterior' },
      { id: '3', nombre: 'VIP', descripcion: 'Privado' }
    ],
    mesas: [
      { id: '1', numero: 1, areaId: '1', estado: 'Libre', estadoColor: 'libre', areaNombre: 'Salón Principal', mozo: null, monto: null },
      { id: '2', numero: 2, areaId: '1', estado: 'Ocupada', estadoColor: 'esperando', areaNombre: 'Salón Principal', mozo: 'Juan Pérez', monto: 125 },
      { id: '3', numero: 3, areaId: '1', estado: 'Reservada', estadoColor: 'reservado', areaNombre: 'Salón Principal', mozo: null, monto: null },
      { id: '4', numero: 4, areaId: '2', estado: 'Libre', estadoColor: 'libre', areaNombre: 'Terraza', mozo: null, monto: null },
      { id: '5', numero: 5, areaId: '2', estado: 'Ocupada', estadoColor: 'pedido', areaNombre: 'Terraza', mozo: 'María G.', monto: 68 }
    ],
    mozos: [
      { id: '1', nombre: 'Juan Pérez', dni: '12345678', telefono: '999111222' },
      { id: '2', nombre: 'María González', dni: '87654321', telefono: '999333444' }
    ],
    platos: [
      { id: '1', nombre: 'Ceviche Clásico', precio: 45, stock: 50, categoria: 'Ceviches', subcategoria: '', complementos: [{ nombre: 'Proteína' }, { nombre: 'Guarnición' }] },
      { id: '2', nombre: 'Paella Marinera', precio: 68, stock: 30, categoria: 'Arroces', subcategoria: '', complementos: [{ nombre: 'Bebida' }] },
      { id: '3', nombre: 'Lomo Saltado', precio: 35, stock: 45, categoria: 'Carnes', subcategoria: '', complementos: [] },
      { id: '4', nombre: 'Jugo Natural', precio: 12, stock: 8, categoria: 'Bebidas', subcategoria: '', complementos: [{ nombre: 'Tamaño' }] }
    ],
    comandas: [
      { id: 305, mesa: 'Mesa 5', mozo: 'Juan Pérez', items: 4, total: 193, estado: 'En proceso' },
      { id: 306, mesa: 'Mesa 2', mozo: 'María G.', items: 2, total: 78, estado: 'Preparando' }
    ],
    bouchers: [
      { id: '1', codigo: 'BCH-001', numero: '100', fecha: '24/02/2026', total: 193 },
      { id: '2', codigo: 'BCH-001', numero: '101', fecha: '24/02/2026', total: 78 }
    ],
    clientes: [
      { id: '1', nombre: 'Carlos López', dni: '20123456789', telefono: '998877665', visitas: 12, gastoTotal: 1450, tipo: 'Registrado' },
      { id: '2', nombre: 'Ana Martínez', dni: '20987654321', telefono: '987654321', visitas: 28, gastoTotal: 3200, tipo: 'Frecuente' }
    ],
    auditoria: [
      { id: '1', hora: '14:32', usuario: 'Admin', accion: 'Comanda Eliminada', modulo: 'Comandas', ip: '192.168.1.45', detalles: 'Comanda #300' },
      { id: '2', hora: '14:15', usuario: 'Admin', accion: 'Plato Modificado', modulo: 'Platos', ip: '192.168.1.45', detalles: 'Ceviche Clásico - precio' }
    ],
    cierreComplementos: [
      { nombre: 'Inca Kola 500ml', tipo: 'Bebida', cantidad: 24, subtotal: 288 },
      { nombre: 'Guarnición Arroz', tipo: 'Extra', cantidad: 18, subtotal: 90 }
    ]
  };

  function getCurrentPageFromUrl() {
    const path = (window.location.pathname || '').replace(/\/$/, '');
    const page = path.split('/').pop() || 'index.html';
    const map = {
      'index.html': 'dashboard', '': 'dashboard',
      'mesas.html': 'mesas', 'mozos.html': 'mozos', 'platos.html': 'platos',
      'comandas.html': 'comandas', 'bouchers.html': 'bouchers', 'clientes.html': 'clientes',
      'auditoria.html': 'auditoria', 'cierre-caja.html': 'cierre',
      'reportes.html': 'reportes', 'configuracion.html': 'configuracion'
    };
    return map[page] || 'dashboard';
  }

  const MENU_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', href: 'index.html' },
    { id: 'mesas', label: 'Mesas', icon: '🪑', href: 'mesas.html' },
    { id: 'mozos', label: 'Mozos', icon: '👤', href: 'mozos.html' },
    { id: 'platos', label: 'Platos', icon: '🍲', href: 'platos.html' },
    { id: 'comandas', label: 'Comandas', icon: '📋', href: 'comandas.html' },
    { id: 'bouchers', label: 'Bouchers', icon: '🧂', href: 'bouchers.html' },
    { id: 'clientes', label: 'Clientes', icon: '👥', href: 'clientes.html' },
    { id: 'auditoria', label: 'Auditoría', icon: '🔍', href: 'auditoria.html' },
    { id: 'cierre', label: 'Cierre Caja', icon: '💰', href: 'cierre-caja.html' },
    { id: 'reportes', label: 'Reportes', icon: '📊', href: 'reportes.html' },
    { id: 'configuracion', label: 'Configuración', icon: '⚙️', href: 'configuracion.html' }
  ];

  const CONFIG_TABS = [
    { id: 'general', label: 'General' }, { id: 'moneda', label: 'Moneda y Precios' },
    { id: 'mesas', label: 'Mesas y Áreas' }, { id: 'cocina', label: 'Cocina' },
    { id: 'pagos', label: 'Pagos y Facturación' }, { id: 'notificaciones', label: 'Notificaciones' },
    { id: 'cierre', label: 'Cierre de Caja' }, { id: 'seguridad', label: 'Seguridad' },
    { id: 'integraciones', label: 'Integraciones' }, { id: 'avanzado', label: 'Avanzado' }
  ];

  document.addEventListener('alpine:init', function () {
    Alpine.data('dashboardApp', function () {
      return {
        topbarHtml: '',
        sidebarHtml: '',
        sidebarOpen: true,
        currentPage: getCurrentPageFromUrl(),
        currentReportTab: 'general',
        currentConfigTab: 'general',
        vistaMesas: 'tarjetas',
        vistaMesasPagina: 'mesas',
        platosTab: 'todos',
        cierreTab: 'complementos',
        searchOpen: false,
        searchQuery: '',
        statusOpen: false,
        shortcutsOpen: false,
        notificationsOpen: false,
        profileOpen: false,
        modalPersonalizar: false,
        modalMesa: false,
        modalPlato: false,
        modalComanda: false,
        modalBoucher: false,
        modalCliente: false,
        modalAuditoria: false,
        modalArea: false,
        modalMozo: false,
        editingMesa: null,
        editingPlato: null,
        selectedComanda: null,
        selectedBoucher: null,
        selectedCliente: null,
        selectedAuditoria: null,
        clockTime: '00:00:00',
        clockDate: '',
        filtroMesas: '',
        filtroAreaMesas: '',
        filtroEstadoMesas: '',
        formMesa: { numero: '', areaId: '1', capacidad: 4 },
        formPlato: { nombre: '', precio: '', stock: 0, categoria: '', complementos: [] },
        mockData: JSON.parse(JSON.stringify(MOCK_DATA)),
        menuItems: MENU_ITEMS,
        configTabs: CONFIG_TABS,

        get breadcrumb() {
          const labels = { dashboard: 'Dashboard', mesas: 'Mesas', mozos: 'Mozos', platos: 'Platos', comandas: 'Comandas', bouchers: 'Bouchers', clientes: 'Clientes', auditoria: 'Auditoría', cierre: 'Cierre Caja', reportes: 'Reportes', configuracion: 'Configuración' };
          return labels[this.currentPage] || 'Dashboard';
        },
        get saludo() {
          const h = new Date().getHours();
          if (h < 12) return 'días';
          if (h < 19) return 'tardes';
          return 'noches';
        },
        get dashboardKpis() {
          const ocupadas = this.mockData.mesas.filter(function (m) { return m.estado !== 'Libre' && m.estado !== 'Reservada'; }).length;
          return { mesasOcupadas: ocupadas, mesasTotal: this.mockData.mesas.length, ventasHoy: '2,450', topPlato: 'Ceviche Clásico', topMozo: 'Juan Pérez', alertas: 2 };
        },
        get mesasMapa() {
          return this.mockData.mesas.slice(0, 20).map(function (m) { return Object.assign({}, m); });
        },
        get actividadReciente() {
          return [
            { id: 1, hora: '14:35', texto: 'Comanda #305 lista para servir' },
            { id: 2, hora: '14:28', texto: 'Mesa 5 - Pedido enviado a cocina' },
            { id: 3, hora: '14:15', texto: 'Pago procesado S/. 185 - Mesa 3' }
          ];
        },
        get mesasFiltradas() {
          var list = this.mockData.mesas;
          if (this.filtroAreaMesas) list = list.filter(function (m) { return m.areaId === this.filtroAreaMesas; }.bind(this));
          if (this.filtroEstadoMesas) list = list.filter(function (m) { return m.estado.toLowerCase() === this.filtroEstadoMesas; }.bind(this));
          if (this.filtroMesas) list = list.filter(function (m) { return String(m.numero).indexOf(this.filtroMesas) !== -1; }.bind(this));
          return list;
        },
        get categoriasPlatos() {
          return [{ nombre: 'Ceviches', count: 24 }, { nombre: 'Arroces', count: 18 }, { nombre: 'Bebidas', count: 35 }];
        },
        get searchResults() {
          var q = (this.searchQuery || '').toLowerCase();
          if (q.length < 2) return { platos: [], mesas: [] };
          return {
            platos: this.mockData.platos.filter(function (p) { return p.nombre.toLowerCase().indexOf(q) !== -1; }).slice(0, 5),
            mesas: this.mockData.mesas.filter(function (m) { return String(m.numero).indexOf(q) !== -1; }).slice(0, 3)
          };
        },
        get notifications() {
          return [
            { id: 1, texto: 'Mesa 8 sin liberar', hora: 'Hace 5 min', urgente: true, leida: false, icono: '🔴' },
            { id: 2, texto: 'Stock bajo: Inca Kola', hora: 'Hace 12 min', urgente: false, leida: false, icono: '🟡' },
            { id: 3, texto: 'Nueva comanda #312', hora: 'Hace 20 min', urgente: false, leida: true, icono: '🔵' }
          ];
        },
        get notifUnread() { return this.notifications.filter(function (n) { return !n.leida; }).length; },

        mesaColor: function (estado) {
          var map = { libre: '#00d4aa', esperando: '#ffa502', pedido: '#3498db', preparado: '#2ecc71', pagado: '#ff4757', reservado: '#5352ed' };
          return map[estado] || '#5a5a7a';
        },
        openModalMesa: function (mesa) {
          this.editingMesa = mesa || null;
          this.formMesa = mesa ? { numero: mesa.numero, areaId: mesa.areaId, capacidad: 4 } : { numero: '', areaId: '1', capacidad: 4 };
          this.modalMesa = true;
        },
        openModalArea: function () { this.modalArea = true; },
        openModalMozo: function () { this.modalMozo = true; },
        openModalPlato: function (plato) {
          this.editingPlato = plato || null;
          this.formPlato = plato ? { nombre: plato.nombre, precio: plato.precio, stock: plato.stock, categoria: plato.categoria, complementos: plato.complementos || [] } : { nombre: '', precio: '', stock: 0, categoria: '', complementos: [] };
          this.modalPlato = true;
        },
        openModalComanda: function (c) { this.selectedComanda = c; this.modalComanda = true; },
        openModalBoucher: function (b) { this.selectedBoucher = b; this.modalBoucher = true; },
        openModalCliente: function (c) { this.selectedCliente = c; this.modalCliente = true; },
        openModalAuditoria: function (a) { this.selectedAuditoria = a; this.modalAuditoria = true; },
        verDetalleMesa: function (m) { this.openModalMesa(m); },
        saveMesa: function () {
          if (!this.editingMesa) {
            var area = this.mockData.areas.find(function (a) { return a.id === this.formMesa.areaId; }.bind(this));
            this.mockData.mesas.push({
              id: String(this.mockData.mesas.length + 1),
              numero: this.formMesa.numero,
              areaId: this.formMesa.areaId,
              estado: 'Libre',
              estadoColor: 'libre',
              areaNombre: area ? area.nombre : '',
              mozo: null,
              monto: null
            });
          }
          this.modalMesa = false;
        },
        savePlato: function () {
          if (!this.editingPlato) {
            this.mockData.platos.push({
              id: String(this.mockData.platos.length + 1),
              nombre: this.formPlato.nombre,
              precio: this.formPlato.precio,
              stock: this.formPlato.stock,
              categoria: this.formPlato.categoria,
              complementos: []
            });
          }
          this.modalPlato = false;
        },

        init: function () {
          var self = this;
          this.currentPage = getCurrentPageFromUrl();

          function tick() {
            var d = new Date();
            self.clockTime = d.toTimeString().slice(0, 8);
            self.clockDate = d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
          }
          tick();
          setInterval(tick, 1000);

          document.addEventListener('keydown', function (e) {
            if (e.ctrlKey && e.key === 'k') { e.preventDefault(); var el = document.querySelector('[placeholder*="Buscar"]'); if (el) el.focus(); }
            if (e.ctrlKey && e.key === 'n') { e.preventDefault(); window.location.href = 'comandas.html'; }
            if (e.ctrlKey && e.key === 'm') { e.preventDefault(); window.location.href = 'mesas.html'; }
            if (e.ctrlKey && e.key === 'r') { e.preventDefault(); window.location.href = 'reportes.html'; }
          });

          self.$nextTick(function () {
            if (typeof lucide !== 'undefined') lucide.createIcons();
            if (window.LasGambusinasCharts && typeof Chart !== 'undefined') {
              if (document.getElementById('chartVentasHora')) window.LasGambusinasCharts.chartVentasHora('chartVentasHora');
              if (document.getElementById('chartReportesVentas')) window.LasGambusinasCharts.chartVentasPeriodo('chartReportesVentas');
              if (document.getElementById('chartReportesDonut')) window.LasGambusinasCharts.chartDonut('chartReportesDonut');
            }
          });
        }
      };
    });
  });
})();
