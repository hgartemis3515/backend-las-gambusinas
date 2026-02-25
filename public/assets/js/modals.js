/**
 * Lógica de modales CRUD — Las Gambusinas
 * Los modales se controlan desde el Alpine store en shared.js.
 */
(function (window) {
  function closeOnEscape(callback) {
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        callback();
        document.removeEventListener('keydown', onKey);
      }
    });
  }
  window.LasGambusinasModals = { closeOnEscape };
})(window);
