/**
 * Número de serie de plato (2–4 dígitos). Comanda + línea.
 */

function normalizarNumeroSerie(v) {
  return String(v == null ? '' : v).replace(/\D/g, '').slice(0, 4);
}

function numeroSerieEsValido(v) {
  return /^\d{2,4}$/.test(normalizarNumeroSerie(v));
}

function catalogoDeLinea(plato) {
  const cat = plato && plato.plato;
  return cat && typeof cat === 'object' && !Array.isArray(cat) ? cat : null;
}

function platoRequiereNumeroSerie(plato, catalogo) {
  if (!plato) return false;
  if (plato.requiereNumeroSerie === true) return true;
  if (catalogo && catalogo.requiereNumeroSerie === true) return true;
  const nested = catalogoDeLinea(plato);
  return !!(nested && nested.requiereNumeroSerie === true);
}

function recolectarNumeroSerie(data) {
  const fromComanda = normalizarNumeroSerie(data && data.numeroSerie);
  if (numeroSerieEsValido(fromComanda)) return fromComanda;
  const platos = (data && data.platos) || [];
  for (const p of platos) {
    const s = normalizarNumeroSerie(p && p.numeroSerie);
    if (numeroSerieEsValido(s)) return s;
  }
  return '';
}

function catalogoDesdeMapa(plato, platosMap) {
  if (!platosMap || typeof platosMap.get !== 'function' || !plato) return null;
  const ref = plato.plato != null ? plato.plato : plato.platoId;
  if (ref == null || ref === '') return null;
  return platosMap.get(String(ref)) || platosMap.get(Number(ref)) || null;
}

/**
 * Si algún plato del pedido exige serie, exige 2–4 dígitos.
 * Copia la serie a la comanda y a cada línea.
 */
function aplicarNumeroSerieComanda(data, platosMap) {
  if (!data) return '';
  const serie = recolectarNumeroSerie(data);
  const requiere = (data.platos || []).some((p) => {
    const cat = catalogoDesdeMapa(p, platosMap);
    return platoRequiereNumeroSerie(p, cat);
  });
  if (requiere && !numeroSerieEsValido(serie)) {
    const err = new Error('Este plato requiere número de serie (2 a 4 dígitos)');
    err.statusCode = 400;
    throw err;
  }
  data.numeroSerie = serie;
  if (serie) {
    for (const p of data.platos || []) {
      p.numeroSerie = serie;
    }
  }
  return serie;
}

module.exports = {
  normalizarNumeroSerie,
  numeroSerieEsValido,
  platoRequiereNumeroSerie,
  recolectarNumeroSerie,
  aplicarNumeroSerieComanda
};
