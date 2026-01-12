require('dotenv/config');

const mongoose = require('mongoose');
const { inicializarUsuarioAdmin } = require('../repository/mozos.repository');

mongoose.connect(process.env.DBLOCAL)

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Error de conexión a MongoDB:'));
db.once('open', async () => {
  console.log('Conectado a MongoDB');
  // Inicializar usuario admin al conectar
  await inicializarUsuarioAdmin();
});


module.exports = mongoose;
