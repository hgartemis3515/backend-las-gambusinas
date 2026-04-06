require('dotenv/config');

const mongoose = require('mongoose');
const { inicializarUsuarioAdmin, importarMozosDesdeJSON } = require('../repository/mozos.repository');
const { importarPlatosDesdeJSON } = require('../repository/plato.repository');
const { importarAreasDesdeJSON } = require('../repository/area.repository');
const { importarMesasDesdeJSON } = require('../repository/mesas.repository');
const { importarClientesDesdeJSON } = require('../repository/clientes.repository');
const { importarComandasDesdeJSON } = require('../repository/comanda.repository');
const { importarBoucherDesdeJSON } = require('../repository/boucher.repository');
const { importarAuditoriaDesdeJSON } = require('../repository/auditoria.repository');
const { importarNotificacionesDesdeJSON, inicializarNotificaciones } = require('../repository/notificacion.repository');
const { inicializarRolesSistema } = require('../repository/roles.repository');

/** URI: prioridad DBLOCAL (proyecto) o MONGODB_URI (estándar / Atlas) */
const mongoUri = process.env.DBLOCAL || process.env.MONGODB_URI;

function enmascararUri(uri) {
  if (!uri || typeof uri !== 'string') return '(no definida)';
  try {
    return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
  } catch {
    return uri;
  }
}

function imprimirAyudaMongo(err) {
  const uri = mongoUri || '';
  const esLocal =
    uri.includes('localhost') ||
    uri.includes('127.0.0.1') ||
    uri.includes('0.0.0.0');

  console.error('\n');
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('❌ MONGODB: no se pudo conectar');
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('   URI configurada:', enmascararUri(uri));
  console.error('   Motivo:', err.message || err);

  if (!mongoUri) {
    console.error('\n   → Define en .env una de estas variables:');
    console.error('     DBLOCAL=mongodb://localhost:27017/lasgambusinas');
    console.error('     MONGODB_URI=mongodb+srv://usuario:pass@cluster.mongodb.net/lasgambusinas');
  } else if (esLocal) {
    console.error('\n   En Windows (MongoDB local en el puerto 27017):');
    console.error('   1) Comprueba que el servicio MongoDB esté en ejecución:');
    console.error('      Win+R → services.msc → busca "MongoDB" → Iniciar');
    console.error('   2) O desde PowerShell (como admin): net start MongoDB');
    console.error('   3) O con Docker:');
    console.error('      docker run -d -p 27017:27017 --name mongodb-gambusinas mongo:7');
    console.error('   4) Prueba en otra terminal: mongosh "mongodb://localhost:27017"');
  } else {
    console.error('\n   → Revisa red/VPN, IP en lista blanca de Atlas, usuario y contraseña.');
  }
  console.error('═══════════════════════════════════════════════════════════════\n');
}

if (!mongoUri) {
  imprimirAyudaMongo(new Error('Falta DBLOCAL o MONGODB_URI en .env'));
  process.exit(1);
}

const opcionesMongoose = {
  // Evita esperas de ~100s: falla antes y muestra el mensaje de ayuda
  serverSelectionTimeoutMS: 15_000,
  connectTimeoutMS: 15_000,
};

const db = mongoose.connection;
db.on('error', (err) => {
  console.error('Error de conexión a MongoDB:', err.message);
});

db.once('open', async () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 LAS GAMBUSINAS - SISTEMA POS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ Conectado a MongoDB');
  console.log('');

  console.log('🔄 Importando datos desde data/*.json...');
  const platosImport = await importarPlatosDesdeJSON();
  if (platosImport && (platosImport.imported > 0 || platosImport.skipped > 0)) {
    const seq = platosImport.sequenceNext != null ? `, sequence next=${platosImport.sequenceNext}` : '';
    console.log(`   Platos: ${platosImport.imported} agregados, ${platosImport.skipped} existentes saltados${seq}`);
  }
  await importarAreasDesdeJSON();
  await importarMesasDesdeJSON();
  await importarMozosDesdeJSON();
  await inicializarUsuarioAdmin();
  await inicializarRolesSistema();
  await importarClientesDesdeJSON();
  await importarComandasDesdeJSON();
  await importarBoucherDesdeJSON();
  await importarAuditoriaDesdeJSON();
  await inicializarNotificaciones();
  await importarNotificacionesDesdeJSON();
  console.log('✅ Importación de datos finalizada.');
});

// Promesa resuelta cuando la conexión TCP a MongoDB está lista (antes de listen HTTP)
const whenConnected = mongoose
  .connect(mongoUri, opcionesMongoose)
  .then(() => undefined)
  .catch((err) => {
    imprimirAyudaMongo(err);
    process.exit(1);
  });

module.exports = mongoose;
module.exports.whenConnected = whenConnected;
