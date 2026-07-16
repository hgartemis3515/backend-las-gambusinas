/**
 * Las Gambusinas — Chat Dashboard (Messenger-like, FAB inferior derecha)
 *
 * Rediseño v2: panel split tipo Messenger:
 *  - Columna izquierda: lista de contactos/usuarios (todos los mozos), canales y anuncios.
 *  - Columna derecha: hilo de la conversación seleccionada.
 *  - Composer con texto + nota de voz (MediaRecorder).
 *
 * Sigue el patrón de notificaciones-dashboard.js (clase + global + auto-init).
 */

class ChatDashboard {
  constructor() {
    this.socket = null;
    this.usuarios = [];
    this.conversaciones = [];
    this.convActiva = null;
    this.mensajes = [];
    this.anclados = [];
    this.noLeidos = 0;
    this.panelAbierto = false;
    this.vistaHiloMovil = false;
    this.cargando = false;
    this.pollingInterval = null;
    this.typingTimers = {};
    this.replyTo = null;
    this.vista = 'conversaciones'; // 'conversaciones' | 'usuarios' | 'anuncios'
    this.busqueda = '';
    this.grabandoVoz = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recordingStream = null;

    this.config = {
      pollingTime: 30000,
      maxMensajes: 50,
      // Sin prefijo /api: apiGet/apiPost/apiPatch de shared.js ya anteponen '/api'
      apiBase: '/mensajes'
    };
  }

  async init() {
    if (!this.tienePermiso()) return;
    this.injectarDOM();
    await this.cargarConversaciones();
    await this.cargarUsuarios();
    await this.actualizarBadge();
    this.conectarSocket();
    this.iniciarPolling();

    const params = new URLSearchParams(window.location.search);
    if (params.get('abrirChat') === '1' && params.get('c')) {
      this.abrirPanel();
      this.abrirConversacion(params.get('c'));
    }
    console.log('💬 Chat Dashboard listo');
  }

  tienePermiso() {
    try {
      const token = getToken();
      if (!token) return false;
      const payload = JSON.parse(atob(token.split('.')[1]));
      const perms = payload.permisos || [];
      return payload.rol === 'admin' || perms.includes('ver-mensajes');
    } catch { return false; }
  }

  // ==================== DOM ====================

  injectarDOM() {
    if (document.getElementById('chat-fab-gambusinas')) return;

    // FAB
    const fab = document.createElement('div');
    fab.id = 'chat-fab-gambusinas';
    fab.style.cssText = [
      'position: fixed', 'bottom: max(16px, env(safe-area-inset-bottom, 0px))',
      'right: max(16px, env(safe-area-inset-right, 0px))', 'z-index: 9999',
      'width: 56px', 'height: 56px', 'border-radius: 50%',
      'background: linear-gradient(135deg, #d4af37 0%, #b8860b 100%)',
      'color: #0a0a0f', 'display: flex', 'align-items: center', 'justify-content: center',
      'font-size: 24px', 'cursor: pointer', 'box-shadow: 0 6px 20px rgba(0,0,0,0.45)',
      'transition: transform 0.15s ease, box-shadow 0.15s ease',
      'touch-action: manipulation'
    ].join(';');
    fab.innerHTML = '💬';
    fab.title = 'Chat interno';
    fab.addEventListener('mouseenter', () => { fab.style.transform = 'scale(1.08)'; });
    fab.addEventListener('mouseleave', () => { fab.style.transform = 'scale(1)'; });
    fab.addEventListener('click', () => this.abrirPanel());

    const badge = document.createElement('span');
    badge.id = 'chat-fab-badge';
    badge.style.cssText = [
      'position: absolute', 'top: -4px', 'right: -4px', 'min-width: 20px', 'height: 20px',
      'padding: 0 4px', 'border-radius: 10px', 'background: #ff4757', 'color: white',
      'font-size: 11px', 'font-weight: bold', 'display: none',
      'align-items: center', 'justify-content: center'
    ].join(';');
    fab.appendChild(badge);
    document.body.appendChild(fab);

    // Panel Messenger-like: split 2 columnas (responsive vía CSS)
    const panel = document.createElement('div');
    panel.id = 'chat-panel-gambusinas';
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = this.renderPlantilla();
    document.body.appendChild(panel);

    this.wireEventos();
    this._bindResize();
  }

  renderPlantilla() {
    return `
      <div class="chat-layout">
        <!-- Columna izquierda: contactos -->
        <div class="chat-sidebar" id="chat-sidebar">
          <div class="chat-sidebar-header">
            <div class="chat-brand">💬 Chat</div>
            <div class="chat-tabs">
              <button id="chat-tab-conversaciones" class="chat-tab active">Recientes</button>
              <button id="chat-tab-usuarios" class="chat-tab">Personas</button>
              <button id="chat-tab-anuncios" class="chat-tab">📢</button>
              <button id="chat-btn-cerrar" title="Cerrar" class="chat-btn-icon">✕</button>
            </div>
          </div>
          <div class="chat-search-wrap">
            <input id="chat-buscador" type="text" placeholder="Buscar persona, canal o mensaje..." />
          </div>
          <div id="chat-sidebar-lista" class="chat-sidebar-lista"></div>
        </div>

        <!-- Columna derecha: hilo -->
        <div class="chat-hilo" id="chat-hilo">
          <div id="chat-hilo-header" class="chat-hilo-header">
            <button id="chat-btn-atras" class="chat-btn-atras" title="Volver" aria-label="Volver">‹</button>
            <div id="chat-hilo-titulo" class="chat-hilo-titulo">Selecciona una conversación</div>
            <div id="chat-hilo-acciones" class="chat-hilo-acciones"></div>
          </div>
          <div id="chat-mensajes" class="chat-mensajes"></div>
          <div id="chat-typing-bar" class="chat-typing-bar"></div>
          <div id="chat-composer" class="chat-composer">
            <button id="chat-btn-adjuntar" title="Adjuntar audio" class="chat-btn-icon soft">📎</button>
            <input id="chat-audio-file" type="file" accept="audio/mp4,audio/m4a,audio/webm,audio/ogg,audio/aac" style="display:none;" />
            <div class="chat-input-wrap">
              <select id="chat-prioridad">
                <option value="normal">Normal</option>
                <option value="baja">Baja</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
                <option value="critica">Crítica</option>
              </select>
              <input id="chat-input" type="text" placeholder="Escribe un mensaje..." />
            </div>
            <button id="chat-btn-mic" title="Nota de voz" class="chat-btn-round gold">🎤</button>
            <button id="chat-btn-enviar" title="Enviar" class="chat-btn-round blue">➤</button>
          </div>
          <div id="chat-recording-bar" class="chat-recording-bar">
            <div class="chat-rec-dot"></div>
            <span id="chat-recording-time">Grabando... 0s</span>
            <div style="flex:1;"></div>
            <button id="chat-btn-cancelar-voz" class="chat-btn-outline-danger">Cancelar</button>
            <button id="chat-btn-detener-voz" class="chat-btn-danger">Enviar ✓</button>
          </div>
          <div id="chat-anuncio-composer" class="chat-anuncio-composer">
            <textarea id="anuncio-texto" placeholder="Texto del anuncio..."></textarea>
            <div class="chat-anuncio-row">
              <select id="anuncio-prioridad">
                <option value="alta" selected>Alta</option>
                <option value="urgente">Urgente</option>
                <option value="critica">Crítica</option>
              </select>
              <select id="anuncio-roles" multiple>
                <option value="admin">admin</option>
                <option value="supervisor">supervisor</option>
                <option value="mozos">mozos</option>
                <option value="capitanMozos">capitanMozos</option>
                <option value="cocinero">cocinero</option>
                <option value="cajero">cajero</option>
              </select>
              <button id="anuncio-enviar">📢 Enviar</button>
            </div>
          </div>
        </div>
      </div>
      <style>
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        #chat-panel-gambusinas {
          position: fixed;
          bottom: 0; right: 0;
          width: min(880px, 100vw);
          height: 100vh;
          height: 100dvh;
          background: #1a1a28;
          border-left: 1px solid rgba(212,175,55,0.25);
          box-shadow: -8px 0 32px rgba(0,0,0,0.6);
          z-index: 10000;
          display: none;
          color: #fff;
          font-family: Inter, system-ui, sans-serif;
          overflow: hidden;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        #chat-panel-gambusinas.chat-open { display: block; }

        .chat-layout { display: flex; height: 100%; width: 100%; }
        .chat-sidebar {
          width: 320px; max-width: 42%;
          border-right: 1px solid rgba(212,175,55,0.15);
          display: flex; flex-direction: column; background: #12121a; min-width: 0;
        }
        .chat-sidebar-header {
          padding: 12px 12px 10px; display: flex; align-items: center; justify-content: space-between;
          gap: 8px; border-bottom: 1px solid rgba(212,175,55,0.15); flex-wrap: wrap;
        }
        .chat-brand { font-weight: 700; color: #d4af37; font-size: 16px; white-space: nowrap; }
        .chat-tabs { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
        .chat-tab {
          background: transparent; border: 1px solid rgba(212,175,55,0.15); color: #a0a0b8;
          border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer;
        }
        .chat-tab.active { border-color: rgba(212,175,55,0.6); color: #d4af37; }
        .chat-btn-icon {
          background: transparent; border: none; color: #a0a0b8; cursor: pointer; font-size: 20px;
          padding: 4px 8px; line-height: 1;
        }
        .chat-btn-icon.soft { color: #d4af37; font-size: 20px; }
        .chat-search-wrap { padding: 8px 10px; }
        .chat-search-wrap input {
          width: 100%; box-sizing: border-box; background: #0a0a0f; color: #fff;
          border: 1px solid rgba(212,175,55,0.25); border-radius: 8px; padding: 8px 10px; font-size: 13px;
        }
        .chat-sidebar-lista { flex: 1; overflow-y: auto; padding: 0 6px; -webkit-overflow-scrolling: touch; }

        .chat-hilo { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
        .chat-hilo-header {
          padding: 12px 14px; background: #12121a; border-bottom: 1px solid rgba(212,175,55,0.15);
          display: flex; align-items: center; gap: 8px; min-height: 52px;
        }
        .chat-btn-atras {
          display: none; background: transparent; border: none; color: #d4af37;
          font-size: 28px; line-height: 1; cursor: pointer; padding: 0 4px 0 0;
        }
        .chat-hilo-titulo {
          font-weight: 600; color: #fff; font-size: 14px; flex: 1; min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .chat-hilo-acciones { display: flex; gap: 8px; flex-shrink: 0; }
        .chat-mensajes {
          flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 4px;
          -webkit-overflow-scrolling: touch;
        }
        .chat-typing-bar { padding: 2px 16px 4px; font-size: 11px; color: #a0a0b8; font-style: italic; min-height: 16px; }
        .chat-composer {
          padding: 10px 12px; border-top: 1px solid rgba(212,175,55,0.15); background: #12121a;
          display: flex; gap: 6px; align-items: center;
        }
        .chat-input-wrap {
          flex: 1; display: flex; gap: 6px; align-items: center; min-width: 0;
          background: #0a0a0f; border: 1px solid rgba(212,175,55,0.25); border-radius: 20px; padding: 4px 10px;
        }
        .chat-input-wrap select { background: transparent; color: #d4af37; border: none; font-size: 11px; outline: none; max-width: 72px; }
        .chat-input-wrap input {
          flex: 1; min-width: 0; background: transparent; color: #fff; border: none; outline: none;
          font-size: 14px; padding: 8px 4px;
        }
        .chat-btn-round {
          width: 40px; height: 40px; border-radius: 50%; border: none; font-size: 18px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
          touch-action: manipulation;
        }
        .chat-btn-round.gold { background: #d4af37; color: #0a0a0f; }
        .chat-btn-round.blue { background: #0084ff; color: white; }
        .chat-recording-bar {
          display: none; padding: 10px 14px; background: #2a1a1a; border-top: 1px solid #e74c3c;
          align-items: center; gap: 10px;
        }
        .chat-rec-dot { width: 12px; height: 12px; border-radius: 50%; background: #e74c3c; animation: pulse 1s infinite; }
        .chat-btn-outline-danger, .chat-btn-danger {
          border-radius: 8px; padding: 8px 12px; cursor: pointer; font-size: 12px;
        }
        .chat-btn-outline-danger { background: transparent; border: 1px solid #e74c3c; color: #e74c3c; }
        .chat-btn-danger { background: #e74c3c; border: none; color: white; font-weight: 600; }
        .chat-anuncio-composer {
          display: none; padding: 14px; flex-direction: column; gap: 8px;
          border-top: 1px solid rgba(212,175,55,0.15); background: #12121a;
        }
        .chat-anuncio-composer textarea {
          background: #0a0a0f; color: #fff; border: 1px solid rgba(212,175,55,0.25);
          border-radius: 8px; padding: 10px; font-size: 13px; resize: none; height: 80px;
        }
        .chat-anuncio-row { display: flex; gap: 8px; align-items: stretch; flex-wrap: wrap; }
        .chat-anuncio-row select {
          background: #0a0a0f; color: #fff; border: 1px solid rgba(212,175,55,0.25);
          border-radius: 6px; padding: 6px; font-size: 12px;
        }
        .chat-anuncio-row select[multiple] { flex: 1; min-width: 120px; height: 50px; }
        .chat-anuncio-row button {
          background: #ff4757; color: white; border: none; border-radius: 8px;
          padding: 8px 16px; font-weight: 600; cursor: pointer;
        }

        #chat-sidebar-lista::-webkit-scrollbar, #chat-mensajes::-webkit-scrollbar { width: 6px; }
        #chat-sidebar-lista::-webkit-scrollbar-thumb, #chat-mensajes::-webkit-scrollbar-thumb { background: rgba(212,175,55,0.3); border-radius: 3px; }
        .chat-conv-row, .chat-user-row {
          padding: 10px; border-radius: 10px; cursor: pointer; display: flex; gap: 10px;
          align-items: center; margin-bottom: 2px; position: relative;
        }
        .chat-conv-row:hover, .chat-user-row:hover { background: rgba(212,175,55,0.08); }
        .chat-conv-row.active { background: rgba(212,175,55,0.15); }
        .chat-avatar {
          width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; font-weight: 700; flex-shrink: 0; font-size: 16px;
        }
        .chat-bubble-mia {
          align-self: flex-end; background: #0084ff; color: white;
          border-radius: 18px 18px 4px 18px; padding: 8px 14px; max-width: min(70%, 420px); font-size: 13px;
          word-break: break-word;
        }
        .chat-bubble-otra {
          align-self: flex-start; background: #2a2a3a; color: #fff;
          border-radius: 18px 18px 18px 4px; padding: 8px 14px; max-width: min(70%, 420px); font-size: 13px;
          word-break: break-word;
        }

        /* Tablet */
        @media (max-width: 900px) {
          #chat-panel-gambusinas { width: min(100vw, 720px); }
          .chat-sidebar { width: 280px; max-width: 40%; }
        }

        /* Móvil / teléfono: pantalla completa, una columna a la vez */
        @media (max-width: 700px) {
          #chat-fab-gambusinas {
            width: 52px !important; height: 52px !important; font-size: 22px !important;
            bottom: max(12px, env(safe-area-inset-bottom, 0px)) !important;
            right: max(12px, env(safe-area-inset-right, 0px)) !important;
          }
          #chat-panel-gambusinas {
            width: 100vw; left: 0; right: 0; border-left: none;
            top: 0; bottom: 0;
            padding-top: env(safe-area-inset-top, 0px);
          }
          .chat-sidebar { width: 100%; max-width: none; border-right: none; }
          .chat-hilo { display: none; width: 100%; }
          #chat-panel-gambusinas.chat-mobile-hilo .chat-sidebar { display: none; }
          #chat-panel-gambusinas.chat-mobile-hilo .chat-hilo { display: flex; }
          .chat-btn-atras { display: block; }
          .chat-sidebar-header { padding-top: 10px; }
          .chat-composer { padding-bottom: max(10px, env(safe-area-inset-bottom, 0px)); }
          .chat-bubble-mia, .chat-bubble-otra { max-width: 82%; font-size: 14px; }
          .chat-tab { padding: 6px 10px; font-size: 12px; }
        }

        @media (max-width: 380px) {
          .chat-brand { font-size: 14px; }
          .chat-btn-round { width: 36px; height: 36px; font-size: 16px; }
          .chat-input-wrap select { display: none; }
        }
      </style>
    `;
  }

  wireEventos() {
    document.getElementById('chat-btn-cerrar')?.addEventListener('click', () => this.cerrarPanel());
    document.getElementById('chat-btn-atras')?.addEventListener('click', () => this.volverListaMovil());
    document.getElementById('chat-tab-conversaciones')?.addEventListener('click', () => this.cambiarVista('conversaciones'));
    document.getElementById('chat-tab-usuarios')?.addEventListener('click', () => this.cambiarVista('usuarios'));
    document.getElementById('chat-tab-anuncios')?.addEventListener('click', () => this.cambiarVista('anuncios'));

    document.getElementById('chat-buscador')?.addEventListener('input', (e) => {
      this.busqueda = e.target.value;
      this.renderSidebar();
    });

    document.getElementById('chat-btn-enviar')?.addEventListener('click', () => this.enviarMensaje());
    document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.enviarMensaje(); }
      else this.emitTypingThrottled();
    });

    // Audio: adjuntar archivo
    document.getElementById('chat-btn-adjuntar')?.addEventListener('click', () => {
      document.getElementById('chat-audio-file').click();
    });
    document.getElementById('chat-audio-file')?.addEventListener('change', (e) => {
      if (e.target.files?.[0]) this.subirAudioFile(e.target.files[0]);
      e.target.value = '';
    });

    // Audio: grabar con MediaRecorder (hold to record)
    document.getElementById('chat-btn-mic')?.addEventListener('click', () => this.iniciarGrabacionVoz());
    document.getElementById('chat-btn-detener-voz')?.addEventListener('click', () => this.detenerGrabacionVoz(true));
    document.getElementById('chat-btn-cancelar-voz')?.addEventListener('click', () => this.detenerGrabacionVoz(false));

    // Anuncios
    document.getElementById('anuncio-enviar')?.addEventListener('click', () => this.enviarAnuncio());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.panelAbierto) {
        if (this.esMovil() && this.vistaHiloMovil) this.volverListaMovil();
        else this.cerrarPanel();
      }
    });
  }

  esMovil() {
    return window.matchMedia('(max-width: 700px)').matches;
  }

  _bindResize() {
    window.addEventListener('resize', () => {
      if (!this.esMovil()) {
        const p = document.getElementById('chat-panel-gambusinas');
        if (p) p.classList.remove('chat-mobile-hilo');
        this.vistaHiloMovil = false;
      }
    });
  }

  mostrarHiloMovil() {
    const p = document.getElementById('chat-panel-gambusinas');
    if (!p || !this.esMovil()) return;
    p.classList.add('chat-mobile-hilo');
    this.vistaHiloMovil = true;
  }

  volverListaMovil() {
    const p = document.getElementById('chat-panel-gambusinas');
    if (p) p.classList.remove('chat-mobile-hilo');
    this.vistaHiloMovil = false;
  }

  cambiarVista(v) {
    this.vista = v;
    // Toggle botones
    const tabs = ['conversaciones', 'usuarios', 'anuncios'];
    tabs.forEach(t => {
      const btn = document.getElementById(`chat-tab-${t}`);
      if (!btn) return;
      btn.classList.toggle('active', t === v);
    });
    // Mostrar composer de anuncios solo en vista anuncios
    const anuncio = document.getElementById('chat-anuncio-composer');
    const composer = document.getElementById('chat-composer');
    if (anuncio) anuncio.style.display = v === 'anuncios' ? 'flex' : 'none';
    if (composer) composer.style.display = v === 'anuncios' ? 'none' : 'flex';
    this.renderSidebar();
  }

  abrirPanel() {
    const p = document.getElementById('chat-panel-gambusinas');
    if (!p) return;
    p.classList.add('chat-open');
    p.style.display = 'block';
    p.setAttribute('aria-hidden', 'false');
    this.panelAbierto = true;
    this.volverListaMovil();
    this.cambiarVista('conversaciones');
    this.renderSidebar();
  }

  cerrarPanel() {
    const p = document.getElementById('chat-panel-gambusinas');
    if (!p) return;
    p.classList.remove('chat-open', 'chat-mobile-hilo');
    p.style.display = 'none';
    p.setAttribute('aria-hidden', 'true');
    this.panelAbierto = false;
    this.vistaHiloMovil = false;
  }

  // ==================== Datos ====================

  async cargarConversaciones() {
    try {
      const resp = await apiGet(`${this.config.apiBase}/conversaciones`);
      if (resp?.success) this.conversaciones = resp.data || [];
    } catch (_) {}
  }

  async cargarUsuarios() {
    try {
      // GET /api/mozos devuelve todo el personal con rol
      const resp = await apiGet('/mozos?limit=200');
      // Puede venir como array directo o {data:[]}
      this.usuarios = Array.isArray(resp) ? resp : (resp?.data || resp?.mozos || []);
    } catch (_) {}
  }

  async cargarMensajes(convId) {
    const cont = document.getElementById('chat-mensajes');
    if (!cont) return;
    cont.innerHTML = '<div style="text-align:center;color:#5a5a7a;padding:20px;">Cargando...</div>';
    try {
      const resp = await apiGet(`${this.config.apiBase}/conversaciones/${convId}/mensajes?limit=50`);
      this.mensajes = resp?.data || [];
      this.renderMensajes();
    } catch (_) {
      cont.innerHTML = '<div style="text-align:center;color:#ff4757;padding:20px;">Error</div>';
    }
  }

  async actualizarBadge() {
    try {
      const resp = await apiGet(`${this.config.apiBase}/no-leidos/count`);
      const count = resp?.data?.count || 0;
      this.noLeidos = count;
      const badge = document.getElementById('chat-fab-badge');
      if (!badge) return;
      badge.style.display = count > 0 ? 'flex' : 'none';
      badge.textContent = count > 99 ? '99+' : String(count);
    } catch (_) {}
  }

  // ==================== Sidebar ====================

  renderSidebar() {
    const cont = document.getElementById('chat-sidebar-lista');
    if (!cont) return;
    const q = (this.busqueda || '').toLowerCase();

    if (this.vista === 'conversaciones') {
      const filtradas = this.conversaciones.filter(c => {
        if (!q) return true;
        return (c.titulo || '').toLowerCase().includes(q) || (c.ultimoMensajePreview || '').toLowerCase().includes(q);
      });
      if (!filtradas.length) {
        cont.innerHTML = '<div style="padding:24px;text-align:center;color:#5a5a7a;font-size:13px;">Sin conversaciones</div>';
        return;
      }
      cont.innerHTML = filtradas.map(c => this.renderConvRow(c)).join('');
      cont.querySelectorAll('.chat-conv-row').forEach(el => {
        el.addEventListener('click', () => this.abrirConversacion(el.dataset.id));
      });
    } else if (this.vista === 'usuarios') {
      const filtrados = this.usuarios.filter(u => {
        if (!q) return true;
        return (u.name || '').toLowerCase().includes(q) || (u.rol || '').toLowerCase().includes(q);
      });
      if (!filtrados.length) {
        cont.innerHTML = '<div style="padding:24px;text-align:center;color:#5a5a7a;font-size:13px;">Sin personas</div>';
        return;
      }
      cont.innerHTML = filtrados.map(u => this.renderUserRow(u)).join('');
      cont.querySelectorAll('.chat-user-row').forEach(el => {
        el.addEventListener('click', () => this.iniciarDMConUsuario(el.dataset.id, el.dataset.name));
      });
    } else if (this.vista === 'anuncios') {
      const anuncios = this.conversaciones.filter(c => c.tipo === 'anuncio');
      cont.innerHTML = `<div style="padding:10px 6px; font-size:11px; color:#a0a0b8; font-weight:600;">Anuncios enviados (${anuncios.length})</div>`;
      cont.innerHTML += anuncios.map(c => this.renderConvRow(c)).join('') ||
        '<div style="padding:20px;text-align:center;color:#5a5a7a;font-size:13px;">Sin anuncios. Usa el composer para crear uno.</div>';
      cont.querySelectorAll('.chat-conv-row').forEach(el => {
        el.addEventListener('click', () => this.abrirConversacion(el.dataset.id));
      });
    }
  }

  renderConvRow(c) {
    const prioColor = c.prioridadMinima >= 9 ? '#e74c3c' : (c.prioridadMinima >= 7 ? '#f39c12' : null);
    const badge = c.noLeidos > 0
      ? `<span style="background:${prioColor || '#ff4757'};color:white;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:bold;">${c.noLeidos}</span>`
      : '';
    const inicial = (c.titulo || '?').replace('#', '').charAt(0).toUpperCase();
    const icono = c.tipo === 'anuncio' ? '📢' : (c.tipo === 'canal' ? '#' : '●');
    const pinIcon = c.pineado ? '📌' : '';
    const muteIcon = c.silenciado ? '🔕' : '';
    const active = this.convActiva?._id === c._id ? ' active' : '';
    return `
      <div class="chat-conv-row${active}" data-id="${c._id}">
        ${c.pineado ? '<div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:#d4af37;border-radius:2px;"></div>' : ''}
        <div class="chat-avatar" style="background:${prioColor || '#d4af37'};color:#0a0a0f;">${inicial}</div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#fff;">${icono} ${c.titulo || 'DM'} ${pinIcon}${muteIcon}</span>
            ${badge}
          </div>
          <div style="font-size:11px; color:#a0a0b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.ultimoMensajePreview || ''}</div>
        </div>
      </div>
    `;
  }

  renderUserRow(u) {
    const inicial = (u.name || '?').charAt(0).toUpperCase();
    const rolColor = { admin: '#e74c3c', supervisor: '#f39c12', cocinero: '#e67e22', mozos: '#3498db', capitanMozos: '#9b59b6', cajero: '#1abc9c' }[u.rol] || '#7f8c8d';
    const activo = u.activo === false ? '(inactivo)' : '';
    return `
      <div class="chat-user-row" data-id="${u._id}" data-name="${(u.name || '').replace(/"/g, '&quot;')}">
        <div class="chat-avatar" style="background:${rolColor};color:white;">${inicial}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:13px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.name || '?'} <span style="font-size:10px;color:#5a5a7a;">${activo}</span></div>
          <div style="font-size:11px;color:#a0a0b8;">${u.rol || ''}</div>
        </div>
        <div style="color:#d4af37; font-size:18px;">💬</div>
      </div>
    `;
  }

  async iniciarDMConUsuario(usuarioId, nombre) {
    try {
      const resp = await apiPost(`${this.config.apiBase}/conversaciones`, { tipo: 'directo', destinatarioId: usuarioId });
      if (resp?.success) {
        await this.cargarConversaciones();
        this.abrirConversacion(resp.data._id);
      }
    } catch (e) {
      alert('No se pudo iniciar conversación con ' + nombre);
    }
  }

  // ==================== Hilo ====================

  async abrirConversacion(id) {
    this.convActiva = this.conversaciones.find(c => c._id === id) || { _id: id };
    document.getElementById('chat-hilo-titulo').textContent =
      `${this.convActiva.tipo === 'anuncio' ? '📢 ' : (this.convActiva.tipo === 'canal' ? '# ' : '')}${this.convActiva.titulo || 'Conversación'}`;
    this.renderSidebar(); // para marcar active
    this.mostrarHiloMovil();
    await this.cargarMensajes(id);
    await this.marcarLeido(id);
    if (this.socket?.connected) this.socket.emit('join-conversacion', id);
  }

  renderMensajes() {
    const cont = document.getElementById('chat-mensajes');
    if (!cont) return;
    if (!this.mensajes.length) {
      cont.innerHTML = '<div style="text-align:center;color:#5a5a7a;padding:40px;font-size:14px;">Sin mensajes. ¡Escribe o envía una nota de voz!</div>';
      return;
    }
    const miId = this.getMiId();
    cont.innerHTML = this.mensajes.map(m => {
      const esMio = (m.remitenteId?._id || m.remitenteId?.toString?.()) === miId;
      const nombre = m.remitenteId?.name || '';
      const prioColor = m.prioridad >= 9 ? '#e74c3c' : (m.prioridad >= 7 ? '#f39c12' : 'transparent');
      const prioChip = m.prioridad > 5 ? `<span style="font-size:9px;color:${prioColor};border:1px solid ${prioColor};border-radius:4px;padding:0 4px;margin-left:4px;">${m.prioridadCodigo}</span>` : '';
      const estadoIcon = esMio ? (m.estado === 'leido' ? '✓✓' : (m.estado === 'entregado' ? '✓✓' : '✓')) : '';
      const estadoColor = esMio ? (m.estado === 'leido' ? '#4fc3f7' : '#666') : 'transparent';
      const replyQuote = m.respuestaA ? `<div style="font-size:10px;color:#a0a0b8;border-left:2px solid #d4af37;padding-left:6px;margin-bottom:4px;">↩ ${m.respuestaA?.texto?.slice(0, 60) || 'Mensaje'}</div>` : '';

      let bubble;
      if (m.tipoContenido === 'voz') {
        bubble = `<div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">🎤</span>
          <audio controls src="${m.audio?.url || ''}" style="height:32px;max-width:220px;"></audio>
          <span style="font-size:11px;opacity:0.7;">${m.audio?.duracionMs ? Math.round(m.audio.duracionMs/1000) + 's' : ''}</span>
        </div>`;
      } else if (m.tipoContenido === 'sistema') {
        bubble = `<div style="font-style:italic;opacity:0.7;">⚙️ ${m.texto}</div>`;
      } else {
        bubble = `<div>${(m.texto || '').replace(/</g, '&lt;')}</div>`;
      }

      return `
        <div style="display:flex; flex-direction:column; align-items:${esMio ? 'flex-end' : 'flex-start'}; margin:2px 0; width:100%;">
          <div style="font-size:10px; color:#5a5a7a; margin-bottom:2px; ${esMio ? 'align-self:flex-end;' : ''}">
            ${esMio ? 'Yo' : nombre}${prioChip}
          </div>
          <div class="${esMio ? 'chat-bubble-mia' : 'chat-bubble-otra'}">
            ${replyQuote}${bubble}
          </div>
          <div style="font-size:9px; color:${estadoColor}; margin-top:2px;">${estadoIcon} ${this.formatHora(m.createdAt)}</div>
        </div>
      `;
    }).join('');
    cont.scrollTop = cont.scrollHeight;
  }

  formatHora(d) {
    try { return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
  }

  async marcarLeido(convId) {
    try {
      await apiPatch(`${this.config.apiBase}/conversaciones/${convId}/leido`, {});
      await this.actualizarBadge();
    } catch (_) {}
  }

  async enviarMensaje() {
    const input = document.getElementById('chat-input');
    const prio = document.getElementById('chat-prioridad').value;
    const texto = (input?.value || '').trim();
    if (!texto || !this.convActiva) return;
    input.value = '';
    try {
      await apiPost(`${this.config.apiBase}/conversaciones/${this.convActiva._id}/mensajes`, {
        texto, prioridadCodigo: prio, respuestaA: this.replyTo || null
      });
      this.replyTo = null;
      await this.cargarMensajes(this.convActiva._id);
    } catch (e) {
      input.value = texto;
    }
  }

  async enviarAnuncio() {
    const texto = (document.getElementById('anuncio-texto')?.value || '').trim();
    const prioridadCodigo = document.getElementById('anuncio-prioridad')?.value || 'alta';
    const rolesSelect = document.getElementById('anuncio-roles');
    const rolesDestinatarios = Array.from(rolesSelect.selectedOptions).map(o => o.value);
    if (!texto) return;
    try {
      await apiPost(`${this.config.apiBase}/anuncios`, { texto, prioridadCodigo, rolesDestinatarios });
      document.getElementById('anuncio-texto').value = '';
      await this.cargarConversaciones();
      this.cambiarVista('conversaciones');
    } catch (e) {
      alert('Error enviando anuncio');
    }
  }

  // ==================== Voz (Messenger-like) ====================

  subirAudioFile(file) {
    if (!this.convActiva) { alert('Selecciona una conversación'); return; }
    const fd = new FormData();
    fd.append('audio', file);
    fd.append('prioridadCodigo', document.getElementById('chat-prioridad').value);
    const token = getToken();
    // fetch directo: necesita el prefijo /api (a diferencia de apiGet/apiPost)
    fetch(`/api${this.config.apiBase}/conversaciones/${this.convActiva._id}/mensajes/voz`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd
    }).then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(() => this.cargarMensajes(this.convActiva._id))
      .catch(() => alert('No se pudo enviar el audio'));
  }

  async iniciarGrabacionVoz() {
    if (!this.convActiva) { alert('Selecciona una conversación'); return; }
    if (this.grabandoVoz) return;
    try {
      const host = window.location.hostname;
      const local = host === 'localhost' || host === '127.0.0.1';
      if (!window.isSecureContext && !local) {
        alert('El micrófono requiere HTTPS o localhost.\nUsa el botón 📎 para adjuntar un audio.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        alert('Este navegador no permite grabar.\nUsa el botón 📎 para adjuntar un audio.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      this.recordingStream = stream;
      this.audioChunks = [];
      const tipos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      let mime = '';
      for (const t of tipos) {
        try { if (window.MediaRecorder?.isTypeSupported?.(t)) { mime = t; break; } } catch (_) {}
      }
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      this._vozMime = mr.mimeType || mime || 'audio/webm';
      mr.ondataavailable = (e) => { if (e.data.size > 0) this.audioChunks.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(this.audioChunks, { type: this._vozMime });
        stream.getTracks().forEach(t => t.stop());
        this.recordingStream = null;
        if (!this._enviarVoz || this.audioChunks.length === 0) return;
        const baseMime = (this._vozMime || 'audio/webm').split(';')[0];
        const ext = baseMime.includes('mp4') ? 'm4a' : (baseMime.includes('ogg') ? 'ogg' : 'webm');
        const fd = new FormData();
        fd.append('audio', new File([blob], `voz-${Date.now()}.${ext}`, { type: baseMime }));
        fd.append('prioridadCodigo', document.getElementById('chat-prioridad').value);
        const token = getToken();
        fetch(`/api${this.config.apiBase}/conversaciones/${this.convActiva._id}/mensajes/voz`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd
        }).then(r => { if (!r.ok) throw new Error(); return r.json(); })
          .then(() => this.cargarMensajes(this.convActiva._id))
          .catch(() => alert('Error subiendo voz'));
      };
      this.mediaRecorder = mr;
      mr.start(250);
      this.grabandoVoz = true;
      this._enviarVoz = true;
      this._mostrarRecordingBar();
      this._startTimer();
    } catch (e) {
      const msg = e?.name === 'NotAllowedError'
        ? 'Permiso de micrófono denegado. Actívalo o usa 📎.'
        : 'No se pudo acceder al micrófono. Usa 📎 para adjuntar audio.';
      alert(msg);
    }
  }

  detenerGrabacionVoz(enviar) {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;
    this._enviarVoz = enviar;
    try { this.mediaRecorder.stop(); } catch (_) {}
    this.grabandoVoz = false;
    this._ocultarRecordingBar();
    this._stopTimer();
  }

  _mostrarRecordingBar() {
    document.getElementById('chat-composer').style.display = 'none';
    document.getElementById('chat-recording-bar').style.display = 'flex';
  }

  _ocultarRecordingBar() {
    document.getElementById('chat-recording-bar').style.display = 'none';
    document.getElementById('chat-composer').style.display = 'flex';
  }

  _startTimer() {
    this._recStart = Date.now();
    this._recInterval = setInterval(() => {
      const s = Math.floor((Date.now() - this._recStart) / 1000);
      const el = document.getElementById('chat-recording-time');
      if (el) el.textContent = `Grabando... ${s}s`;
      if (s >= 60) this.detenerGrabacionVoz(true);
    }, 500);
  }

  _stopTimer() { clearInterval(this._recInterval); }

  // ==================== Socket ====================

  conectarSocket() {
    if (typeof io === 'undefined') return;
    const token = getToken();
    if (!token) return;
    try {
      this.socket = io('/admin', { auth: { token }, transports: ['websocket', 'polling'] });
      this.socket.on('connect', () => {
        console.log('💬 Socket chat conectado');
        const miId = this.getMiId();
        // join-conversacion + room personal (backend también auto-une user-{id})
        if (this.convActiva?._id) this.socket.emit('join-conversacion', this.convActiva._id);
      });

      this.socket.on('mensaje:nuevo', (data) => {
        if (this.convActiva && data.conversacionId?.toString?.() === String(this.convActiva._id)) {
          this.cargarMensajes(this.convActiva._id);
          this.marcarLeido(this.convActiva._id);
        }
        this.cargarConversaciones();
        this.actualizarBadge();
        if (this.panelAbierto) this.renderSidebar();
      });

      this.socket.on('nueva-notificacion', (n) => {
        if (n?.tipo === 'mensaje') this.actualizarBadge();
      });

      this.socket.on('mensaje:typing', (d) => {
        if (!d?.remitenteId || d.remitenteId === this.getMiId()) return;
        if (!this.convActiva || d.conversacionId?.toString?.() !== String(this.convActiva._id)) return;
        this.mostrarTyping(d.remitenteNombre || d.remitenteId);
      });

      this.socket.on('mensaje:entregado', () => { if (this.convActiva) this.cargarMensajes(this.convActiva._id); });
      this.socket.on('mensaje:leido', () => { if (this.convActiva) this.cargarMensajes(this.convActiva._id); });
    } catch (_) {}
  }

  mostrarTyping(nombre) {
    const bar = document.getElementById('chat-typing-bar');
    if (!bar) return;
    bar.textContent = `${nombre} está escribiendo…`;
    clearTimeout(this.typingTimers[nombre]);
    this.typingTimers[nombre] = setTimeout(() => { bar.textContent = ''; }, 3000);
  }

  emitTypingThrottled = (() => {
    let last = 0;
    return () => {
      const now = Date.now();
      if (now - last < 2000) return;
      last = now;
      if (!this.convActiva) return;
      apiPost(`${this.config.apiBase}/conversaciones/${this.convActiva._id}/typing`, {}).catch(() => {});
    };
  })();

  iniciarPolling() {
    this.pollingInterval = setInterval(() => {
      this.cargarConversaciones();
      this.actualizarBadge();
      if (this.convActiva) this.cargarMensajes(this.convActiva._id);
    }, this.config.pollingTime);
  }

  getMiId() {
    try {
      const t = getToken();
      const p = JSON.parse(atob(t.split('.')[1]));
      return p.id || p._id || p.userId;
    } catch { return ''; }
  }
}

let chatDashboard;
document.addEventListener('DOMContentLoaded', () => {
  chatDashboard = new ChatDashboard();
  setTimeout(() => chatDashboard.init(), 600);
});