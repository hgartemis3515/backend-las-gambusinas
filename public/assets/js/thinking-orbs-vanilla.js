/**
 * thinking-orbs-vanilla.js
 * Reimplementación ligera (vanilla 2D canvas) del patrón "Thinking Orbs",
 * sin dependencia de React. Expone un web component <thinking-orbs> y un
 * helper imperativo createThinkingOrb(container, { state, size, theme }).
 *
 * Estados soportados: working, searching, solving, listening, composing,
 * connecting, weaving, breathing, shaping (alias de los originales).
 * Renderiza puntos (dots) en órbitas inclinadas / anillos / scan meridian,
 * auto-pausando cuando está offscreen o la pestaña está oculta.
 */

(function (global) {
  'use strict';

  const DPR_CAP = 2;
  const TAU = Math.PI * 2;

  // Tamaños tuneados (preseados)
  const SIZES = {
    64: { dotCount: 150, dotR: 0.8, speed: 1, rsPow: 0.6 },
    20: { dotCount: 80, dotR: 0.6, speed: 1.4, rsPow: 0.5 }
  };

  // Config por estado: modo de dibujo + parámetros base
  const STATE_CONFIG = {
    working:    { mode: 'orbits',  speed: 1.0 },
    searching:  { mode: 'globe',   speed: 1.0 },
    solving:    { mode: 'rings',   speed: 1.0 },
    listening:  { mode: 'wave',    speed: 1.0 },
    composing:  { mode: 'bands',   speed: 0.8 },
    connecting: { mode: 'web',     speed: 1.0 },
    weaving:    { mode: 'braid',   speed: 1.0 },
    breathing:  { mode: 'ring',    speed: 0.5 },
    shaping:    { mode: 'morph',   speed: 0.7 }
  };

  function resolveTheme(theme) {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    // auto: detectar del documento
    if (document.documentElement.getAttribute('data-theme') === 'dark') return true;
    if (document.documentElement.classList.contains('dark')) return true;
    return global.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }

  // Fibonacci sphere
  function fibPoint(i, n) {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const y = 1 - 2 * (i + 0.5) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * goldenAngle;
    return [Math.cos(theta) * r, y, Math.sin(theta) * r];
  }

  // Rotador con dos ángulos (tilt)
  function rotator(az, el) {
    const sa = Math.sin(az), ca = Math.cos(az), sr = Math.sin(el), cr = Math.cos(el);
    return (x, y, z) => [
      x * ca + z * sa,
      y * cr - (-x * sa + z * ca) * sr,
      (y * sr + (-x * sa + z * ca) * cr)
    ];
  }

  function project(p, cx, cy, scale) {
    return [cx + p[0] * scale, cy - p[1] * scale, p[2]];
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ============ Modos de dibujo ============

  function drawOrbits(ctx, size, t, dark, cfg) {
    const cx = size / 2, cy = size / 2;
    const scale = size / 2 * 0.82;
    const n = cfg.dotCount;
    const rot = rotator(t * 0.4, 0.3 + Math.sin(t * 0.2) * 0.15);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const [x, y, z] = fibPoint(i, n);
      const r2 = rot(x * scale, y * scale, z * scale);
      const depth = (r2[2] / scale + 1) / 2;
      const p = project(r2, cx, cy, 1);
      pts.push({ x: p[0], y: p[1], z: p[2], r: cfg.dotR * (size / 300) ** cfg.rsPow, white: 0.78, a: 0.1 + 0.3 * depth });
    }
    paintDots(ctx, pts, dark, cfg.dotR * (size / 300) ** cfg.rsPow);
  }

  function drawGlobe(ctx, size, t, dark, cfg) {
    const cx = size / 2, cy = size / 2;
    const scale = size / 2 * 0.8;
    const n = cfg.dotCount;
    const rot = rotator(t * 0.25, 0.25);
    // Meridian scan
    const meridian = Math.sin(t * cfg.speed * 0.6);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const [x, y, z] = fibPoint(i, n);
      const r2 = rot(x * scale, y * scale, z * scale);
      const p = project(r2, cx, cy, 1);
      const depth = (r2[2] / scale + 1) / 2;
      // Highlight near meridian
      const local = Math.abs(Math.atan2(r2[0], r2[2]) - meridian);
      const prox = Math.max(0, 1 - local / 0.5);
      const a = 0.08 + 0.18 * depth + 0.45 * prox * depth;
      pts.push({ x: p[0], y: p[1], z: p[2], r: cfg.dotR * (size / 300) ** cfg.rsPow, white: 0.78, a: Math.min(0.7, a) });
    }
    paintDots(ctx, pts, dark, cfg.dotR * (size / 300) ** cfg.rsPow);
  }

  function drawRings(ctx, size, t, dark, cfg) {
    const cx = size / 2, cy = size / 2;
    const scale = size / 2 * 0.75;
    const rot = rotator(t * 0.3, 0.4);
    const rings = 3;
    const n = cfg.dotCount;
    const pts = [];
    for (let r = 0; r < rings; r++) {
      const bandT = (t * cfg.speed * 0.5 + r * 0.33) % 1;
      const phase = Math.sin(bandT * TAU);
      for (let i = 0; i < n / rings; i++) {
        const a = (i / (n / rings)) * TAU + r * 0.5;
        const [x, y, z] = [Math.cos(a) * scale, (r - 1) * scale * 0.45, Math.sin(a) * scale];
        const r2 = rot(x, y, z);
        const p = project(r2, cx, cy, 1);
        const depth = (r2[2] / scale + 1) / 2;
        const swirl = 0.15 + 0.35 * depth + 0.3 * Math.abs(phase);
        pts.push({ x: p[0], y: p[1], z: p[2], r: cfg.dotR * (size / 300) ** cfg.rsPow, white: 0.8, a: swirl });
      }
    }
    paintDots(ctx, pts, dark, cfg.dotR * (size / 300) ** cfg.rsPow);
  }

  function drawWave(ctx, size, t, dark, cfg) {
    const cx = size / 2, cy = size / 2;
    const scale = size / 2 * 0.75;
    const n = cfg.dotCount;
    const rot = rotator(t * 0.2, 0.3);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const [x, y, z] = fibPoint(i, n);
      const wave = Math.sin(y * 6 + t * cfg.speed * 1.5) * 0.15;
      const r2 = rot(x * scale, (y + wave) * scale, z * scale);
      const p = project(r2, cx, cy, 1);
      const depth = (r2[2] / scale + 1) / 2;
      pts.push({ x: p[0], y: p[1], z: p[2], r: cfg.dotR * (size / 300) ** cfg.rsPow, white: 0.78, a: 0.1 + 0.3 * depth });
    }
    paintDots(ctx, pts, dark, cfg.dotR * (size / 300) ** cfg.rsPow);
  }

  function drawBands(ctx, size, t, dark, cfg) {
    const cx = size / 2, cy = size / 2;
    const scale = size / 2 * 0.78;
    const n = cfg.dotCount;
    const rot = rotator(t * 0.2, 0.2);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const [x, y, z] = fibPoint(i, n);
      const undulate = Math.sin(x * 5 + t * cfg.speed) * 0.1;
      const r2 = rot(x * scale, (y + undulate) * scale, z * scale);
      const p = project(r2, cx, cy, 1);
      const depth = (r2[2] / scale + 1) / 2;
      pts.push({ x: p[0], y: p[1], z: p[2], r: cfg.dotR * (size / 300) ** cfg.rsPow, white: 0.78, a: 0.08 + 0.28 * depth });
    }
    paintDots(ctx, pts, dark, cfg.dotR * (size / 300) ** cfg.rsPow);
  }

  function drawWeb(ctx, size, t, dark, cfg) {
    const cx = size / 2, cy = size / 2;
    const scale = size / 2 * 0.78;
    const n = Math.min(40, cfg.dotCount);
    const rot = rotator(t * 0.3, 0.35);
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const [x, y, z] = fibPoint(i, n);
      const r2 = rot(x * scale, y * scale, z * scale);
      const p = project(r2, cx, cy, 1);
      const depth = (r2[2] / scale + 1) / 2;
      nodes.push({ x: p[0], y: p[1], z: p[2], a: 0.2 + 0.5 * depth });
    }
    // Edges (conecta vecinos cercanos)
    const lines = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < size * 0.18) {
          const a = (1 - d / (size * 0.18)) * 0.25 * Math.min(nodes[i].a, nodes[j].a);
          lines.push({ x1: nodes[i].x, y1: nodes[i].y, x2: nodes[j].x, y2: nodes[j].y, w: 0.5, a });
        }
      }
    }
    paintLines(ctx, lines, dark);
    paintDots(ctx, nodes.map(n => ({ ...n, r: cfg.dotR * 1.2 * (size / 300) ** cfg.rsPow, white: 0.85 })), dark, cfg.dotR * 1.2 * (size / 300) ** cfg.rsPow);
  }

  function drawBraid(ctx, size, t, dark, cfg) {
    const cx = size / 2, cy = size / 2;
    const scale = size / 2 * 0.72;
    const n = cfg.dotCount;
    const rot = rotator(t * 0.25, 0.3);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const strand = i % 3;
      const a = (i / n) * TAU * 3 + t * cfg.speed * 0.5;
      const [x, y, z] = fibPoint(i, n);
      const twist = Math.sin(a + strand * TAU / 3) * 0.12;
      const r2 = rot((x + twist) * scale, y * scale, z * scale);
      const p = project(r2, cx, cy, 1);
      const depth = (r2[2] / scale + 1) / 2;
      pts.push({ x: p[0], y: p[1], z: p[2], r: cfg.dotR * (size / 300) ** cfg.rsPow, white: 0.78, a: 0.1 + 0.3 * depth });
    }
    paintDots(ctx, pts, dark, cfg.dotR * (size / 300) ** cfg.rsPow);
  }

  function drawRing(ctx, size, t, dark, cfg) {
    const cx = size / 2, cy = size / 2;
    const scale = size / 2 * 0.7;
    const n = cfg.dotCount;
    const rot = rotator(t * 0.15, 0.5 + Math.sin(t * 0.1) * 0.2);
    const pts = [];
    const morph = 0.85 + 0.15 * Math.sin(t * cfg.speed * 0.5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const [x, y] = [Math.cos(a) * scale * morph, Math.sin(a) * scale * morph];
      const r2 = rot(x, y, 0);
      const p = project(r2, cx, cy, 1);
      pts.push({ x: p[0], y: p[1], z: p[2], r: cfg.dotR * (size / 300) ** cfg.rsPow, white: 0.8, a: 0.2 + 0.4 * (r2[2] / scale + 1) / 2 });
    }
    paintDots(ctx, pts, dark, cfg.dotR * (size / 300) ** cfg.rsPow);
  }

  function drawMorph(ctx, size, t, dark, cfg) {
    const cx = size / 2, cy = size / 2;
    const scale = size / 2 * 0.72;
    const n = cfg.dotCount;
    const rot = rotator(t * 0.2, 0.3);
    const phase = (t * cfg.speed * 0.3) % 3;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      let x, y, z;
      if (phase < 1) {
        const tt = phase;
        x = Math.cos(a) * scale;
        y = Math.sin(a) * scale;
        z = 0;
        x = lerp(x, Math.cos(a) * scale * (1 - 0.5 * Math.abs(Math.sin(a * 3))), tt);
        y = lerp(y, Math.sin(a) * scale * 0.5, tt);
      } else if (phase < 2) {
        const tt = phase - 1;
        x = Math.cos(a) * scale * (1 - 0.5 * Math.abs(Math.sin(a * 3)));
        y = Math.sin(a) * scale * 0.5;
        z = 0;
        x = lerp(x, Math.cos(a) * scale * Math.sign(Math.cos(a * 4)) * 0.8, tt);
        y = lerp(y, Math.sin(a) * scale * 0.5, tt);
      } else {
        const tt = phase - 2;
        x = Math.cos(a) * scale * Math.sign(Math.cos(a * 4)) * 0.8;
        y = Math.sin(a) * scale * 0.5;
        z = 0;
        x = lerp(x, Math.cos(a) * scale, tt);
        y = lerp(y, Math.sin(a) * scale, tt);
      }
      const r2 = rot(x, y, z);
      const p = project(r2, cx, cy, 1);
      pts.push({ x: p[0], y: p[1], z: p[2], r: cfg.dotR * (size / 300) ** cfg.rsPow, white: 0.78, a: 0.15 + 0.3 * (r2[2] / scale + 1) / 2 });
    }
    paintDots(ctx, pts, dark, cfg.dotR * (size / 300) ** cfg.rsPow);
  }

  const DRAWERS = {
    orbits: drawOrbits, globe: drawGlobe, rings: drawRings, wave: drawWave,
    bands: drawBands, web: drawWeb, braid: drawBraid, ring: drawRing, morph: drawMorph
  };

  function paintDots(ctx, pts, dark, baseR) {
    pts.sort((a, b) => b.z - a.z);
    for (const p of pts) {
      if (p.a < 0.02) continue;
      const w = Math.min(1, Math.max(0, p.white ?? 0.78));
      const v = Math.round((dark ? 1 - w : w) * 255);
      ctx.fillStyle = `rgba(${v},${v},${v},${p.a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.3, p.r ?? baseR), 0, TAU);
      ctx.fill();
    }
  }

  function paintLines(ctx, lines, dark) {
    for (const l of lines) {
      if (l.a < 0.02) continue;
      ctx.strokeStyle = `rgba(${dark ? 200 : 60},${dark ? 200 : 60},${dark ? 200 : 60},${l.a})`;
      ctx.lineWidth = l.w;
      ctx.beginPath();
      ctx.moveTo(l.x1, l.y1);
      ctx.lineTo(l.x2, l.y2);
      ctx.stroke();
    }
  }

  // ============ Clase ThinkingOrbCanvas ============

  class ThinkingOrbCanvas {
    constructor(container, opts = {}) {
      this.container = container;
      this.state = opts.state || 'working';
      this.size = opts.size && SIZES[opts.size] ? opts.size : 64;
      this.theme = opts.theme || 'auto';
      this.speed = opts.speed || 1;
      this.paused = !!opts.paused;
      this._raf = null;
      this._running = false;
      this._startTime = performance.now();
      this._reducedMotion = global.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      this._visible = true;
      this._build();
      this._io = new IntersectionObserver(([entry]) => {
        this._visible = entry.isIntersecting;
        if (this._visible && !this.paused) this._start();
        else this._stop();
      }, { threshold: 0 });
      this._io.observe(this.canvas);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this._stop();
        else if (this._visible && !this.paused) this._start();
      });
      if (!this.paused) this._start();
    }

    _build() {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Pensando: ${this.state}`);
      canvas.style.width = this.size + 'px';
      canvas.style.height = this.size + 'px';
      canvas.style.display = 'block';
      this.canvas = canvas;
      this.container.appendChild(canvas);
      this._resize();
    }

    _resize() {
      const dpr = Math.min(DPR_CAP, global.devicePixelRatio || 1);
      this.canvas.width = this.size * dpr;
      this.canvas.height = this.size * dpr;
      const ctx = this.canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._ctx = ctx;
    }

    _start() {
      if (this._running || this._reducedMotion) {
        if (this._reducedMotion) this._render(0);
        return;
      }
      this._running = true;
      const tick = (now) => {
        if (!this._running) return;
        const t = (now - this._startTime) / 1000;
        this._render(t);
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }

    _stop() {
      this._running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = null;
    }

    _render(t) {
      const ctx = this._ctx;
      if (!ctx) return;
      ctx.clearRect(0, 0, this.size, this.size);
      const cfg = SIZES[this.size];
      const config = STATE_CONFIG[this.state] || STATE_CONFIG.working;
      const drawer = DRAWERS[config.mode] || drawOrbits;
      const dark = resolveTheme(this.theme);
      drawer(ctx, this.size, t * cfg.speed * this.speed * config.speed, dark, cfg);
    }

    setState(state) {
      this.state = state;
      this.canvas.setAttribute('aria-label', `Pensando: ${state}`);
    }

    setPaused(paused) {
      this.paused = !!paused;
      if (this.paused) this._stop();
      else if (this._visible) this._start();
    }

    destroy() {
      this._stop();
      this._io?.disconnect();
      this.canvas?.remove();
    }
  }

  // ============ API imperativa ============
  function createThinkingOrb(container, opts = {}) {
    return new ThinkingOrbCanvas(container, opts);
  }

  // ============ Web component opcional <thinking-orbs> ============
  if (global.customElements && !global.customElements.get('thinking-orbs')) {
    class ThinkingOrbsElement extends HTMLElement {
      connectedCallback() {
        this._orb = new ThinkingOrbCanvas(this, {
          state: this.getAttribute('state') || 'working',
          size: Number(this.getAttribute('size')) || 64,
          theme: this.getAttribute('theme') || 'auto',
          speed: Number(this.getAttribute('speed')) || 1
        });
      }
      static get observedAttributes() { return ['state', 'paused', 'theme', 'speed']; }
      attributeChangedCallback(name, _old, val) {
        if (!this._orb) return;
        if (name === 'state') this._orb.setState(val);
        if (name === 'paused') this._orb.setPaused(val === 'true' || val === '');
        if (name === 'theme') this._orb.theme = val;
        if (name === 'speed') this._orb.speed = Number(val) || 1;
      }
      disconnectedCallback() { this._orb?.destroy(); }
    }
    global.customElements.define('thinking-orbs', ThinkingOrbsElement);
  }

  global.ThinkingOrbsVanilla = { createThinkingOrb, ThinkingOrbCanvas };
})(window);
