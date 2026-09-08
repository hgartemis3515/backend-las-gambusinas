/**
 * Barrido: platos en `salio` cuyo tiempos.salio ya cumplió la espera
 * de mozos.entregaAutomaticaMinutos → entregado.
 */
const logger = require('../utils/logger');
const {
  obtenerMinutosEntregaAutomaticaMozos
} = require('../utils/entregaAutomaticaMozos');

const SWEEP_MS = 20000;
let sweepInterval = null;

async function barrerPlatosSalioVencidos() {
  try {
    const minutos = await obtenerMinutosEntregaAutomaticaMozos();
    if (minutos <= 0) return;

    const limite = new Date(Date.now() - minutos * 60 * 1000);
    const comandaModel = require('../database/models/comanda.model');
    const { cambiarEstadoPlato } = require('../repository/comanda.repository');

    const comandas = await comandaModel.find({
      IsActive: true,
      eliminada: { $ne: true },
      platos: {
        $elemMatch: {
          estado: 'salio',
          eliminado: { $ne: true },
          anulado: { $ne: true },
          'tiempos.salio': { $lte: limite }
        }
      }
    }).select('_id platos').lean();

    for (const comanda of comandas) {
      for (const plato of comanda.platos || []) {
        if (plato.eliminado || plato.anulado) continue;
        if (String(plato.estado || '').toLowerCase() !== 'salio') continue;
        const tSalio = plato.tiempos?.salio;
        if (!tSalio || new Date(tSalio).getTime() > limite.getTime()) continue;
        const platoId = plato._id;
        if (!platoId) continue;
        try {
          await cambiarEstadoPlato(comanda._id, platoId, 'entregado');
          if (global.emitPlatoActualizado) {
            await global.emitPlatoActualizado(comanda._id, platoId, 'entregado', { skipPush: true });
          }
          if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(comanda._id, 'salio');
          }
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
