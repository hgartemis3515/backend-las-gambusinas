/**
 * Snapshot de cocinero al tomar / auto-asignar (nombre, alias, pronombre).
 * El pronombre vive en configCocinero, no en la colección mozos.
 */

const Mozos = require('../database/models/mozos.model');
const ConfigCocinero = require('../database/models/configCocinero.model');

async function getCocineroInfo(cocineroId) {
  if (!cocineroId) {
    return { cocineroId: null, nombre: 'Cocinero', alias: 'Cocinero', pronombre: '' };
  }
  const [cocinero, config] = await Promise.all([
    Mozos.findById(cocineroId).select('name').lean(),
    ConfigCocinero.findOne({ usuarioId: cocineroId }).select('aliasCocinero pronombre').lean()
  ]);
  if (!cocinero) {
    return { cocineroId: null, nombre: 'Cocinero', alias: 'Cocinero', pronombre: '' };
  }
  const nombre = (cocinero && cocinero.name) || 'Cocinero';
  const alias = (config && config.aliasCocinero) || nombre;
  const pronombre = String((config && config.pronombre) || '').trim().slice(0, 12);
  return { cocineroId: cocinero._id, nombre, alias, pronombre };
}

module.exports = { getCocineroInfo };
