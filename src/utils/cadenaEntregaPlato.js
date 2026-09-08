/**
 * Cadena de entrega de plato.
 * Cocina confirma salida del pass (`salio`).
 * Si `minutosDelay` es 0, `salio` cierra en `entregado` al instante.
 * Si `minutosDelay` > 0, el plato queda en `salio` hasta que pase esa espera
 * (o el mozo pulse Entregar).
 */

function normalizarEstadoPlato(estado) {
    const e = String(estado || '').toLowerCase();
    if (['en_espera', 'pendiente', 'ingresante'].includes(e)) return 'pedido';
    return e;
}

function pasosCadenaEntregaAbsoluta(estado, minutosDelay = 0) {
    const e = normalizarEstadoPlato(estado);
    const delay = Number(minutosDelay) > 0;
    if (e === 'entregado' || e === 'pagado') return [];
    if (e === 'salio') return delay ? [] : ['entregado'];
    if (e === 'recoger') return delay ? ['salio'] : ['salio', 'entregado'];
    return delay ? ['recoger', 'salio'] : ['recoger', 'salio', 'entregado'];
}

/**
 * Destinos a aplicar en PUT /plato/:id/estado.
 * `minutosDelay` > 0: cocina deja el plato en `salio`; no encadena a `entregado`.
 */
function destinosCambioEstadoPlato(estadoAnterior, nuevoEstado, absoluto, minutosDelay = 0) {
    const actual = normalizarEstadoPlato(estadoAnterior);
    const dest = String(nuevoEstado || '').toLowerCase();
    if (absoluto || dest === 'salio') {
        return pasosCadenaEntregaAbsoluta(estadoAnterior, minutosDelay);
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
