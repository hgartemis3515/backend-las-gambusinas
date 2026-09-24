const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/services/aprobacionComanda.service', () => ({
  aprobarTicketUnificado: jest.fn(async () => ({
    tipo: 'COMANDA',
    ticket: { _id: 't1', comandas: [], mesa: null },
    platosLiberados: [],
    mesaEstado: 'pagado',
  })),
  reportarTicketComanda: jest.fn(),
}));

const { JWT_SECRET } = require('../src/middleware/adminAuth');
const router = require('../src/controllers/aprobacionController');

function token(rol) {
  return jwt.sign({ id: '507f1f77bcf86cd799439011', name: 'User', rol, app: 'cocina' }, JWT_SECRET);
}

describe('roles de aprobación', () => {
  const app = express();
  app.use(express.json());
  app.use(router);

  test('PUT aprobar responde 403 para rol mozos', async () => {
    const res = await request(app)
      .put('/aprobacion/507f1f77bcf86cd799439012/aprobar')
      .set('Authorization', `Bearer ${token('mozos')}`)
      .send({});
    expect(res.status).toBe(403);
  });

  test('cajero pasa el control de rol', async () => {
    const res = await request(app)
      .put('/aprobacion/507f1f77bcf86cd799439012/aprobar')
      .set('Authorization', `Bearer ${token('cajero')}`)
      .send({});
    expect(res.status).toBe(200);
  });
});
