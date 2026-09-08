/**
 * Auto-asignación después de liberar platos al KDS (PPA aprobado, etc.).
 * Misma secuencia que al crear comanda / activar reserva: principales y luego guarniciones.
 */
const logger = require('../utils/logger');

const POPULATE_PLATO_ASIGNACION = 'id categoria tipo tipos nombre codigo complementosUnidosAlPlato complementos';

async function aplicarAsignacionAutomaticaTrasLiberarPlatos(comandaIds, opts = {}) {
    const origen = opts.origen || 'post_liberacion';
    const omitirProgramadas = opts.omitirProgramadas !== false;
    const ids = [...new Set((Array.isArray(comandaIds) ? comandaIds : [comandaIds])
        .map((id) => (id == null ? '' : String(id)))
        .filter(Boolean))];
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

function programarAsignacionAutomaticaTrasLiberarPlatos(comandaIds, opts) {
    setImmediate(() => {
        aplicarAsignacionAutomaticaTrasLiberarPlatos(comandaIds, opts).catch((e) => {
            logger.warn('Auto-asignación post-liberación programada falló', { error: e.message });
        });
    });
}

module.exports = {
    aplicarAsignacionAutomaticaTrasLiberarPlatos,
    programarAsignacionAutomaticaTrasLiberarPlatos,
};
