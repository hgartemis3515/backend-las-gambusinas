/**
 * Debug: analizar comanda 2095 (la que tiene el PPA #351 de mesa 2)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.DBLOCAL || 'mongodb://localhost:27017/lasgambusinas';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;

  const comanda = await db.collection('comandas').findOne({ comandaNumber: 2095 });
  if (!comanda) {
    console.log('No se encontro comanda 2095');
    await mongoose.disconnect();
    return;
  }
  console.log('===== COMANDA 2095 (' + comanda._id + ') =====');
  console.log('  status=' + comanda.status + ' IsActive=' + comanda.IsActive);
  console.log('  createdAt=' + comanda.createdAt);
  console.log('  totalCalculado=' + comanda.totalCalculado);
  console.log('  cantidades=' + JSON.stringify(comanda.cantidades || []));
  console.log('  PLATOS:');
  const lineas = comanda.platos || [];
  for (const p of lineas) {
    let nombre = '';
    if (p.plato) {
      const plato = await db.collection('platos').findOne({ _id: p.plato });
      nombre = plato ? plato.nombre : '(borrado)';
    }
    console.log('  - [' + p._id + '] ' + nombre);
    console.log('      estado=' + p.estado + ' | tipoServicio=' + p.tipoServicio + ' | eliminado=' + p.eliminado + ' | anulado=' + p.anulado);
    console.log('      PPA=' + JSON.stringify(p.pagoAdelantado || null));
  }

  // Ticket PPA 351
  const tpa = await db.collection('ticketsPagoAdelantado').findOne({ ticketNumber: 351 });
  if (tpa) {
    console.log('\n===== TICKET PPA #351 =====');
    console.log('  estado=' + tpa.estado + ' mesa=' + tpa.numMesa + ' subtotal=' + tpa.subtotal + ' total=' + tpa.total);
    console.log('  comandas=[' + (tpa.comandas || []).map(c => c.toString()) + ']');
    console.log('  platos:');
    for (const p of (tpa.platos || [])) {
      console.log('    - ' + p.nombre + ' x' + p.cantidad + ' subtotal=' + p.subtotal + ' | comandaId=' + (p.comandaId ? p.comandaId.toString() : null) + ' | platoLineaId=' + (p.platoLineaId ? p.platoLineaId.toString() : null));
    }
  }

  // Mesa 2
  const mesa2 = await db.collection('mesas').findOne({ nummesa: 2 });
  if (mesa2) {
    console.log('\n===== MESA 2 (' + mesa2._id + ') estado=' + mesa2.estado + ' =====');
  }

  // Otras comandas activas de la mesa 2
  const otras = await db.collection('comandas').find({
    mesas: mesa2 ? mesa2._id : 'none',
    IsActive: true,
    status: { $nin: ['pagado', 'completado', 'cancelado'] }
  }).toArray();
  console.log('\n===== Comandas activas de mesa 2: ' + otras.length + ' =====');
  for (const c of otras) {
    console.log('  ' + c._id + ' | num=' + c.comandaNumber + ' | status=' + c.status + ' | ' + c.createdAt);
    for (const p of (c.platos || [])) {
      let nombre = '';
      if (p.plato) {
        const plato = await db.collection('platos').findOne({ _id: p.plato });
        nombre = plato ? plato.nombre : '(borrado)';
      }
      console.log('      - [' + p._id + '] ' + nombre + ' | estado=' + p.estado + ' | PPA=' + JSON.stringify(p.pagoAdelantado || null));
    }
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
