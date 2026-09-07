'use strict';

/**
 * Apaga tickets activos cuyas comandas están todas eliminadas.
 * No toca data/*.json.
 */
const mongoose = require('mongoose');
const { esComandaEliminada } = require('../src/utils/estadisticasComandas');

function idsDe(t) {
  return (t.comandas || []).map((id) => String(id)).filter(Boolean);
}

async function main() {
  const uri = process.env.DBLOCAL || 'mongodb://localhost:27017/lasgambusinas';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const motivo = '[Comanda eliminada: barrido tickets huérfanos]';

  const collections = ['ticketsAprobacion', 'ticketsPagoAdelantado'];
  let total = 0;
  for (const name of collections) {
    const tickets = await db.collection(name).find({ isActive: { $ne: false } }).toArray();
    for (const t of tickets) {
      const ids = idsDe(t);
      if (!ids.length) continue;
      const oids = ids
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      const cmds = await db.collection('comandas').find({ _id: { $in: oids } }).toArray();
      if (!cmds.length) continue;
      if (!cmds.every((c) => esComandaEliminada(c))) continue;
      await db.collection(name).updateOne(
        { _id: t._id },
        {
          $set: {
            isActive: false,
            observaciones: t.observaciones ? `${t.observaciones}\n${motivo}` : motivo
          }
        }
      );
      total += 1;
      console.log(name, 'ticket', t.ticketNumber, 'comandas', t.comandasNumbers, 'total', t.total);
    }
  }
  console.log('anulados', total);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
