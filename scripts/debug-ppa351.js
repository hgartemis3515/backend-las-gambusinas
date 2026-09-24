/**
 * Simula la llamada al backend PPA para entender que pasa con cantidades parciales
 * Verifica el flujo del controller POST /pago-adelantado
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.DBLOCAL || 'mongodb://localhost:27017/lasgambusinas';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;

  const tpa = await db.collection('ticketsPagoAdelantado').findOne({ ticketNumber: 351 });
  console.log('TPA #351');
  console.log('  estado=' + tpa.estado + ' subtotal=' + tpa.subtotal + ' total=' + tpa.total);
  console.log('  platos:');
  for (const p of (tpa.platos || [])) {
    console.log('    - nombre=' + p.nombre + ' cantidad=' + p.cantidad + ' precio=' + p.precio + ' subtotal=' + p.subtotal);
  }

  // Boucher
  const boucher = await db.collection('boucher').findOne({ _id: tpa.boucher });
  if (boucher) {
    console.log('\nBoucher del TPA:');
    console.log('  esPagoAdelantado=' + boucher.esPagoAdelantado + ' esPagoParcial=' + boucher.esPagoParcial);
    console.log('  total=' + boucher.total + ' platos=' + (boucher.platos || []).length);
    for (const p of (boucher.platos || [])) {
      console.log('    - ' + p.nombre + ' x' + p.cantidad + ' = ' + p.subtotal);
    }
  }

  // Comanda 2095 - verificar cantidades
  const comanda = await db.collection('comandas').findOne({ comandaNumber: 2095 });
  console.log('\nComanda 2095 cantidades=' + JSON.stringify(comanda.cantidades) + ' platos=' + (comanda.platos || []).length);

  // Total de la mesa 2 pendiente segun el sistema
  const mesa2 = await db.collection('mesas').findOne({ nummesa: 2 });
  console.log('Mesa 2 estado=' + mesa2.estado);

  // Ver tickets de aprobacion con la mesa 2
  const ticketsAprob = await db.collection('ticketsAprobacion').find({
    mesa: mesa2._id
  }).sort({ createdAt: -1 }).limit(5).toArray();
  console.log('\nTickets aprobacion mesa 2 (ultimos 5): ' + ticketsAprob.length);
  for (const t of ticketsAprob) {
    console.log('  #' + t.ticketNumber + ' estado=' + t.estado + ' tipo=' + t.tipo + ' total=' + t.total + ' ' + t.createdAt);
  for (const p of (t.platos || [])) {
      console.log('      - ' + p.nombre + ' x' + p.cantidad);
    }
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
