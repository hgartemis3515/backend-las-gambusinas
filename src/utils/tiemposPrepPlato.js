'use strict';

const ESTADOS_LISTO_COCINA = ['recoger', 'salio', 'entregado', 'pagado'];

function platoListoCocinaHist(p) {
    if (!p) return false;
    if (p.tiempos?.recoger || p.listoEn) return true;
    const est = String(p.estado || '').toLowerCase();
    return ESTADOS_LISTO_COCINA.includes(est);
}

/** Timestamp de toma a persistir al marcar listo. No usa el instante de finalización. */
function resolverTomadoEnAlFinalizar(item) {
    if (!item) return null;
    return item.procesandoPor?.timestamp
        || item.asignacionMeta?.timestamp
        || item.procesadoPor?.tomadoEn
        || item.tiempos?.en_espera
        || null;
}

/**
 * Momento en que el cocinero tomó / se le asignó el plato.
 * No usa procesadoPor.timestamp: tras finalizar ese campo es el momento listo.
 */
function tomadoEnPlato(p) {
    if (!p) return null;
    if (p.procesandoPor?.timestamp) return p.procesandoPor.timestamp;
    if (p.tomadoEn) return p.tomadoEn;
    if (p.procesadoPor?.tomadoEn) return p.procesadoPor.tomadoEn;
    if (p.asignacionMeta?.timestamp) return p.asignacionMeta.timestamp;
    if (p.tiempos?.en_espera) return p.tiempos.en_espera;
    return null;
}

/** Momento en que el plato quedó listo (recoger). Congela el cronómetro. */
function listoEnPlato(p) {
    if (!p) return null;
    if (p.listoEn) return p.listoEn;
    if (p.tiempos?.recoger) return p.tiempos.recoger;
    if (!platoListoCocinaHist(p)) return null;
    return p.procesadoPor?.timestamp
        || p.finalizadoPor?.timestamp
        || p.tiempos?.salio
        || p.tiempos?.entregado
        || p.tiempos?.pagado
        || null;
}

function tiempoPrepPlatoSegundos(p, ahora = new Date()) {
    const ini = tomadoEnPlato(p);
    if (!ini) return null;
    const finFijo = listoEnPlato(p);
    const fin = finFijo || (!platoListoCocinaHist(p) ? ahora : null);
    if (!fin) return null;
    return Math.max(0, Math.round((new Date(fin) - new Date(ini)) / 1000));
}

module.exports = {
    platoListoCocinaHist,
    resolverTomadoEnAlFinalizar,
    tomadoEnPlato,
    listoEnPlato,
    tiempoPrepPlatoSegundos
};
