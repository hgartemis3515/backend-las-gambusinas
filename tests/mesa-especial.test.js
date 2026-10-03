const {
  prepararDatosMesa,
  rechazoUsoMesaEspecial,
  rechazoDescuentoAdmin,
  estaBloqueada,
  mesaPermiteDescuentoAdmin,
} = require('../src/utils/mesaEspecial');

const mesaAdmin = {
  especial: true,
  nombreMesa: 'VIP Juan',
  funcionesEspeciales: {
    soloAdmin: true,
    permiteDescuentoAdmin: true,
    requiereAutorizacion: true,
    bloquearAlPagoTotal: true,
  },
  usoEspecial: { bloqueada: true },
};

describe('mesa especial', () => {
  test('mesa normal exige número', () => {
    expect(() => prepararDatosMesa({ especial: false, area: 'a' }, null)).toThrow(/número/);
  });

  test('especial con nombre y sin número queda bloqueada', () => {
    const prep = prepararDatosMesa({
      especial: true,
      nombreMesa: '  Barra  ',
      area: 'a',
      nummesa: '',
    }, null);
    expect(prep.unset).toContain('nummesa');
    expect(prep.set.nombreMesa).toBe('Barra');
    expect(prep.set.usoEspecial.bloqueada).toBe(true);
    expect(prep.set.funcionesEspeciales.soloAdmin).toBe(true);
  });

  test('nombre de más de 24 caracteres se rechaza', () => {
    expect(() => prepararDatosMesa({
      especial: true,
      nombreMesa: 'abcdefghijklmnopqrstuvwxyz',
    }, null)).toThrow(/24/);
  });

  test('mozo no usa mesa especial', () => {
    const r = rechazoUsoMesaEspecial({ mesa: mesaAdmin, rolJwt: 'mozos', rolDb: 'mozos' });
    expect(r.statusCode).toBe(403);
    expect(r.message).toMatch(/administrador/);
  });

  test('admin sin autorizar no crea comanda', () => {
    const r = rechazoUsoMesaEspecial({ mesa: mesaAdmin, rolJwt: 'admin', rolDb: 'admin' });
    expect(r.statusCode).toBe(403);
    expect(r.message).toMatch(/autorizar/);
  });

  test('mozo usa Invitados si ya está autorizada', () => {
    const mesa = {
      especial: true,
      nombreMesa: 'Invitados',
      funcionesEspeciales: {
        soloAdmin: true,
        requiereAutorizacion: true,
        bloquearAlPagoTotal: true,
      },
      usoEspecial: { bloqueada: false },
    };
    expect(rechazoUsoMesaEspecial({ mesa, rolJwt: 'mozos', rolDb: 'mozos' })).toBeNull();
  });

  test('mozo no usa Invitados mientras sigue bloqueada', () => {
    const mesa = {
      especial: true,
      nombreMesa: 'Invitados',
      funcionesEspeciales: { soloAdmin: true, requiereAutorizacion: true },
      usoEspecial: { bloqueada: true },
    };
    const r = rechazoUsoMesaEspecial({ mesa, rolJwt: 'mozos', rolDb: 'mozos' });
    expect(r.statusCode).toBe(403);
    expect(r.message).toMatch(/autorizar/);
  });

  test('el mozo dueño usa su comanda en mesa especial autorizada', () => {
    const mesa = {
      ...mesaAdmin,
      usoEspecial: { bloqueada: false },
    };
    expect(rechazoUsoMesaEspecial({
      mesa,
      rolJwt: 'mozos',
      rolDb: 'mozos',
      esDueno: true,
    })).toBeNull();
  });

  test('admin autorizado puede asignar la comanda a un mozo', () => {
    const mesa = { ...mesaAdmin, usoEspecial: { bloqueada: false } };
    expect(rechazoUsoMesaEspecial({ mesa, rolJwt: 'admin', rolDb: 'mozos' })).toBeNull();
  });

  test('admin autorizado sí puede', () => {
    const mesa = {
      ...mesaAdmin,
      usoEspecial: { bloqueada: false },
    };
    expect(rechazoUsoMesaEspecial({ mesa, rolJwt: 'admin', rolDb: 'admin' })).toBeNull();
    expect(estaBloqueada(mesa)).toBe(false);
  });

  test('descuento solo admin y solo mesa especial', () => {
    expect(rechazoDescuentoAdmin(mesaAdmin, 'supervisor').message).toMatch(/administrador/);
    expect(rechazoDescuentoAdmin({ especial: false }, 'admin').message).toMatch(/especial/);
    expect(rechazoDescuentoAdmin(mesaAdmin, 'admin')).toBeNull();
    expect(mesaPermiteDescuentoAdmin(mesaAdmin)).toBe(true);
  });

  test('editar una mesa normal no la vuelve especial', () => {
    const actual = { especial: false, nummesa: 4, nombreMesa: null, funcionesEspeciales: {} };
    const prep = prepararDatosMesa({ estado: 'libre' }, actual);
    expect(prep.set.especial).toBe(false);
    expect(prep.set.nummesa).toBe(4);
  });
});
