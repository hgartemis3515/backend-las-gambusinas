const {
  datosTicketVivos,
  registrarParejaBaja,
  registrarLetraRestantes,
  esComandaParaLlevar,
  firmaTicketEdicion,
} = require('../src/utils/historialLetrasTicket');

function comandaBase(extra = {}) {
  return {
    numeroComandaDia: 1,
    revisionTicket: 0,
    cantidades: [1, 1],
    montoDescuento: 0,
    motivoDescuento: '',
    mozoNombre: 'Ana',
    mesaNumero: 4,
    createdAt: new Date('2026-10-21T17:00:00Z'),
    platos: [
      { nombre: 'Chaufa', precioUnitario: 18, eliminado: false },
      { nombre: 'Pollo', precioUnitario: 22, eliminado: false },
    ],
    historialPlatos: [],
    historialLetrasTicket: [],
    ...extra,
  };
}

describe('historial de letras al quitar un plato', () => {
  test('primera baja: #1 queda guardada, #1b eliminados y #1c restantes', () => {
    const c = comandaBase();
    const antes = datosTicketVivos(c);
    c.platos[1].eliminado = true;
    c.platos[1].eliminadoPorNombre = 'María';
    c.platos[1].eliminadoRazon = 'Cliente canceló';
    c.historialPlatos.push({
      lineaIndex: 1,
      nombreOriginal: 'Pollo',
      cantidadOriginal: 1,
      cantidadFinal: 0,
      cantidadEliminada: 1,
      estado: 'eliminado',
      usuarioNombre: 'María',
    });
    const par = registrarParejaBaja(c, { datosAntes: antes, usuario: 'María', motivo: 'Cliente canceló' });
    expect(c.revisionTicket).toBe(2);
    expect(c.historialLetrasTicket.map((h) => h.letrero)).toEqual(['#1', '#1b', '#1c']);
    expect(c.historialLetrasTicket.map((h) => h.tipo)).toEqual(['original', 'eliminados', 'restantes']);
    expect(par.eliminados.sinTotal).toBe(true);
    expect(par.eliminados.datos.productos.map((p) => p.nombre)).toEqual(['Pollo']);
    expect(par.eliminados.datos.productos[0].lineaAnulada.usuario).toBe('María');
    expect(par.eliminados.datos.anulacion).toBeNull();
    expect(par.eliminados.datos.total).toBe(0);
    expect(par.restantes.datos.productos.map((p) => p.nombre)).toEqual(['Chaufa']);
    expect(par.restantes.sinTotal).toBe(false);
    expect(par.restantes.datos.total).toBe(18);
  });

  test('segunda baja: #1d son todos los eliminados y #1e lo que queda', () => {
    const c = comandaBase({
      cantidades: [1, 1, 1],
      platos: [
        { nombre: 'Chaufa', precioUnitario: 18 },
        { nombre: 'Pollo', precioUnitario: 22 },
        { nombre: 'Wantan', precioUnitario: 12 },
      ],
    });
    const antes1 = datosTicketVivos(c);
    c.platos[1].eliminado = true;
    c.platos[1].eliminadoPorNombre = 'María';
    c.historialPlatos.push({
      lineaIndex: 1, nombreOriginal: 'Pollo', cantidadFinal: 0, cantidadEliminada: 1, estado: 'eliminado',
    });
    registrarParejaBaja(c, { datosAntes: antes1, usuario: 'María', motivo: 'uno' });

    const antes2 = datosTicketVivos(c);
    c.platos[2].eliminado = true;
    c.platos[2].eliminadoPorNombre = 'María';
    c.historialPlatos.push({
      lineaIndex: 2, nombreOriginal: 'Wantan', cantidadFinal: 0, cantidadEliminada: 1, estado: 'eliminado',
    });
    const par = registrarParejaBaja(c, { datosAntes: antes2, usuario: 'María', motivo: 'dos' });
    expect(c.revisionTicket).toBe(4);
    expect(par.eliminados.letrero).toBe('#1d');
    expect(par.eliminados.datos.productos.map((p) => p.nombre)).toEqual(['Pollo', 'Wantan']);
    expect(par.restantes.letrero).toBe('#1e');
    expect(par.restantes.datos.productos.map((p) => p.nombre)).toEqual(['Chaufa']);
    expect(c.historialLetrasTicket.map((h) => h.letrero)).toEqual(['#1', '#1b', '#1c', '#1d', '#1e']);
  });

  test('baja de cantidad: el papel de eliminados lleva las unidades quitadas', () => {
    const c = comandaBase({
      cantidades: [3],
      platos: [{ nombre: 'Pollo', precioUnitario: 10 }],
    });
    const antes = datosTicketVivos(c);
    c.cantidades[0] = 2;
    c.historialPlatos.push({
      lineaIndex: 0,
      nombreOriginal: 'Pollo',
      cantidadOriginal: 3,
      cantidadFinal: 2,
      cantidadEliminada: 1,
      estado: 'eliminado',
      usuarioNombre: 'Ana',
      motivo: 'Sobra',
    });
    const par = registrarParejaBaja(c, { datosAntes: antes, usuario: 'Ana', motivo: 'Sobra' });
    expect(par.eliminados.datos.productos).toEqual([
      expect.objectContaining({ nombre: 'Pollo', cantidad: 1, lineaAnulada: expect.any(Object) }),
    ]);
    expect(par.restantes.datos.productos).toEqual([
      expect.objectContaining({ nombre: 'Pollo', cantidad: 2 }),
    ]);
    expect(par.restantes.datos.productos[0].lineaAnulada).toBeUndefined();
  });

  test('sin platos vivos no arma la pareja ni sube letra', () => {
    const c = comandaBase();
    const antes = datosTicketVivos(c);
    c.platos.forEach((p) => { p.eliminado = true; });
    expect(registrarParejaBaja(c, { datosAntes: antes, usuario: 'Ana', motivo: 'todo' })).toBeNull();
    expect(c.revisionTicket).toBe(0);
    expect(c.historialLetrasTicket).toEqual([]);
  });

  test('descuento sube una sola letra y guarda la anterior', () => {
    const c = comandaBase();
    const antes = datosTicketVivos(c);
    c.montoDescuento = 4;
    c.motivoDescuento = 'Promo';
    const foto = registrarLetraRestantes(c, { datosAntes: antes, usuario: 'Ana', motivo: 'Promo' });
    expect(c.revisionTicket).toBe(1);
    expect(c.historialLetrasTicket.map((h) => `${h.letrero}:${h.tipo}`)).toEqual(['#1:original', '#1b:restantes']);
    expect(foto.sinTotal).toBe(false);
    expect(foto.datos.montoDescuento).toBe(4);
    expect(foto.datos.total).toBe(36);
  });
});

describe('edición de comanda para llevar', () => {
  test('sin mesa cuenta como para llevar; una mesa no', () => {
    expect(esComandaParaLlevar({ sinMesa: true, platos: [{ tipoServicio: 'para_llevar' }] })).toBe(true);
    expect(esComandaParaLlevar({ sinMesa: false, mesas: '507f1f77bcf86cd799439011', platos: [{ tipoServicio: 'para_llevar' }] })).toBe(false);
  });

  test('agregar un plato sube una letra a #1b con el pedido nuevo', () => {
    const c = comandaBase({
      sinMesa: true,
      mesaNumero: null,
      cantidades: [1],
      platos: [{ nombre: 'Chaufa', precioUnitario: 18, tipoServicio: 'para_llevar' }],
    });
    const antes = datosTicketVivos(c);
    const firmaAntes = firmaTicketEdicion(c);
    c.platos.push({ nombre: 'Inca Kola', precioUnitario: 8, tipoServicio: 'para_llevar' });
    c.cantidades.push(1);
    expect(firmaTicketEdicion(c)).not.toBe(firmaAntes);
    const foto = registrarLetraRestantes(c, {
      datosAntes: antes,
      usuario: 'Ana',
      motivo: 'Edición de comanda para llevar',
    });
    expect(c.revisionTicket).toBe(1);
    expect(foto.letrero).toBe('#1b');
    expect(foto.datos.comandaNumeroDisplay).toBe('#1b');
    expect(foto.datos.sinMesa).toBe(true);
    expect(foto.datos.productos.map((p) => p.nombre)).toEqual(['Chaufa', 'Inca Kola']);
    expect(c.historialLetrasTicket.map((h) => `${h.letrero}:${h.tipo}`)).toEqual(['#1:original', '#1b:restantes']);
  });
});
