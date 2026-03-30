/**
 * Las Gambusinas - shared.js
 * MockData global, funciones helper, carga de componentes
 */

// ============================================
// MOCK DATA - Extraído del archivo de referencia
// ============================================
const sharedData = {
  // 20 mesas con todos los campos
  mockMesas: [
    { numero: 1, area: 'Salón Principal', estado: 'Libre', mozo: '', personas: 0, tiempo: '', monto: 0 },
    { numero: 2, area: 'Salón Principal', estado: 'Ocupada', mozo: 'Juan P.', personas: 4, tiempo: '45 min', monto: 120 },
    { numero: 3, area: 'Salón Principal', estado: 'Pedido', mozo: 'María G.', personas: 2, tiempo: '12 min', monto: 68 },
    { numero: 4, area: 'Salón Principal', estado: 'Libre', mozo: '', personas: 0, tiempo: '', monto: 0 },
    { numero: 5, area: 'Salón Principal', estado: 'Ocupada', mozo: 'Juan P.', personas: 6, tiempo: '1h 23m', monto: 340 },
    { numero: 6, area: 'Salón Principal', estado: 'Preparado', mozo: 'Pedro R.', personas: 3, tiempo: '35 min', monto: 185 },
    { numero: 7, area: 'Salón Principal', estado: 'Libre', mozo: '', personas: 0, tiempo: '', monto: 0 },
    { numero: 8, area: 'Salón Principal', estado: 'Pagado', mozo: 'Ana L.', personas: 2, tiempo: '15 min', monto: 95 },
    { numero: 9, area: 'Salón Principal', estado: 'Ocupada', mozo: 'María G.', personas: 4, tiempo: '28 min', monto: 145 },
    { numero: 10, area: 'Salón Principal', estado: 'Reservado', mozo: '', personas: 0, tiempo: '19:00', monto: 0 },
    { numero: 11, area: 'Terraza', estado: 'Libre', mozo: '', personas: 0, tiempo: '', monto: 0 },
    { numero: 12, area: 'Terraza', estado: 'Ocupada', mozo: 'Juan P.', personas: 4, tiempo: '52 min', monto: 220 },
    { numero: 13, area: 'Terraza', estado: 'Ocupada', mozo: 'Pedro R.', personas: 2, tiempo: '18 min', monto: 75 },
    { numero: 14, area: 'Terraza', estado: 'Libre', mozo: '', personas: 0, tiempo: '', monto: 0 },
    { numero: 15, area: 'Terraza', estado: 'Pedido', mozo: 'Ana L.', personas: 3, tiempo: '8 min', monto: 90 },
    { numero: 16, area: 'Terraza', estado: 'Ocupada', mozo: 'María G.', personas: 5, tiempo: '40 min', monto: 280 },
    { numero: 17, area: 'VIP', estado: 'Reservado', mozo: '', personas: 0, tiempo: '20:00', monto: 0 },
    { numero: 18, area: 'VIP', estado: 'Ocupada', mozo: 'Juan P.', personas: 8, tiempo: '1h 10m', monto: 680 },
    { numero: 19, area: 'VIP', estado: 'Libre', mozo: '', personas: 0, tiempo: '', monto: 0 },
    { numero: 20, area: 'VIP', estado: 'Ocupada', mozo: 'Pedro R.', personas: 6, tiempo: '55 min', monto: 420 }
  ],

  mockAreas: [
    { id: 'A001', nombre: 'Salón Principal', desc: 'Área principal del restaurante', mesas: 10 },
    { id: 'A002', nombre: 'Terraza', desc: 'Zona al aire libre con vista', mesas: 6 },
    { id: 'A003', nombre: 'VIP / Privado', desc: 'Reservaciones especiales', mesas: 4 }
  ],

  mockMozos: [
    { id: 'M001', nombre: 'Juan Pérez', dni: '12345678', tel: '987 654 321', ventas: 980, activo: true },
    { id: 'M002', nombre: 'María González', dni: '87654321', tel: '987 123 456', ventas: 720, activo: true },
    { id: 'M003', nombre: 'Pedro Ruiz', dni: '11223344', tel: '987 789 012', ventas: 540, activo: true },
    { id: 'M004', nombre: 'Ana López', dni: '44556677', tel: '987 456 789', ventas: 410, activo: true },
    { id: 'M005', nombre: 'Carlos Mendoza', dni: '99887766', tel: '987 321 654', ventas: 180, activo: false }
  ],

  mockPlatos: [
    { nombre: 'Ceviche Clásico', cat: 'Ceviches', tipo: 'Carta', precio: '45.00', stock: 32, grupos: 2, grupoNames: 'Proteína · Guarnición' },
    { nombre: 'Paella Marinera', cat: 'Arroces', tipo: 'Carta', precio: '68.00', stock: 12, grupos: 1, grupoNames: 'Guarnición' },
    { nombre: 'Desayuno Andino', cat: 'Desayunos', tipo: 'Desayuno', precio: '22.00', stock: 40, grupos: 3, grupoNames: 'Bebida · Jugo · Pan' },
    { nombre: 'Lomo Saltado', cat: 'Carnes', tipo: 'Carta', precio: '35.00', stock: 45, grupos: 0, grupoNames: '' },
    { nombre: 'Ají de Gallina', cat: 'Carnes', tipo: 'Carta', precio: '28.00', stock: 8, grupos: 2, grupoNames: 'Guarnición · Salsa' },
    { nombre: 'Jugo Natural', cat: 'Bebidas', tipo: 'Carta', precio: '10.00', stock: 0, grupos: 1, grupoNames: 'Tamaño' }
  ],

  mockComandas: [
    { id: 42, mesa: 5, mozo: 'Juan Pérez', items: 4, total: '193.00', estado: 'Preparado', hora: '14:35' },
    { id: 41, mesa: 3, mozo: 'María González', items: 2, total: '68.00', estado: 'En cocina', hora: '14:20' },
    { id: 40, mesa: 12, mozo: 'Pedro Ruiz', items: 3, total: '185.00', estado: 'Entregado', hora: '14:10' },
    { id: 39, mesa: 9, mozo: 'María González', items: 5, total: '245.00', estado: 'En cocina', hora: '14:05' }
  ],

  mockBouchers: [
    { codigo: 'BCH-001-00100', numero: '#100', fecha: '24/02/2026 14:42', mesa: 5, total: '193.00', metodo: 'Efectivo' },
    { codigo: 'BCH-001-00099', numero: '#099', fecha: '24/02/2026 13:55', mesa: 12, total: '185.00', metodo: 'Tarjeta' },
    { codigo: 'BCH-001-00098', numero: '#098', fecha: '24/02/2026 13:20', mesa: 8, total: '95.00', metodo: 'Yape' }
  ],

  mockClientes: [
    { nombre: 'María Sánchez', dni: '12345678', tel: '987 654 321', visitas: 15, gasto: '2,340', tipo: 'Frecuente' },
    { nombre: 'Carlos López', dni: '87654321', tel: '987 123 456', visitas: 8, gasto: '1,120', tipo: 'Registrado' },
    { nombre: 'Ana Torres', dni: '11223344', tel: '987 789 012', visitas: 22, gasto: '3,890', tipo: 'Frecuente' },
    { nombre: 'Pedro García', dni: '55667788', tel: '987 456 789', visitas: 3, gasto: '280', tipo: 'Registrado' }
  ],

  mockAuditoria: [
    { hora: '14:32:18', usuario: 'Admin', accion: 'Editar plato', modulo: 'Platos', ip: '192.168.1.45', color: 'text-st-esperando' },
    { hora: '14:28:05', usuario: 'Juan P.', accion: 'Comanda creada', modulo: 'Comandas', ip: '192.168.1.52', color: 'text-st-pedido' },
    { hora: '14:15:33', usuario: 'Admin', accion: 'Comanda eliminada', modulo: 'Comandas', ip: '192.168.1.45', color: 'text-st-pagado' },
    { hora: '13:55:12', usuario: 'María G.', accion: 'Pago procesado', modulo: 'Bouchers', ip: '192.168.1.53', color: 'text-st-preparado' }
  ],

  mockCierreCompl: [
    { nombre: 'Inca Kola 500ml', tipo: '🥤 Bebida', tipoClass: 'bg-st-pedido/20 text-st-pedido', cant: 85, pu: '5.00', sub: '425.00', pct: 33 },
    { nombre: 'Porción extra arroz', tipo: '➕ Extra', tipoClass: 'bg-st-preparado/20 text-st-preparado', cant: 42, pu: '8.00', sub: '336.00', pct: 26 },
    { nombre: 'Tamaño familiar', tipo: '📏 Tamaño', tipoClass: 'bg-st-esperando/20 text-st-esperando', cant: 18, pu: '10.00', sub: '180.00', pct: 14 },
    { nombre: 'Salsa picante', tipo: '🌟 Adicional', tipoClass: 'bg-st-reservado/20 text-st-reservado', cant: 68, pu: '2.00', sub: '136.00', pct: 11 }
  ],

  notifs: [
    { icon: '🔴', title: 'Mesa 8 sin liberar hace 15 min', time: 'hace 2 min', unread: true },
    { icon: '🟡', title: 'Stock bajo: Inca Kola 500ml', time: 'hace 10 min', unread: true },
    { icon: '🔵', title: 'Nueva comanda #312 — Mesa 3', time: 'hace 15 min', unread: true },
    { icon: '🟢', title: 'Pago procesado S/.185 — Mesa 12', time: 'hace 25 min', unread: false },
    { icon: '🟢', title: 'Comanda #308 lista para servir', time: 'hace 30 min', unread: false }
  ],

  activity: [
    { text: 'Mesa 5 — Comanda #42 preparada', time: 'hace 2 min', dotClass: 'bg-st-preparado' },
    { text: 'Mesa 12 — Pago procesado S/.185', time: 'hace 8 min', dotClass: 'bg-st-pagado' },
    { text: 'Mesa 3 — Nueva comanda #312', time: 'hace 15 min', dotClass: 'bg-st-pedido' },
    { text: 'Juan Pérez — Login al sistema', time: 'hace 22 min', dotClass: 'bg-gold' },
    { text: 'Mesa 7 — Liberada por Admin', time: 'hace 30 min', dotClass: 'bg-st-libre' }
  ],

  dashKPIs: [
    { label: 'Mesas Ocupadas', value: '12/20', color: 'text-gold', sub: '60% ocupación' },
    { label: 'Ventas Hoy', value: 'S/. 2,450', color: 'text-gold', sub: '+18% vs ayer' },
    { label: 'Top Plato', value: 'Ceviche', color: 'text-white', sub: '12 vendidos' },
    { label: 'Top Mozo', value: 'Juan P.', color: 'text-white', sub: 'S/. 980' },
    { label: 'Alertas', value: '2', color: 'text-st-pagado', sub: 'Mesa 8 sin liberar' }
  ],

  repKPIs: {
    General: [
      { label: 'Ventas Totales', value: 'S/. 12,450', color: 'text-gold', badge: '+18% ↑' },
      { label: 'Ticket Promedio', value: 'S/. 52.13', color: 'text-white', badge: '+5% ↑' },
      { label: 'Margen Bruto', value: '68.5%', color: 'text-st-preparado', badge: '-2.1% ↓' },
      { label: 'Ocupación Prom.', value: '74%', color: 'text-st-pedido', badge: '+8% ↑' }
    ],
    Platos: [
      { label: 'Platos Vendidos', value: '847', color: 'text-white', badge: '+7% ↑' },
      { label: 'Categoría Top', value: 'Ceviches', color: 'text-gold', badge: '32% del total' },
      { label: 'Ticket c/ Plato', value: 'S/. 58.20', color: 'text-white', badge: '+3% ↑' },
      { label: 'Cancelados', value: '8', color: 'text-st-preparado', badge: '0.9%' }
    ],
    Mozos: [
      { label: 'Mozos Activos', value: '8 de 12', color: 'text-gold', badge: '+2 vs ayer' },
      { label: 'Top Mozo', value: 'Juan P.', color: 'text-white', badge: 'S/.980' },
      { label: 'Propinas Total', value: 'S/. 245', color: 'text-st-preparado', badge: '+12% ↑' },
      { label: 'Tiempo Prom.', value: '4.2 min', color: 'text-st-preparado', badge: '-8% ↑' }
    ],
    Mesas: [
      { label: 'Ocupación', value: '74%', color: 'text-gold', badge: '14 de 19' },
      { label: 'Mesa Top', value: 'Mesa 5', color: 'text-white', badge: 'S/.680' },
      { label: 'Rotación Prom.', value: '3.2', color: 'text-white', badge: 'comandas/mesa' },
      { label: 'Tiempo Ocup.', value: '48 min', color: 'text-st-esperando', badge: '+5 min' }
    ],
    Clientes: [
      { label: 'Clientes Únicos', value: '187', color: 'text-white', badge: '+12% ↑' },
      { label: 'Cliente Top', value: 'María S.', color: 'text-gold', badge: 'S/.340' },
      { label: 'Nuevos Registros', value: '12', color: 'text-st-preparado', badge: '+30% ↑' },
      { label: 'Fidelización', value: '28%', color: 'text-gold', badge: 'frecuentes' }
    ]
  },

  pages: {
    dashboard: { label: 'Dashboard', icon: '📊', href: '/index.html' },
    mesas: { label: 'Mesas', icon: '🪑', href: '/mesas.html' },
    areas: { label: 'Áreas', icon: '🗺️', href: '/areas.html' },
    usuarios: { label: 'Usuarios', icon: '👤', href: '/usuarios.html' },
    mozos: { label: 'Mozos', icon: '👥', href: '/mozos.html' },
    cocineros: { label: 'Cocineros', icon: '👨‍🍳', href: '/cocineros.html' },
    roles: { label: 'Roles', icon: '🔐', href: '/roles.html' },
    platos: { label: 'Platos', icon: '🍲', href: '/platos.html' },
    comandas: { label: 'Comandas', icon: '📋', href: '/comandas.html' },
    bouchers: { label: 'Vouchers', icon: '🧾', href: '/bouchers.html' },
    clientes: { label: 'Clientes', icon: '👥', href: '/clientes.html' },
    auditoria: { label: 'Auditoría', icon: '🔍', href: '/auditoria.html' },
    cierre: { label: 'Cierre Caja', icon: '💰', href: '/cierre-caja.html' },
    reportes: { label: 'Reportes', icon: '📊', href: '/reportes.html' },
    config: { label: 'Configuración', icon: '⚙️', href: '/configuracion.html' }
  }
};

// ============================================
// FUNCIONES HELPER
// ============================================
function mesaClass(estado) {
  const map = {
    Libre: 'border-st-libre/60 bg-st-libre/10 text-st-libre',
    Ocupada: 'border-st-esperando/60 bg-st-esperando/10 text-st-esperando',
    Pedido: 'border-st-pedido/60 bg-st-pedido/10 text-st-pedido',
    Preparado: 'border-st-preparado/60 bg-st-preparado/10 text-st-preparado',
    Pagado: 'border-st-pagado/60 bg-st-pagado/10 text-st-pagado',
    Reservado: 'border-st-reservado/60 bg-st-reservado/10 text-st-reservado'
  };
  return map[estado] || '';
}

function mesaBorderClass(estado) {
  const map = {
    Libre: 'border-st-libre/40',
    Ocupada: 'border-st-esperando/40',
    Pedido: 'border-st-pedido/40',
    Preparado: 'border-st-preparado/40',
    Pagado: 'border-st-pagado/40',
    Reservado: 'border-st-reservado/40'
  };
  return map[estado] || 'border-[rgba(212,175,55,0.25)]';
}

function mesaBadge(estado) {
  const map = {
    Libre: 'bg-st-libre/20 text-st-libre',
    Ocupada: 'bg-st-esperando/20 text-st-esperando',
    Pedido: 'bg-st-pedido/20 text-st-pedido',
    Preparado: 'bg-st-preparado/20 text-st-preparado',
    Pagado: 'bg-st-pagado/20 text-st-pagado',
    Reservado: 'bg-st-reservado/20 text-st-reservado'
  };
  return map[estado] || '';
}

function filteredMesas(area, filter) {
  return sharedData.mockMesas.filter(m => m.area === area && (filter === 'Todas' || m.estado === filter));
}

// ============================================
// RELOJ Y FECHA
// ============================================
function initClock() {
  function update() {
    const now = new Date();
    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('dateStr');
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('es-PE', { hour12: false });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  update();
  setInterval(update, 1000);
}

// ============================================
// NAVEGACIÓN ACTIVA EN SIDEBAR
// ============================================
function setActiveNav() {
  const path = window.location.pathname;
  const navLinks = document.querySelectorAll('[data-nav]');
  navLinks.forEach(link => {
    const nav = link.getAttribute('data-nav');
    const isActive = (nav === 'dashboard' && (path === '/' || path.includes('index'))) || path.includes(nav);
    link.classList.toggle('active', isActive);
  });
}

// ============================================
// CARGA DE COMPONENTES
// ============================================
async function loadComponents() {
  try {
    const [topbarRes, sidebarRes] = await Promise.all([
      fetch('/assets/components/topbar.html'),
      fetch('/assets/components/sidebar.html')
    ]);
    
    const topbarHtml = await topbarRes.text();
    const sidebarHtml = await sidebarRes.text();
    
    const topbarContainer = document.getElementById('topbar-container');
    const sidebarContainer = document.getElementById('sidebar-container');
    
    if (topbarContainer) topbarContainer.innerHTML = topbarHtml;
    if (sidebarContainer) sidebarContainer.innerHTML = sidebarHtml;
    
    setActiveNav();
    initClock();

    // Alpine 3 observa mutaciones: al inyectar topbar/sidebar el árbol nuevo queda bajo el x-data del body.
    // Un initTree manual aquí creaba un contexto aislado (pageTitle/activeNav undefined).

    // Re-inicializar iconos Lucide si está disponible
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  } catch (err) {
    console.error('Error cargando componentes:', err);
  }
}

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  loadComponents();
});

// ============================================
// API HELPERS CON AUTENTICACIÓN JWT
// ============================================
function getToken() {
  return localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
}

function clearAuthAndRedirect() {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('gambusinas_auth');
  sessionStorage.removeItem('adminToken');
  sessionStorage.removeItem('gambusinas_auth');
  window.location.href = '/login.html';
}

// Función de logout para el menú del usuario
function logout() {
  clearAuthAndRedirect();
}

async function apiGet(endpoint) {
  const token = getToken();
  if (!token) {
    clearAuthAndRedirect();
    return null;
  }
  try {
    const res = await fetch('/api' + endpoint, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.status === 401) {
      clearAuthAndRedirect();
      return null;
    }
    const text = await res.text();
    if (!text || !text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      if (res.ok) console.warn('API respuesta no JSON:', endpoint, text.slice(0, 80));
      else console.warn('API', res.status, endpoint, '(HTML o no JSON)');
      return null;
    }
  } catch (e) {
    console.error('API Error:', endpoint, e);
    // Notificar error de red
    if (window.GambusinasNotifications) {
      GambusinasNotifications.networkError(e);
    }
    return null;
  }
}

async function apiPost(endpoint, body) {
  const token = getToken();
  if (!token) {
    clearAuthAndRedirect();
    return null;
  }
  try {
    const res = await fetch('/api' + endpoint, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (res.status === 401) {
      clearAuthAndRedirect();
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('API Error:', endpoint, e);
    return null;
  }
}

async function apiPut(endpoint, body) {
  const token = getToken();
  if (!token) {
    clearAuthAndRedirect();
    return null;
  }
  try {
    const res = await fetch('/api' + endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (res.status === 401) {
      clearAuthAndRedirect();
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('API Error:', endpoint, e);
    return null;
  }
}

async function apiDelete(endpoint, body) {
  const token = getToken();
  if (!token) {
    clearAuthAndRedirect();
    return null;
  }
  try {
    const options = {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    };
    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const res = await fetch('/api' + endpoint, options);
    if (res.status === 401) {
      clearAuthAndRedirect();
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('API Error:', endpoint, e);
    // Notificar error de red
    if (window.GambusinasNotifications) {
      GambusinasNotifications.networkError(e);
    }
    return null;
  }
}

async function apiPatch(endpoint, body) {
  const token = getToken();
  if (!token) {
    clearAuthAndRedirect();
    return null;
  }
  try {
    const res = await fetch('/api' + endpoint, {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    });
    if (res.status === 401) {
      clearAuthAndRedirect();
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('API Error:', endpoint, e);
    return null;
  }
}

// ============================================
// API HELPERS CON NOTIFICACIONES AUTOMÁTICAS
// ============================================

/**
 * API GET con notificación automática de error
 */
async function apiGetWithNotify(endpoint, options = {}) {
  const { silentError = false, silentSuccess = true } = options;
  const result = await apiGet(endpoint);
  
  if (!result) {
    if (!silentError && window.GambusinasNotifications) {
      GambusinasNotifications.error('Error de conexión', 'No se pudo obtener los datos');
    }
    return { success: false, error: 'connection_error' };
  }
  
  if (result.success === false && !silentError) {
    if (window.GambusinasNotifications) {
      GambusinasNotifications.error(result.message || 'Error al obtener datos');
    }
  }
  
  return result;
}

/**
 * API POST con notificación automática
 */
async function apiPostWithNotify(endpoint, body, options = {}) {
  const { 
    silentError = false, 
    silentSuccess = false,
    successMessage = null,
    auditEvent = null,
    entityId = null,
    entityType = null,
    entityName = null
  } = options;
  
  const result = await apiPost(endpoint, body);
  
  if (!result) {
    if (!silentError && window.GambusinasNotifications) {
      GambusinasNotifications.networkError({});
    }
    return { success: false, error: 'connection_error' };
  }
  
  if (result.success === false) {
    if (!silentError && window.GambusinasNotifications) {
      GambusinasNotifications.error(result.message || 'Error en la operación');
    }
    return result;
  }
  
  // Éxito
  if (!silentSuccess && window.GambusinasNotifications) {
    // Si es un evento de auditoría, usar notificación especial
    if (auditEvent) {
      GambusinasNotifications.audit({
        eventType: auditEvent,
        entityId: entityId || result.data?._id || result._id,
        entityType: entityType,
        entityName: entityName || result.data?.nombre || result.nombre,
        title: successMessage || result.message || 'Operación completada'
      });
    } else {
      GambusinasNotifications.success(successMessage || result.message || 'Operación exitosa');
    }
  }
  
  return result;
}

/**
 * API PUT con notificación automática
 */
async function apiPutWithNotify(endpoint, body, options = {}) {
  const { 
    silentError = false, 
    silentSuccess = false,
    successMessage = null,
    auditEvent = null,
    entityId = null,
    entityType = null,
    entityName = null
  } = options;
  
  const result = await apiPut(endpoint, body);
  
  if (!result) {
    if (!silentError && window.GambusinasNotifications) {
      GambusinasNotifications.networkError({});
    }
    return { success: false, error: 'connection_error' };
  }
  
  if (result.success === false) {
    if (!silentError && window.GambusinasNotifications) {
      GambusinasNotifications.error(result.message || 'Error en la operación');
    }
    return result;
  }
  
  // Éxito
  if (!silentSuccess && window.GambusinasNotifications) {
    if (auditEvent) {
      GambusinasNotifications.audit({
        eventType: auditEvent,
        entityId: entityId || result.data?._id || result._id,
        entityType: entityType,
        entityName: entityName || result.data?.nombre || result.nombre,
        title: successMessage || result.message || 'Actualizado correctamente'
      });
    } else {
      GambusinasNotifications.success(successMessage || result.message || 'Actualizado correctamente');
    }
  }
  
  return result;
}

/**
 * API DELETE con notificación de auditoría automática
 */
async function apiDeleteWithNotify(endpoint, body, options = {}) {
  const { 
    silentError = false, 
    silentSuccess = false,
    successMessage = null,
    auditEvent = 'eliminacion', // Por defecto es un evento de auditoría
    entityId = null,
    entityType = null,
    entityName = null,
    confirmMessage = null // Si se provee, muestra advertencia antes
  } = options;
  
  // Si hay mensaje de confirmación y no se confirmó, mostrar advertencia
  if (confirmMessage && window.GambusinasNotifications) {
    GambusinasNotifications.warning('Confirmación requerida', confirmMessage);
    // Nota: La confirmación real debe manejarse con un modal en la UI
  }
  
  const result = await apiDelete(endpoint, body);
  
  if (!result) {
    if (!silentError && window.GambusinasNotifications) {
      GambusinasNotifications.networkError({});
    }
    return { success: false, error: 'connection_error' };
  }
  
  if (result.success === false) {
    if (!silentError && window.GambusinasNotifications) {
      GambusinasNotifications.error(result.message || 'Error al eliminar');
    }
    return result;
  }
  
  // Éxito - Las eliminaciones siempre son eventos de auditoría
  if (!silentSuccess && window.GambusinasNotifications) {
    GambusinasNotifications.audit({
      eventType: auditEvent,
      entityId: entityId || result.data?._id || result._id,
      entityType: entityType,
      entityName: entityName || result.data?.nombre || result.nombre,
      title: successMessage || result.message || 'Elemento eliminado',
      message: 'Esta acción ha sido registrada en auditoría'
    });
  }
  
  return result;
}

// ============================================
// HELPERS ESPECÍFICOS POR MÓDULO
// ============================================

/**
 * Helper para operaciones de Comandas
 */
const ComandaAPI = {
  async crear(data) {
    return apiPostWithNotify('/comanda', data, {
      successMessage: 'Comanda creada correctamente',
      auditEvent: 'comanda_creada',
      entityType: 'comanda'
    });
  },
  
  async editar(id, data) {
    return apiPutWithNotify(`/comanda/${id}`, data, {
      successMessage: 'Comanda actualizada',
      auditEvent: 'comanda_editada',
      entityId: id,
      entityType: 'comanda'
    });
  },
  
  async eliminar(id, motivo, comandaNumber) {
    return apiDeleteWithNotify(`/comanda/${id}`, { motivo }, {
      successMessage: `Comanda #${comandaNumber} eliminada`,
      auditEvent: 'comanda_eliminada',
      entityId: id,
      entityType: 'comanda',
      entityName: `Comanda #${comandaNumber}`
    });
  },
  
  async eliminarPlato(comandaId, platoId, motivo, platoNombre) {
    return apiDeleteWithNotify(`/comanda/${comandaId}/plato/${platoId}`, { motivo }, {
      successMessage: `Plato "${platoNombre}" eliminado`,
      auditEvent: 'ELIMINAR_PLATO_COMANDA',
      entityId: comandaId,
      entityType: 'comanda',
      entityName: platoNombre
    });
  }
};

/**
 * Helper para operaciones de Platos
 */
const PlatoAPI = {
  async crear(data) {
    return apiPostWithNotify('/platos', data, {
      successMessage: `Plato "${data.nombre}" creado`,
      auditEvent: 'plato_agregado',
      entityType: 'plato'
    });
  },
  
  async editar(id, data) {
    return apiPutWithNotify(`/platos/${id}`, data, {
      successMessage: 'Plato actualizado',
      auditEvent: 'plato_modificado',
      entityId: id,
      entityType: 'plato'
    });
  },
  
  async eliminar(id, nombre) {
    return apiDeleteWithNotify(`/platos/${id}`, {}, {
      successMessage: `Plato "${nombre}" eliminado`,
      auditEvent: 'plato_eliminado',
      entityId: id,
      entityType: 'plato',
      entityName: nombre
    });
  }
};

/**
 * Helper para operaciones de Mesas
 */
const MesaAPI = {
  async crear(data) {
    return apiPostWithNotify('/mesas', data, {
      successMessage: `Mesa ${data.numero} creada`,
      auditEvent: 'mesa_creada',
      entityType: 'mesa'
    });
  },
  
  async editar(id, data) {
    return apiPutWithNotify(`/mesas/${id}`, data, {
      successMessage: 'Mesa actualizada',
      auditEvent: 'mesa_modificada',
      entityId: id,
      entityType: 'mesa'
    });
  },
  
  async eliminar(id, numero) {
    return apiDeleteWithNotify(`/mesas/${id}`, {}, {
      successMessage: `Mesa ${numero} eliminada`,
      auditEvent: 'mesa_eliminada',
      entityId: id,
      entityType: 'mesa',
      entityName: `Mesa ${numero}`
    });
  },
  
  async cambiarEstado(id, estado, numero) {
    return apiPutWithNotify(`/mesas/${id}/estado`, { estado }, {
      successMessage: `Mesa ${numero}: ${estado}`,
      silentSuccess: true // No mostrar notificación para cambios de estado frecuentes
    });
  }
};

/**
 * Helper para operaciones de Bouchers/Pagos
 */
const BoucherAPI = {
  async crear(data) {
    return apiPostWithNotify('/bouchers', data, {
      successMessage: 'Pago procesado correctamente',
      auditEvent: 'pago_procesado',
      entityType: 'pago'
    });
  },
  
  async anular(id, motivo) {
    return apiDeleteWithNotify(`/bouchers/${id}`, { motivo }, {
      successMessage: 'Boucher anulado',
      auditEvent: 'boucher_anulado',
      entityId: id,
      entityType: 'boucher'
    });
  }
};

/**
 * Helper para operaciones de Cierre de Caja
 */
const CierreCajaAPI = {
  async generar(data) {
    return apiPostWithNotify('/cierre-caja', data, {
      successMessage: 'Cierre de caja generado',
      auditEvent: 'cierre_caja_generado',
      entityType: 'cierre_caja'
    });
  },
  
  async reabrir(id) {
    return apiPutWithNotify(`/cierre-caja/${id}/reabrir`, {}, {
      successMessage: 'Cierre de caja reabierto',
      auditEvent: 'cierre_caja_reapertura',
      entityId: id,
      entityType: 'cierre_caja'
    });
  }
};

/**
 * Helper para operaciones de Configuración
 */
const ConfiguracionAPI = {
  async guardar(data) {
    return apiPutWithNotify('/configuracion', data, {
      successMessage: 'Configuración guardada',
      auditEvent: 'configuracion_actualizada',
      entityType: 'configuracion'
    });
  }
};

// Exponer globalmente
window.sharedData = sharedData;
window.mesaClass = mesaClass;
window.mesaBorderClass = mesaBorderClass;
window.mesaBadge = mesaBadge;
window.filteredMesas = filteredMesas;
window.initClock = initClock;
window.setActiveNav = setActiveNav;
window.getToken = getToken;
window.clearAuthAndRedirect = clearAuthAndRedirect;
window.apiGet = apiGet;
window.apiPost = apiPost;
window.apiPut = apiPut;
window.apiDelete = apiDelete;
window.apiPatch = apiPatch;

// API con notificaciones
window.apiGetWithNotify = apiGetWithNotify;
window.apiPostWithNotify = apiPostWithNotify;
window.apiPutWithNotify = apiPutWithNotify;
window.apiDeleteWithNotify = apiDeleteWithNotify;

// Helpers específicos por módulo
window.ComandaAPI = ComandaAPI;
window.PlatoAPI = PlatoAPI;
window.MesaAPI = MesaAPI;
window.BoucherAPI = BoucherAPI;
window.CierreCajaAPI = CierreCajaAPI;
window.ConfiguracionAPI = ConfiguracionAPI;
