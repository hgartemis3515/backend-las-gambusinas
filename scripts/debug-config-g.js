/**
 * Verifica el estado actual de la configuracion en la BD
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.DBLOCAL || 'mongodb://localhost:27017/lasgambusinas';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;

  const cfg = await db.collection('configuracion_sistema').findOne({});
  if (!cfg) {
    console.log('No hay configuracion en BD');
    await mongoose.disconnect();
    return;
  }
  const cocina = cfg.cocina || {};
  console.log('cocina.permitirGuarnicionesSeparadas =', cocina.permitirGuarnicionesSeparadas);
  console.log('cocina.deshabilitarOrdenSecuencialGuarniciones =', cocina.deshabilitarOrdenSecuencialGuarniciones);
  console.log('cocina.deshabilitarAgrupacionGuarniciones =', cocina.deshabilitarAgrupacionGuarniciones);
  console.log('cocina.vistaCocinaGuarnicionComoPlato =', cocina.vistaCocinaGuarnicionComoPlato);
  console.log('updatedAt =', cfg.updatedAt);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
