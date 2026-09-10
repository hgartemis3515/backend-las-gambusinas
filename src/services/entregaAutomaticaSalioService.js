/**
 * Barrido: platos en `salio` cuyo tiempos.salio ya cumplió la espera
 * de mozos.entregaAutomaticaMinutos → entregado.
 */
const logger = require('../utils/logger');
const {
  obtenerMinutosEntregaAutomaticaMozos,
  msRestantesEntregaAutomatica,
  tiempoSalioRequiereReparacion
} = require('../utils/entregaAutomaticaMozos');

const SWEEP_MS = 20000;
let sweepInterval = null;

async function entregarPlatoSalio(comandaId, platoId) {
  const { cambiarEstadoPlato } = require('../repository/comanda.repository');
  await cambiarEstadoPlato(comandaId, platoId, 'entregado');
  if (global.emitPlatoActualizado) {
    await global.emitPlatoActualizado(comandaId, platoId, 'entregado', { skipPush: true });
  }
  if (global.emitComandaActualizada) {
    await global.emitComandaActualizada(comandaId, 'salio');
  }
}

async function barrerPlatosSalioVencidos() {
  try {
    const minutos = await obtenerMinutosEntregaAutomaticaMozos();
    if (minutos <= 0) return;

    const now = Date.now();
    const comandaModel = require('../database/models/comanda.model');

    const comandas = await comandaModel.find({
      IsActive: true,
      eliminada: { $ne: true },
      platos: {
        $elemMatch: {
          estado: 'salio',
          eliminado: { $ne: true },
          anulado: { $ne: true }
        }
      }
    }).select('_id platos').lean();

    for (const comanda of comandas) {
      for (let idx = 0; idx < (comanda.platos || []).length; idx++) {
        const plato = comanda.platos[idx];
        if (plato.eliminado || plato.anulado) continue;
        if (String(plato.estado || '').toLowerCase() !== 'salio') continue;
        const platoId = plato._id;
        if (!platoId) continue;

        try {
          if (tiempoSalioRequiereReparacion(plato, now)) {
            await comandaModel.updateOne(
              { _id: comanda._id },
              { $set: { [`platos.${idx}.tiempos.salio`]: new Date(now) } }
            );
            continue;
          }
          if (msRestantesEntregaAutomatica(plato, minutos, now) > 0) continue;
          await entregarPlatoSalio(comanda._id, platoId);
        } catch (err) {
          logger.warn('Auto-entrega salio vencida falló', {
            comandaId: String(comanda._id),
            platoId: String(platoId),
            error: err.message
          });
        }
      }
    }
  } catch (error) {
    logger.error('Error en barrido de entrega automática', { error: error.message });
  }
}

function iniciarBarridoEntregaAutomatica() {
  if (sweepInterval) return;
  sweepInterval = setInterval(barrerPlatosSalioVencidos, SWEEP_MS);
  setImmediate(barrerPlatosSalioVencidos);
  logger.info('Barrido entrega automática (salio → entregado) iniciado', { cadaMs: SWEEP_MS });
}

module.exports = {
  barrerPlatosSalioVencidos,
  iniciarBarridoEntregaAutomatica
};
