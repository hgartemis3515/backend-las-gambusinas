/**
 * Al revertir un plato de recoger → en_espera, devolverlo al cocinero
 * que lo tenía (toma manual o asignación automática), no al pool libre.
 */

function snapshotAsignacionCocinero(unidad) {
    if (!unidad) return null;
    const proc = unidad.procesadoPor;
    const ing = unidad.procesandoPor;
    const src = (proc && proc.cocineroId) ? proc : ((ing && ing.cocineroId) ? ing : null);
    if (!src || !src.cocineroId) return null;
    return {
        cocineroId: src.cocineroId,
        nombre: src.nombre || null,
        alias: src.alias || null,
        pronombre: src.pronombre || '',
        timestamp: src.tomadoEn || src.timestamp || null
    };
}

function payloadProcesandoPor(snap, ahora) {
    return {
        cocineroId: snap.cocineroId,
        nombre: snap.nombre || null,
        alias: snap.alias || null,
        pronombre: snap.pronombre || '',
        timestamp: snap.timestamp || ahora
    };
}

function garnishDebioRestaurarse(comp) {
    if (!comp) return false;
    if (comp.estadoCocina === 'recoger') return true;
    const teniaCocinero = !!(comp.procesadoPor && comp.procesadoPor.cocineroId);
    const yaNoLoTiene = !(comp.procesandoPor && comp.procesandoPor.cocineroId);
    return teniaCocinero && yaNoLoTiene;
}

/**
 * Campos $set para updateOne al revertir un plato a preparación.
 */
function camposRestauracionAlRevertir(plato, platoIndex, ahora) {
    const setFields = {};
    const snap = snapshotAsignacionCocinero(plato);
    if (snap) {
        setFields[`platos.${platoIndex}.procesandoPor`] = payloadProcesandoPor(snap, ahora);
    }
    (plato.complementosSeleccionados || []).forEach((comp, i) => {
        if (!garnishDebioRestaurarse(comp)) return;
        const gs = snapshotAsignacionCocinero(comp);
        if (!gs) return;
        setFields[`platos.${platoIndex}.complementosSeleccionados.${i}.procesandoPor`] = payloadProcesandoPor(gs, ahora);
        setFields[`platos.${platoIndex}.complementosSeleccionados.${i}.estadoCocina`] = 'en_espera';
    });
    return setFields;
}

/**
 * Mutación in-place (revertir comanda completa con save()).
 */
function restaurarCocineroEnPlatoDocumento(plato, ahora) {
    const snap = snapshotAsignacionCocinero(plato);
    if (snap) {
        plato.procesandoPor = payloadProcesandoPor(snap, ahora);
    }
    (plato.complementosSeleccionados || []).forEach((comp) => {
        if (!garnishDebioRestaurarse(comp)) return;
        const gs = snapshotAsignacionCocinero(comp);
        if (!gs) return;
        comp.procesandoPor = payloadProcesandoPor(gs, ahora);
        comp.estadoCocina = 'en_espera';
    });
    return plato;
}

module.exports = {
    snapshotAsignacionCocinero,
    camposRestauracionAlRevertir,
    restaurarCocineroEnPlatoDocumento
};
