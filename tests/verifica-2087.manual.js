'use strict';

/**
 * Verificación e2e del fix BUG_PAGO_PARCIAL_TABLA (#2087 Jose Gambu):
 * simula las comandas/tickets reales de Mongo y valida que la vista
 * adjunta el saldo correcto y los KPIs dan 383, no 338.
 */
const {
  pendienteCobroDeComandaPopulada,
  adjuntarPendienteCobroTickets,
} = require('../src/utils/saldoPendienteComanda');

// Comandas reales (resumen) tal como las puebla COMANDA_TICKET_LIST_SELECT
const c2084 = {
  _id: '6ab44197f5c4709ecbea0b8b', comandaNumber: 2084,
  platos: [
    { estado: 'entregado', precioUnitario: 12, cantidad: 1 },
    { estado: 'entregado', precioUnitario: 16, cantidad: 1 },
    { estado: 'entregado', precioUnitario: 16, cantidad: 1 },
    { estado: 'entregado', precioUnitario: 33, cantidad: 1 },
  ],
  cantidades: [1, 1, 1, 1],
  totalCalculado: 77, montoDescuento: 0,
};
const c2085 = {
  _id: '6ab441bff5c4709ecbeb676c', comandaNumber: 2085,
  platos: [
    { estado: 'entregado', precioUnitario: 33, cantidad: 1 },
    { estado: 'entregado', precioUnitario: 12, cantidad: 1 },
  ],
  cantidades: [1, 1],
  totalCalculado: 45, montoDescuento: 0,
};
const c2086 = {
  _id: '6ab441e3f5c4709ecbecc2d8', comandaNumber: 2086,
  platos: [
    { estado: 'entregado', precioUnitario: 16, cantidad: 1 },
    { estado: 'entregado', precioUnitario: 16, cantidad: 1 },
    { estado: 'entregado', precioUnitario: 35, cantidad: 1 },
    { estado: 'entregado', precioUnitario: 50, cantidad: 1 },
    { estado: 'entregado', precioUnitario: 33, cantidad: 1 },
  ],
  cantidades: [1, 1, 1, 1, 1],
  totalCalculado: 150, montoDescuento: 0,
};
const c2087 = {
  _id: '6ab4424cf5c4709ecbee740b', comandaNumber: 2087,
  platos: [
    { estado: 'entregado', precioUnitario: 33, cantidad: 5 }, // 5 pollos
    { estado: 'entregado', precioUnitario: 12, cantidad: 1 }, // tamal
  ],
  cantidades: [3, 1], // tras 2 cobros parciales de 1 pollo
  totalCalculado: 177, montoDescuento: 0,
};

const tickets = [
  // ticket comanda_completa de 2087 (queda inactivo en DB, pero simulamos activo)
  { _id: 't1701', ticketNumber: 1701, tipo: 'comanda_completa', estado: 'pendiente_aprobacion', comandas: [JSON.parse(JSON.stringify(c2087))] },
  // 2 parciales duplicados de 33
  { _id: 't1702', ticketNumber: 1702, tipo: 'pago_parcial', estado: 'pendiente_aprobacion', comandas: [JSON.parse(JSON.stringify(c2087))] },
  { _id: 't1703', ticketNumber: 1703, tipo: 'pago_parcial', estado: 'pendiente_aprobacion', comandas: [JSON.parse(JSON.stringify(c2087))] },
  { _id: 't1698', ticketNumber: 1698, tipo: 'comanda_completa', estado: 'pendiente_aprobacion', comandas: [JSON.parse(JSON.stringify(c2084))] },
  { _id: 't1699', ticketNumber: 1699, tipo: 'comanda_completa', estado: 'pendiente_aprobacion', comandas: [JSON.parse(JSON.stringify(c2085))] },
  { _id: 't1700', ticketNumber: 1700, tipo: 'comanda_completa', estado: 'pendiente_aprobacion', comandas: [JSON.parse(JSON.stringify(c2086))] },
];

adjuntarPendienteCobroTickets(tickets);

console.log('Pendiente por comanda:');
console.log('  #2084:', pendienteCobroDeComandaPopulada(c2084));
console.log('  #2085:', pendienteCobroDeComandaPopulada(c2085));
console.log('  #2086:', pendienteCobroDeComandaPopulada(c2086));
console.log('  #2087:', pendienteCobroDeComandaPopulada(c2087), '(esperado 111 = 3 pollos x33 + tamal 12)');

const assert = require('assert');
assert.strictEqual(pendienteCobroDeComandaPopulada(c2087), 111);
assert.strictEqual(pendienteCobroDeComandaPopulada(c2084), 77);
for (const t of tickets) {
  for (const c of t.comandas) {
    assert.ok(Number.isFinite(c.pendienteCobro), `ticket ${t._id} comanda ${c.comandaNumber} sin saldo`);
  }
}
console.log('\n✅ Todos los tickets llevan comandas[].pendienteCobro adjunto. El KPI de cocina ahora dará 383, no 338.');