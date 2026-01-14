require('dotenv/config');

const mongoose = require('mongoose');
const { inicializarUsuarioAdmin } = require('../repository/mozos.repository');
const { importarPlatosDesdeJSON } = require('../repository/plato.repository');

mongoose.connect(process.env.DBLOCAL)

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Error de conexión a MongoDB:'));
db.once('open', async () => {
  console.log('Conectado a MongoDB');
  // Inicializar usuario admin al conectar
  await inicializarUsuarioAdmin();
  // Importar platos desde JSON al conectar
  console.log('🔄 Importando platos desde JSON...');
  await importarPlatosDesdeJSON();
});


module.exports = mongoose;
