/**
 * Verifica si Redis esta cacheando la configuracion vieja
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.DBLOCAL || 'mongodb://localhost:27017/lasgambusinas';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  const keys = await db.collection('counters').find({}).toArray();
  // Buscar si hay colección de redis cache: revisar keys de redis
  const redis = require('../src/utils/redisCache');
  try {
    const val = await redis.getCustom('configuracion', 'sistema');
    if (val && val.cocina) {
      console.log('REDIS CACHE cocina.vistaCocinaGuarnicionComoPlato =', val.cocina.vistaCocinaGuarnicionComoPlato);
    } else {
      console.log('Sin cache Redis o sin cocina:', val ? Object.keys(val).slice(0, 20) : null);
    }
  } catch (e) {
    console.log('Error consultando Redis:', e.message);
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
