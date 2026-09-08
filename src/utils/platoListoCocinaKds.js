/**
 * Un plato no entra a KDS / Ver Cocina / auto-asignación hasta que cocina
 * pueda prepararlo: no pendiente; para llevar espera ticket PPA aprobado.
 * Los platos de mesa entran de inmediato, aunque la comanda tenga PPA.
 */

function esLineaParaLlevar(plato) {
    if (!plato) return false;
    return plato.tipoServicio === 'para_llevar' || plato.paraLlevar === true;
}

function platoRetenidoFueraDeCocina(plato) {
    if (!plato) return true;
    if (plato.eliminado === true || plato.anulado === true) return true;
    const estado = String(plato.estado || '').toLowerCase();
    if (estado === 'pendiente') return true;
    // Mesa entra a KDS / Ver Cocina de inmediato, aunque vaya en un PPA.
    // Para llevar espera ticket aprobado (tras pago adelantado + aprobación).
    if (esLineaParaLlevar(plato)) {
        const ticket = String((plato.pagoAdelantado || {}).estadoTicket || '').toLowerCase();
        return ticket !== 'aprobado';
    }
    return false;
}

module.exports = {
    esLineaParaLlevar,
    platoRetenidoFueraDeCocina
};
