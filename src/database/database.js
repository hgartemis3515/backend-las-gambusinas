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

mongoose.connect(process.env.DBLOCAL);

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Error de conexión a MongoDB:'));
db.once('open', async () => {
  console.log('Conectado a MongoDB');

  console.log('🔄 Importando datos desde data/*.json...');
  await importarPlatosDesdeJSON();
  await importarAreasDesdeJSON();
  await importarMesasDesdeJSON();
  await importarMozosDesdeJSON();
  await inicializarUsuarioAdmin();
  await importarClientesDesdeJSON();
  await importarComandasDesdeJSON();
  await importarBoucherDesdeJSON();
  await importarAuditoriaDesdeJSON();
  console.log('✅ Importación de datos finalizada.');
});

module.exports = mongoose;
