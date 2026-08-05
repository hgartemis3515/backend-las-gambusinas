/**
 * blendy-wrapper.js
 * Wrapper para Blendy con fallback elegante a transiciones CSS si no está disponible.
 * Requiere /assets/vendor/blendy.min.js cargado (UMD que expone window.Blendy).
 */

(function (global) {
  'use strict';

  const FALLBACK_DURATION = 280; // ms para fallback CSS

  // Instancia única de Blendy (spring para modales, dynamic para elementos pequeños)
  let _blendySpring = null;
  let _blendyDynamic = null;
  let _available = false;

  function init() {
    if (typeof global.Blendy?.createBlendy !== 'function') {
      console.warn('[Blendy] Librería no disponible; se usará fallback CSS.');
      _available = false;
      return;
    }
    try {
      _blendySpring = global.Blendy.createBlendy({ animation: 'spring' });
      _blendyDynamic = global.Blendy.createBlendy({ animation: 'dynamic' });
      _available = true;
    } catch (e) {
      console.warn('[Blendy] Error al inicializar:', e);
      _available = false;
    }
  }

  function _ensureIds(fromEl, toEl) {
    if (!fromEl) return null;
    if (!fromEl.dataset.blendyFrom) {
      fromEl.dataset.blendyFrom = `_blendy_${Math.random().toString(36).slice(2, 9)}`;
    }
    if (toEl) toEl.dataset.blendyTo = fromEl.dataset.blendyFrom;
    return fromEl.dataset.blendyFrom;
  }

  function _fallbackToggle(fromEl, toEl, onDone) {
    if (!toEl) { onDone?.(); return; }
    toEl.style.opacity = '0';
    toEl.style.transform = 'scale(0.96)';
    toEl.style.transition = `opacity ${FALLBACK_DURATION}ms ease, transform ${FALLBACK_DURATION}ms ease`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toEl.style.opacity = '1';
        toEl.style.transform = 'scale(1)';
      });
    });
    setTimeout(() => {
      toEl.style.transition = '';
      toEl.style.transform = '';
      onDone?.();
    }, FALLBACK_DURATION);
  }

  function _fallbackUntoggle(fromEl, toEl, onDone) {
    if (!toEl) { onDone?.(); return; }
    toEl.style.transition = `opacity ${FALLBACK_DURATION}ms ease, transform ${FALLBACK_DURATION}ms ease`;
    toEl.style.opacity = '0';
    toEl.style.transform = 'scale(0.96)';
    setTimeout(() => {
      toEl.style.transition = '';
      toEl.style.transform = '';
      toEl.style.opacity = '';
      onDone?.();
    }, FALLBACK_DURATION);
  }

  /**
   * Morfar de un elemento origen a un elemento destino (abrir).
   * @param {HTMLElement} fromEl - elemento origen (botón/chip)
   * @param {HTMLElement} toEl - elemento destino (modal/panel)
   * @param {Object} opts - { animation: 'spring'|'dynamic', onDone }
   */
  function morph(fromEl, toEl, opts = {}) {
    if (!fromEl || !toEl) return;
    const id = _ensureIds(fromEl, toEl);
    const blendy = opts.animation === 'dynamic' ? _blendyDynamic : _blendySpring;
    if (!_available || !blendy) {
      _fallbackToggle(fromEl, toEl, opts.onDone);
      return;
    }
    try {
      blendy.update(); // re-escanea data-blendy-from
      blendy.toggle(id, opts.onDone);
    } catch (e) {
      console.warn('[Blendy] toggle falló, usando fallback:', e);
      _fallbackToggle(fromEl, toEl, opts.onDone);
    }
  }

  /**
   * Morfar de vuelta (cerrar).
   */
  function unmorph(fromEl, toEl, opts = {}) {
    if (!fromEl || !toEl) { opts.onDone?.(); return; }
    const id = fromEl.dataset.blendyFrom;
    const blendy = opts.animation === 'dynamic' ? _blendyDynamic : _blendySpring;
    if (!_available || !blendy || !id) {
      _fallbackUntoggle(fromEl, toEl, opts.onDone);
      return;
    }
    try {
      blendy.untoggle(id, opts.onDone);
    } catch (e) {
      console.warn('[Blendy] untoggle falló, usando fallback:', e);
      _fallbackUntoggle(fromEl, toEl, opts.onDone);
    }
  }

  /**
   * Restaura estilos que Blendy deja en el origen (opacity:0, pointer-events:none).
   * Necesario al cerrar modales Alpine: si no se hace untoggle, el botón desaparece.
   */
  function restoreSource(fromIdOrEl) {
    const fromEl = typeof fromIdOrEl === 'string'
      ? document.querySelector(`[data-blendy-from="${fromIdOrEl}"]`)
      : fromIdOrEl;
    if (!fromEl) return;
    const id = fromEl.dataset.blendyFrom;
    const toEl = id ? document.querySelector(`[data-blendy-to="${id}"]`) : null;

    const reset = (el) => {
      if (!el) return;
      el.style.opacity = '';
      el.style.pointerEvents = '';
      el.style.transform = '';
      el.style.position = '';
      el.style.zIndex = '';
      el.style.overflow = '';
      el.style.borderRadius = '';
      el.style.transformOrigin = '';
    };
    reset(fromEl);
    reset(toEl);
    if (fromEl.firstElementChild) fromEl.firstElementChild.style.transform = '';
    if (toEl?.firstElementChild) toEl.firstElementChild.style.transform = '';

    if (_available && id) {
      try { _blendySpring?.untoggle(id); } catch (_) { /* ignore */ }
      try { _blendyDynamic?.untoggle(id); } catch (_) { /* ignore */ }
    }
  }

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.BlendyWrapper = {
    init,
    morph,
    unmorph,
    restoreSource,
    isAvailable: () => _available
  };
})(window);
