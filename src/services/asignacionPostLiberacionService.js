/**
 * Auto-asignación después de liberar platos al KDS (PPA aprobado, etc.).
 * Misma secuencia que al crear comanda / activar reserva: principales y luego guarniciones.
 */
const logger = require('../utils/logger');

const POPULATE_PLATO_ASIGNACION = 'id categoria tipo tipos nombre codigo complementosUnidosAlPlato complementos';

function normalizarIdComanda(id) {
    if (id == null || id === '') return '';
    if (typeof id === 'object') {
        if (id._id != null) return normalizarIdComanda(id._id);
        if (id.id != null && id.id !== id) return normalizarIdComanda(id.id);
        if (typeof id.toHexString === 'function') return id.toHexString();
        if (typeof id.toString === 'function') {
            const s = id.toString();
            if (s && s !== '[object Object]') return s;
        }
        return '';
    }
    return String(id);
}

function idsComandaDeTicket(ticketOrIds) {
    if (ticketOrIds == null) return [];
    const raw = Array.isArray(ticketOrIds) ? ticketOrIds : (ticketOrIds.comandas || []);
    return [...new Set(raw.map(normalizarIdComanda).filter(Boolean))];
}

function ticketEsReservaPpa(ticket, opts = {}) {
    if (opts.reservaConfirmada === true) return true;
    return Boolean(ticket && ticket.origen === 'reserva');
}

async function aplicarAsignacionAutomaticaTrasLiberarPlatos(comandaIds, opts = {}) {
    const origen = opts.origen || 'post_liberacion';
    const omitirProgramadas = opts.omitirProgramadas !== false;
    const ids = idsComandaDeTicket(Array.isArray(comandaIds) ? comandaIds : [comandaIds]);
    if (!ids.length) return { comandas: 0, asignados: 0 };

    const Comanda = require('../database/models/comanda.model');
    const asignacionAutomaticaService = require('./asignacionAutomaticaService');
    const asignacionGuarnicionesService = require('./asignacionAutomaticaGuarnicionesService');

    let asignados = 0;
    for (const comandaId of ids) {
        try {
            const comandaPop = await Comanda.findById(comandaId)
                .populate('platos.plato', POPULATE_PLATO_ASIGNACION)
                .lean();
            if (!comandaPop || !comandaPop.platos?.length) continue;
            if (omitirProgramadas && comandaPop.programadaPorReserva === true) continue;

            const resultado = await asignacionAutomaticaService.asignarPlatosNuevos(comandaPop);
            asignados += resultado?.asignados || 0;

            const comandaPost = await Comanda.findById(comandaId)
                .populate('platos.plato', POPULATE_PLATO_ASIGNACION)
                .lean();
            if (comandaPost) {
                await asignacionGuarnicionesService.asignarGuarnicionesNuevas(comandaPost);
            }

            if ((resultado?.asignados || 0) > 0 && global.emitRendimientoCocineroActualizado) {
                global.emitRendimientoCocineroActualizado({ tipo: origen, comandaId });
            }
        } catch (e) {
            logger.warn('Auto-asignación post-liberación no crítica', {
                comandaId,
                origen,
                error: e.message
            });
        }
    }
    return { comandas: ids.length, asignados };
}

/**
 * Tras aprobar PPA o forzar cobro: asigna para llevar (ya no retenidos) antes de que
 * cocina reciba comanda-actualizada. Reserva programada no entra al tablero vivo.
 */
async function asignarTrasLiberarPagoAdelantado(ticket, opts = {}) {
    if (ticketEsReservaPpa(ticket, opts)) {
        return { comandas: 0, asignados: 0 };
    }
    return aplicarAsignacionAutomaticaTrasLiberarPlatos(idsComandaDeTicket(ticket), {
        origen: opts.origen || 'post_ppa',
        omitirProgramadas: opts.omitirProgramadas,
    });
}

function programarAsignacionAutomaticaTrasLiberarPlatos(comandaIds, opts) {
    setImmediate(() => {
        aplicarAsignacionAutomaticaTrasLiberarPlatos(comandaIds, opts).catch((e) => {
            logger.warn('Auto-asignación post-liberación programada falló', { error: e.message });
        });
    });
}

module.exports = {
    normalizarIdComanda,
    idsComandaDeTicket,
    aplicarAsignacionAutomaticaTrasLiberarPlatos,
    asignarTrasLiberarPagoAdelantado,
    programarAsignacionAutomaticaTrasLiberarPlatos,
};
