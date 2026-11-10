'use strict';

const {
  tramosPendientes,
  segmentosDia,
  periodoActivo,
  siguienteNumero,
} = require('../src/utils/cajasAdicionalesTurno');

const inicioDia = new Date('2026-08-29T09:00:00.000Z'); // 04:00 Lima
const finDia = new Date('2026-08-30T08:59:59.999Z');
const cierreDia = new Date('2026-08-29T22:00:00.000Z'); // 17:00 Lima
const habilita = new Date('2026-08-30T00:00:00.000Z'); // 19:00 Lima
const cierraCaja = new Date('2026-08-30T02:00:00.000Z'); // 21:00 Lima
const ahora = new Date('2026-08-30T03:00:00.000Z'); // 22:00 Lima

describe('tramosPendientes', () => {
  test('sin cajas, el pendiente sigue desde el último cierre', () => {
    const tramos = tramosPendientes({
      inicioDia,
      now: ahora,
      cierres: [{ estado: 'completado', periodoInicio: inicioDia, periodoFin: cierreDia }],
      cajaAbierta: null,
    });
    expect(tramos).toHaveLength(1);
    expect(tramos[0].inicio.toISOString()).toBe(cierreDia.toISOString());
    expect(tramos[0].fin.toISOString()).toBe(ahora.toISOString());
  });

  test('con caja abierta solo entra esa caja, no la noche previa', () => {
    const tramos = tramosPendientes({
      inicioDia,
      now: ahora,
      cierres: [{ estado: 'completado', periodoInicio: inicioDia, periodoFin: cierreDia }],
      cajaAbierta: { estado: 'abierta', habilitadaAt: habilita, numero: 2 },
    });
    expect(tramos).toHaveLength(1);
    expect(tramos[0].inicio.toISOString()).toBe(habilita.toISOString());
  });

  test('al cerrar la caja 2 quedan la noche previa y la noche posterior', () => {
    const tramos = tramosPendientes({
      inicioDia,
      now: ahora,
      cierres: [
        { estado: 'completado', periodoInicio: inicioDia, periodoFin: cierreDia },
        { estado: 'completado', periodoInicio: habilita, periodoFin: cierraCaja },
      ],
      cajaAbierta: null,
    });
    expect(tramos.map((t) => t.inicio.toISOString())).toEqual([
      cierreDia.toISOString(),
      cierraCaja.toISOString(),
    ]);
  });
});

describe('segmentosDia', () => {
  test('ordena DIA, CAJA2 y NOCHE', () => {
    const segs = segmentosDia({
      inicioDia,
      finDia,
      primerCierreAt: cierreDia,
      now: ahora,
      cajas: [{
        numero: 2,
        estado: 'cerrada',
        habilitadaAt: habilita,
        cerradaAt: cierraCaja,
      }],
    });
    expect(segs.map((s) => s.label)).toEqual(['DIA', 'CAJA2', 'NOCHE']);
    expect(segs[2].excluir).toHaveLength(1);
    expect(periodoActivo({ hayCierre: true, cajaAbierta: null })).toBe('noche');
    expect(periodoActivo({ hayCierre: true, cajaAbierta: { numero: 2 } })).toBe('caja-2');
    expect(siguienteNumero([{ numero: 2 }, { numero: 3 }])).toBe(4);
  });
});
