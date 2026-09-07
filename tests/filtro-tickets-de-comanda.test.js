const mongoose = require('mongoose');
const {
  filtroTicketsVinculadosAComanda,
  anotarTicketsDeComanda,
  parseTicketNumber,
} = require('../src/utils/filtroTicketsDeComanda');

const CID = '64a1b2c3d4e5f67890123456';
const MESA = '64a1b2c3d4e5f67890123457';
const LINEA = '64a1b2c3d4e5f67890123458';

describe('filtroTicketsVinculadosAComanda', () => {
  test('incluye comandas[], platos.comandaId y líneas; inactivos opcional', () => {
    const q = filtroTicketsVinculadosAComanda(CID, {
      comandaNumber: 12,
      mesaId: MESA,
      platoLineaIds: [LINEA],
    });
    expect(q.isActive).toBe(true);
    expect(q.$or.some((c) => c.comandas)).toBe(true);
    expect(q.$or.some((c) => c['platos.comandaId'])).toBe(true);
    expect(q.$or.some((c) => c['platos.platoLineaId'])).toBe(true);
    expect(q.$or.some((c) => c.comandasNumbers === 12)).toBe(true);

    const conInactivos = filtroTicketsVinculadosAComanda(CID, { incluirInactivos: true });
    expect(conInactivos.isActive).toBeUndefined();
  });

  test('null si el id no es ObjectId', () => {
    expect(filtroTicketsVinculadosAComanda('nope')).toBeNull();
  });
});

describe('anotarTicketsDeComanda', () => {
  test('marca el duplicado que no está en comandas[]', () => {
    const oid = new mongoose.Types.ObjectId(CID);
    const out = anotarTicketsDeComanda([
      { _id: 'a', ticketNumber: 10, isActive: true, comandas: [oid] },
      { _id: 'b', ticketNumber: 11, isActive: true, comandas: [], platos: [{ comandaId: oid }] },
    ], CID);
    expect(out[0].vinculoDebil).toBe(false);
    expect(out[0].duplicadoHuerfano).toBe(false);
    expect(out[1].vinculoDebil).toBe(true);
    expect(out[1].duplicadoHuerfano).toBe(true);
    expect(out[1].variosTicketsActivos).toBe(true);
  });

  test('mismo número en dos docs', () => {
    const out = anotarTicketsDeComanda([
      { _id: 'a', ticketNumber: 7, isActive: true, comandas: [CID] },
      { _id: 'b', ticketNumber: 7, isActive: true, comandas: [] },
    ], CID);
    expect(out.every((t) => t.duplicadoNumero)).toBe(true);
  });
});

describe('parseTicketNumber', () => {
  test('acepta #12 y basura', () => {
    expect(parseTicketNumber('#12')).toBe(12);
    expect(parseTicketNumber('  3 ')).toBe(3);
    expect(parseTicketNumber('')).toBeNull();
  });
});
