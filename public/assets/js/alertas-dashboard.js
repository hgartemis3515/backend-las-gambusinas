/**
 * Las Gambusinas — Alertas Dashboard
 *
 * Sistema de Alertas operativas: overlay a pantalla completa + composer para
 * que admin/supervisor envíen avisos a usuarios/roles/cocineras/pantallas.
 *
 * Módulo independiente del chat-dashboard.js para no acoplarse al FAB de chat.
 * Se inicializa a nivel global en las páginas del dashboard.
 *
 * Características:
 *  - Overlay overlay a fullscreen al recibir `alerta:nueva` (socket /admin).
 *  - Botón flotante "🚨" para abrir el composer (requiere permiso enviar-alertas
 *    o enviar-anuncios).
 *  - Composer con: texto, prioridad, destino (todos / roles / usuarios / cocineras),
 *    duración, color y sonido.
 *  - Listado de alertas recientes y botón "Cancelar" para overlays activos.
 *  - Auto-recuperación con GET /api/alertas/activas al conectar.
 *
 * Sigue el patrón de notificaciones-dashboard.js (clase + global + auto-init).
 */
class AlertasDashboard {
  constructor() {
    this.socket = null;
    this.usuarios = [];
    this.cocineras = [];
    this.alertasRecientes = [];
    this.alertaActiva = null; // overlay actual
    this.overlayTimeout = null;
    this.audioCache = new Map();
    this.presets = {
      sonidos: [
        { clave: 'beep', label: 'Beep corto' },
        { clave: 'doble-beep', label: 'Doble beep' },
        { clave: 'sirena', label: 'Sirena (loop)' },
        { clave: 'chime', label: 'Campana suave' },
        { clave: 'silencio', label: 'Sin sonido' }
      ],
      colores: [
        { clave: '#3498db', label: 'Azul (info)' },
        { clave: '#f39c12', label: 'Naranja (atención)' },
        { clave: '#e74c3c', label: 'Rojo (urgente)' },
        { clave: '#c0392b', label: 'Rojo oscuro (crítica)' },
        { clave: '#27ae60', label: 'Verde (ok)' }
      ],
      defaults: { duracionMs: 15000, colorHex: '#e74c3c', sonidoClave: 'sirena' }
    };
  }

  async init() {
    if (!this.tienePermiso()) return;
    await this.cargarPresets();
    await this.cargarUsuarios();
    await this.cargarAlertasRecientes();
    this.injectarDOM();
    this.conectarSocket();
    console.log('🚨 Alertas Dashboard listo');
  }

  tienePermiso() {
    try {
      const token = getToken();
      if (!token) return false;
      const payload = JSON.parse(atob(token.split('.')[1]));
      const perms = payload.permisos || [];
      return payload.rol === 'admin' ||
        perms.includes('enviar-alertas') ||
        perms.includes('enviar-anuncios');
    } catch { return false; }
  }

  async cargarPresets() {
    try {
      const data = await apiGet('/alertas/presets');
      if (data?.success && data?.data) {
        this.presets = { ...this.presets, ...data.data };
      }
    } catch (_) { /* usar defaults */ }
  }

  async cargarUsuarios() {
    try {
      // Reusa el endpoint existente del controller de mozos
      const data = await apiGet('/mozos?activos=true');
      const list = Array.isArray(data) ? data : (data?.data || data?.mozos || []);
      this.usuarios = list;
      this.cocineras = list.filter(u => u.rol === 'cocinero');
    } catch (_) { /* silencioso */ }
  }

  async cargarAlertasRecientes() {
    try {
      const data = await apiGet('/alertas?limit=20');
      this.alertasRecientes = data?.data || [];
      this._renderListaAlertas();
    } catch (_) { /* silencioso */ }
  }

  // ==================== DOM ====================

  injectarDOM() {
    if (document.getElementById('alertas-fab-gambusinas')) return;

    // FAB 🚨
    const fab = document.createElement('div');
    fab.id = 'alertas-fab-gambusinas';
    fab.style.cssText = [
      'position: fixed', 'bottom: max(16px, env(safe-area-inset-bottom, 0px))',
      'right: max(88px, calc(16px + env(safe-area-inset-right, 0px) + 56px + 16px))',
      'z-index: 9998', 'width: 48px', 'height: 48px', 'border-radius: 50%',
      'background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)',
      'color: white', 'display: flex', 'align-items: center', 'justify-content: center',
      'font-size: 22px', 'cursor: pointer', 'box-shadow: 0 6px 20px rgba(0,0,0,0.45)',
      'transition: transform 0.15s ease'
    ].join(';');
    fab.innerHTML = '🚨';
    fab.title = 'Enviar alerta operativa';
    fab.addEventListener('mouseenter', () => { fab.style.transform = 'scale(1.08)'; });
    fab.addEventListener('mouseleave', () => { fab.style.transform = 'scale(1)'; });
    fab.addEventListener('click', () => this.abrirComposer());
    document.body.appendChild(fab);

    // Panel composer + lista
    const panel = document.createElement('div');
    panel.id = 'alertas-panel-gambusinas';
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = this._renderComposer();
    document.body.appendChild(panel);
    this._wireComposer();

    // Overlay global (alerta entrante)
    const overlay = document.createElement('div');
    overlay.id = 'alerta-overlay-gambusinas';
    overlay.style.cssText = 'display:none';
    document.body.appendChild(overlay);
  }

  _renderComposer() {
    const sonidosOpts = this.presets.sonidos.map(s =>
      `<option value="${s.clave}">${s.label}</option>`).join('');
    const coloresOpts = this.presets.colores.map(c =>
      `<option value="${c.clave}">${c.label}</option>`).join('');
    const prioOpts = `
      <option value="normal">Normal (5)</option>
      <option value="alta">Alta (7)</option>
      <option value="urgente" selected>Urgente (9)</option>
      <option value="critica">Crítica (10)</option>`;

    return `
      <div class="alertas-panel-backdrop" data-close="1"></div>
      <div class="alertas-panel-card">
        <div class="alertas-panel-header">
          <h2>🚨 Enviar alerta</h2>
          <button class="alertas-close" data-close="1" title="Cerrar">×</button>
        </div>

        <div class="alertas-panel-body">
          <label class="alertas-label">Mensaje</label>
          <textarea id="alerta-texto" rows="2" maxlength="280"
            placeholder="Ej: Martha, priorizar mesa 12 — cliente esperando"></textarea>

          <div class="alertas-row">
            <div>
              <label class="alertas-label">Prioridad</label>
              <select id="alerta-prioridad">${prioOpts}</select>
            </div>
            <div>
              <label class="alertas-label">Destino</label>
              <select id="alerta-destino-modo">
                <option value="seleccion">Selección</option>
                <option value="todos">Todos</option>
              </select>
            </div>
          </div>

          <div id="alerta-destino-seleccion">
            <label class="alertas-label">Roles</label>
            <div class="alertas-chips" id="alerta-roles-chips">
              ${['mozos', 'capitanMozos', 'cocinero', 'cajero', 'supervisor', 'admin']
                .map(r => `<label class="chip"><input type="checkbox" value="${r}"> ${r}</label>`).join('')}
            </div>

            <label class="alertas-label">Usuarios / Cocineras</label>
            <select id="alerta-usuarios" multiple size="6" style="width:100%">
              ${this.usuarios.map(u => `<option value="${u._id}">${u.name} (${u.rol})</option>`).join('')}
            </select>
            <p class="alertas-hint">Mantén Ctrl/Cmd para elegir varios. Los cocineros se resuelven a sus TVs.</p>
          </div>

          <div class="alertas-row">
            <div>
              <label class="alertas-label">Duración (s)</label>
              <input type="number" id="alerta-duracion" min="1" max="120" value="15">
            </div>
            <div>
              <label class="alertas-label">Color</label>
              <select id="alerta-color">${coloresOpts}</select>
            </div>
            <div>
              <label class="alertas-label">Sonido</label>
              <select id="alerta-sonido">${sonidosOpts}</select>
            </div>
          </div>

          <label class="chip" style="margin-top:8px">
            <input type="checkbox" id="alerta-ack"> Requiere "Entendido" (no auto-cierra)
          </label>

          <div class="alertas-actions">
            <button id="alerta-enviar" class="btn-alerta-enviar">Enviar alerta</button>
          </div>

          <hr class="alertas-divider">

          <h3>Alertas recientes</h3>
          <div id="alerta-lista-recientes" class="alerta-lista"></div>
        </div>
      </div>
    `;
  }

  _wireComposer() {
    const panel = document.getElementById('alertas-panel-gambusinas');
    panel.querySelectorAll('[data-close="1"]').forEach(el => {
      el.addEventListener('click', () => this.cerrarComposer());
    });
    const destinoModo = document.getElementById('alerta-destino-modo');
    destinoModo.addEventListener('change', () => {
      const sel = document.getElementById('alerta-destino-seleccion');
      sel.style.display = destinoModo.value === 'todos' ? 'none' : 'block';
    });

    document.getElementById('alerta-enviar').addEventListener('click', () => this.enviarAlerta());

    this._renderListaAlertas();
  }

  abrirComposer() {
    const panel = document.getElementById('alertas-panel-gambusinas');
    if (panel) {
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      this.cargarAlertasRecientes();
    }
  }

  cerrarComposer() {
    const panel = document.getElementById('alertas-panel-gambusinas');
    if (panel) {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
    }
  }

  async enviarAlerta() {
    const texto = document.getElementById('alerta-texto').value.trim();
    if (!texto) { alert('Escribe el mensaje de la alerta'); return; }

    const prioridadCodigo = document.getElementById('alerta-prioridad').value;
    const destinoModo = document.getElementById('alerta-destino-modo').value;
    const roles = Array.from(document.querySelectorAll('#alerta-roles-chips input:checked'))
      .map(c => c.value);
    const usuarios = Array.from(document.getElementById('alerta-usuarios').selectedOptions)
      .map(o => o.value);
    const duracionS = parseInt(document.getElementById('alerta-duracion').value, 10) || 15;
    const colorHex = document.getElementById('alerta-color').value;
    const sonidoClave = document.getElementById('alerta-sonido').value;
    const requiereAck = document.getElementById('alerta-ack').checked;

    // Separar cocineras del resto de usuarios (para targeting de TVs)
    const cocineras = usuarios.filter(id => {
      const u = this.usuarios.find(x => x._id === id);
      return u && u.rol === 'cocinero';
    });
    const usuariosSolo = usuarios.filter(id => !cocineras.includes(id));

    const body = {
      texto,
      prioridadCodigo,
      targeting: destinoModo === 'todos'
        ? { todos: true }
        : {
            todos: false,
            roles,
            usuarios: usuariosSolo,
            cocineras
          },
      estilo: {
        duracionMs: duracionS * 1000,
        colorHex,
        sonidoClave,
        requiereAck
      }
    };

    const btn = document.getElementById('alerta-enviar');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const resp = await apiPost('/alertas', body);
      if (resp?.success) {
        document.getElementById('alerta-texto').value = '';
        this.cargarAlertasRecientes();
        // Feedback visual breve
        btn.textContent = '✓ Enviada';
        setTimeout(() => { btn.textContent = 'Enviar alerta'; btn.disabled = false; }, 1500);
      } else {
        alert(resp?.error || 'Error al enviar');
        btn.disabled = false; btn.textContent = 'Enviar alerta';
      }
    } catch (e) {
      alert('Error: ' + e.message);
      btn.disabled = false; btn.textContent = 'Enviar alerta';
    }
  }

  _renderListaAlertas() {
    const cont = document.getElementById('alerta-lista-recientes');
    if (!cont) return;
    if (!this.alertasRecientes.length) {
      cont.innerHTML = '<p class="alertas-empty">Sin alertas recientes.</p>';
      return;
    }
    cont.innerHTML = this.alertasRecientes.map(a => {
      const destino = a.targeting?.todos ? '🌍 Todos'
        : (a.targeting?.cocineras?.length ? `👩‍🍳 ${a.targeting.cocineras.length} cocinera(s)`
        : (a.targeting?.roles?.length ? `🏷️ ${a.targeting.roles.join(', ')}`
        : (a.targeting?.usuarios?.length ? `👤 ${a.targeting.usuarios.length} usuario(s)` : '—')));
      const estado = a.estado === 'activa' ? '🟢' : (a.estado === 'cancelada' ? '⛔' : '⚪');
      const puedeCancelar = a.estado === 'activa';
      return `
        <div class="alerta-item" data-id="${a._id}">
          <div class="alerta-item-top">
            <span class="alerta-prio prio-${a.prioridadCodigo}">${a.prioridadCodigo}</span>
            <span class="alerta-dest">${destino}</span>
            <span class="alerta-estado">${estado}</span>
          </div>
          <div class="alerta-item-text">${this._esc(a.texto)}</div>
          <div class="alerta-item-meta">
            ${a.creadoPorNombre || ''} · ${new Date(a.createdAt || a.emitidaAt).toLocaleTimeString()}
            ${puedeCancelar ? ` · <a href="#" data-cancel="${a._id}">Cancelar</a>` : ''}
          </div>
        </div>`;
    }).join('');

    cont.querySelectorAll('[data-cancel]').forEach(a => {
      a.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const id = a.getAttribute('data-cancel');
        try {
          await apiPatch(`/alertas/${id}/cancelar`, {});
          this.cargarAlertasRecientes();
        } catch (e) { alert('No se pudo cancelar: ' + e.message); }
      });
    });
  }

  _esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ==================== OVERLAY (alerta entrante) ====================

  mostrarOverlay(alerta) {
    const overlay = document.getElementById('alerta-overlay-gambusinas');
    if (!overlay) return;

    // Si hay una activa y no requiere ack, reemplazamos (la más reciente gana)
    clearTimeout(this.overlayTimeout);

    const color = alerta.estilo?.colorHex || '#e74c3c';
    const sonido = alerta.estilo?.sonidoClave || 'sirena';
    const duracionMs = alerta.estilo?.duracionMs || 15000;
    const requiereAck = alerta.estilo?.requiereAck;

    overlay.style.cssText = [
      'position: fixed', 'inset: 0', 'z-index: 100000',
      'display: flex', 'align-items: center', 'justify-content: center',
      `background: ${color}E6`,
      'color: white', 'font-family: system-ui, sans-serif',
      'animation: alerta-fade-in 0.15s ease-out'
    ].join(';');

    overlay.innerHTML = `
      <div style="text-align:center; max-width: 80vw; padding: 32px">
        <div style="font-size: 72px; margin-bottom: 16px">🚨</div>
        <div style="font-size: 14px; opacity: 0.85; letter-spacing: 2px; text-transform: uppercase">
          Alerta ${alerta.prioridadCodigo || 'urgente'}
        </div>
        <div style="font-size: 32px; font-weight: 700; margin: 12px 0; line-height: 1.2">
          ${this._esc(alerta.texto)}
        </div>
        <div style="font-size: 14px; opacity: 0.8">
          De: ${this._esc(alerta.creadoPorNombre || 'Sistema')}
        </div>
        <button id="alerta-dismiss" style="margin-top:24px; padding:12px 28px; background:rgba(0,0,0,0.4); color:white; border:none; border-radius:8px; font-size:16px; cursor:pointer">
          Entendido
        </button>
      </div>
    `;

    this.alertaActiva = alerta;
    this._reproducirSonido(sonido);

    const dismiss = () => this.ocultarOverlay(alerta._id);
    overlay.querySelector('#alerta-dismiss').addEventListener('click', dismiss);

    if (!requiereAck) {
      this.overlayTimeout = setTimeout(dismiss, duracionMs);
    }
  }

  ocultarOverlay(alertaId) {
    clearTimeout(this.overlayTimeout);
    const overlay = document.getElementById('alerta-overlay-gambusinas');
    if (overlay) overlay.style.display = 'none';
    if (alertaId && this.socket) {
      try { this.socket.emit('alerta:ack', { alertaId }); } catch (_) { /* noop */ }
    }
    this.alertaActiva = null;
    this._detenerSonido();
  }

  // ==================== SONIDO ====================

  _reproducirSonido(clave) {
    if (!clave || clave === 'silencio') return;
    try {
      let audio = this.audioCache.get(clave);
      if (!audio) {
        audio = new Audio(`/sounds/alertas/${clave}.mp3`);
        audio.load();
        this.audioCache.set(clave, audio);
      }
      audio.currentTime = 0;
      audio.loop = clave === 'sirena';
      audio.play().catch(() => { /* autoplay bloqueado */ });
    } catch (_) { /* noop */ }
  }

  _detenerSonido() {
    for (const audio of this.audioCache.values()) {
      try { audio.pause(); audio.currentTime = 0; } catch (_) { /* noop */ }
    }
  }

  // ==================== SOCKET ====================

  conectarSocket() {
    // Reusa el namespace /admin ya conectado por el chat dashboard si existe.
    const makeNs = () => {
      try {
        const token = getToken();
        if (!token) return null;
        const origin = window.location.origin;
        return io(`${origin}/admin`, { transports: ['websocket', 'polling'], auth: { token } });
      } catch { return null; }
    };

    // Si el chat-dashboard ya abrió el namespace, reusamos el global.
    this.socket = (window.__chatDashboardSocket || null);
    if (!this.socket) this.socket = makeNs();
    if (!this.socket) return;

    const bind = () => {
      this.socket.on('alerta:nueva', (data) => this.mostrarOverlay(data));
      this.socket.on('alerta:cancelada', ({ alertaId }) => {
        if (this.alertaActiva?._id === alertaId || this.alertaActiva?.alertaId === alertaId) {
          this.ocultarOverlay(alertaId);
        }
      });
    };
    bind();

    // Recuperar alertas activas tras conectar/reconectar
    const recuperar = async () => {
      try {
        const data = await apiGet('/alertas/activas');
        if (data?.success && Array.isArray(data.data)) {
          // Mostrar solo la más reciente si hay varias
          const activas = data.data.filter(a => new Date(a.expiraAt) > new Date());
          if (activas.length) this.mostrarOverlay(activas[0]);
        }
      } catch (_) { /* silencioso */ }
    };
    this.socket.on('connect', recuperar);
    if (this.socket.connected) recuperar();
  }
}

// Auto-init en el dashboard (sigue el mismo patrón que notificaciones-dashboard.js)
if (typeof window !== 'undefined') {
  window.AlertasDashboard = AlertasDashboard;
  window.__alertasDashboardInstance = null;
  window.initAlertasDashboard = function () {
    if (window.__alertasDashboardInstance) return;
    const inst = new AlertasDashboard();
    window.__alertasDashboardInstance = inst;
    inst.init().catch(e => console.error('Error init alertas', e));
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.initAlertasDashboard());
  } else {
    window.initAlertasDashboard();
  }
}
