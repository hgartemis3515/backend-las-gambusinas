/**
 * Cadena de entrega de plato.
 * Cocina confirma salida del pass → el plato queda entregado al comensal.
 * El mozo no confirma Entregar.
 */

function normalizarEstadoPlato(estado) {
    const e = String(estado || '').toLowerCase();
    if (['en_espera', 'pendiente', 'ingresante'].includes(e)) return 'pedido';
    return e;
}

function pasosCadenaEntregaAbsoluta(estado) {
    const e = normalizarEstadoPlato(estado);
    if (e === 'entregado' || e === 'pagado') return [];
    if (e === 'salio') return ['entregado'];
    if (e === 'recoger') return ['salio', 'entregado'];
    return ['recoger', 'salio', 'entregado'];
}

/**
 * Destinos a aplicar en PUT /plato/:id/estado.
 * `salio` (cocina, pass) también cierra en `entregado`.
 */
function destinosCambioEstadoPlato(estadoAnterior, nuevoEstado, absoluto) {
    const actual = normalizarEstadoPlato(estadoAnterior);
    const dest = String(nuevoEstado || '').toLowerCase();
    if (absoluto || dest === 'salio') {
        return pasosCadenaEntregaAbsoluta(estadoAnterior);
    }
    if (dest === 'entregado' && (actual === 'entregado' || actual === 'pagado')) {
        return [];
    }
    if (dest === actual) return [];
    return [dest];
}

module.exports = {
    normalizarEstadoPlato,
    pasosCadenaEntregaAbsoluta,
    destinosCambioEstadoPlato
};
