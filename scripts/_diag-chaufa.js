'use strict';
const { MongoClient } = require('mongodb');
(async () => {
  const c = await MongoClient.connect('mongodb://localhost:27017/lasgambusinas');
  const col = c.db('lasgambusinas').collection('inventario_mapas');
  const rel = await col.findOne({ clave: 'relaciones' });
  const lista = (rel && rel.relaciones) || [];
  const hits = lista.filter((r) => /chaufa|chancho|panceta|trozo/i.test(JSON.stringify(r)));
  hits.forEach((r) => console.log(r.cantidad, '|', r.rubro, '|', r.plato, '|', r.complemento || ''));
  const hoja = await col.findOne({ clave: 'hoja' });
  const panceta = ((hoja && hoja.mapas) || []).find((m) => m && (m.id === 'panceta' || /panceta/i.test(m.nombre || '')));
  console.log('MAPA', JSON.stringify(panceta && panceta.platos, null, 2));
  await c.close();
})().catch((e) => { console.error(e); process.exit(1); });
