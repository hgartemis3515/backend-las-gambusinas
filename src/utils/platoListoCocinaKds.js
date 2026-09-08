/**
 * Un plato no entra a KDS / Ver Cocina / auto-asignación hasta que cocina
 * pueda prepararlo: no pendiente, PPA aprobado, para llevar cobrado en ComandaDetalle.
 */

function esLineaParaLlevar(plato) {
    if (!plato) return false;
    return plato.tipoServicio === 'para_llevar' || plato.paraLlevar === true;
}

function esLineaExtraLlevar(plato) {
    if (!plato) return false;
    return plato.tipoServicio === 'extra_llevar';
}

function platoRetenidoFueraDeCocina(plato) {
    if (!plato) return true;
    if (plato.eliminado === true || plato.anulado === true) return true;
    const estado = String(plato.estado || '').toLowerCase();
    if (estado === 'pendiente') return true;
    const pa = plato.pagoAdelantado || {};
    const ticket = String(pa.estadoTicket || '').toLowerCase();
    if (pa.requerido && ticket === 'pendiente_aprobacion') return true;
    if (esLineaParaLlevar(plato) && ticket !== 'aprobado') return true;
    return false;
}

module.exports = {
    esLineaParaLlevar,
    esLineaExtraLlevar,
    platoRetenidoFueraDeCocina
};
