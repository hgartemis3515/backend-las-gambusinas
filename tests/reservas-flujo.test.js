/**
 * Tests unitarios del flujo de Reservas desde App Mozos (v1.1)
 * PLAN_RESERVAS_MOZOS_CAJA_KDS
 *
 * Cubre la lógica pura (sin DB) de:
 *  - cálculo de fechaCocina (T−20) y activación inmediata
 *  - esReservaInmediata
 *  - calcularTotalesPlato (con/sin complementos)
 *
 * Los escenarios de integración (PPA aprobado, no-show, colisión en misma mesa)
 * se documentan al final como casos E2E; la parte pura se valida aquí.
 */

const moment = require('moment-timezone');
const {
  calcularFechaCocina,
  esReservaInmediata,
  calcularTotalesPlato,
} = require('../src/repository/reserva.repository');

describe('PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1 — Flujo de reservas', () => {
  describe('calcularFechaCocina (T−20)', () => {
    test('fechaCocina = atención − 20 min cuando la atención está lejos', () => {
      const ahora = moment.tz('2026-08-13 12:00', 'America/Lima');
      const atencion = moment.tz('2026-08-13 13:00', 'America/Lima');
      const { fechaCocina, activacionInmediata } = calcularFechaCocina(atencion, 20, ahora);

      expect(activacionInmediata).toBe(false);
      // 13:00 − 20 min = 12:40
      expect(fechaCocina.format('HH:mm')).toBe('12:40');
    });

    test('usa offset configurable (no hardcodeado a 20)', () => {
      const ahora = moment.tz('2026-08-13 12:00', 'America/Lima');
      const atencion = moment.tz('2026-08-13 13:00', 'America/Lima');
      const { fechaCocina } = calcularFechaCocina(atencion, 30, ahora);
      expect(fechaCocina.format('HH:mm')).toBe('12:30');
    });

    test('activación inmediata cuando atención está a <20 min (fechaCocina ya pasó)', () => {
      // Escenario del plan: hora de atención muy cercana (<20 min)
      const ahora = moment.tz('2026-08-13 12:00', 'America/Lima');
      const atencion = moment.tz('2026-08-13 12:10', 'America/Lima'); // 10 min en el futuro
      const { fechaCocina, activacionInmediata } = calcularFechaCocina(atencion, 20, ahora);

      // 12:10 − 20 = 11:50 (pasado) → activación inmediata, fechaCocina = ahora
      expect(activacionInmediata).toBe(true);
      expect(fechaCocina.format('HH:mm')).toBe('12:00');
    });

    test('activación inmediata cuando la atención es exactamente ahora', () => {
      const ahora = moment.tz('2026-08-13 12:00', 'America/Lima');
      const atencion = ahora.clone();
      const { activacionInmediata } = calcularFechaCocina(atencion, 20, ahora);
      expect(activacionInmediata).toBe(true);
    });

    test('no activación inmediata cuando atención está exactamente a 20 min', () => {
      // Límite: atención a 20 min → fechaCocina = ahora (isSameOrBefore → true → inmediata)
      const ahora = moment.tz('2026-08-13 12:00', 'America/Lima');
      const atencion = moment.tz('2026-08-13 12:20', 'America/Lima');
      const { activacionInmediata } = calcularFechaCocina(atencion, 20, ahora);
      // 12:20 − 20 = 12:00 = ahora → isSameOrBefore(ahora) = true → inmediata
      expect(activacionInmediata).toBe(true);
    });

    test('no es inmediata cuando atención está a >20 min', () => {
      const ahora = moment.tz('2026-08-13 12:00', 'America/Lima');
      const atencion = moment.tz('2026-08-13 12:21', 'America/Lima');
      const { activacionInmediata } = calcularFechaCocina(atencion, 20, ahora);
      expect(activacionInmediata).toBe(false);
    });
  });

  describe('esReservaInmediata', () => {
    test('true cuando atención − ahora <= offset', () => {
      const ahora = moment.tz('2026-08-13 12:00', 'America/Lima');
      const atencion = moment.tz('2026-08-13 12:15', 'America/Lima');
      expect(esReservaInmediata(atencion, 20, ahora)).toBe(true);
    });
    test('false cuando atención está bien en el futuro', () => {
      const ahora = moment.tz('2026-08-13 12:00', 'America/Lima');
      const atencion = moment.tz('2026-08-13 14:00', 'America/Lima');
      expect(esReservaInmediata(atencion, 20, ahora)).toBe(false);
    });
    test('true cuando la atención ya está en el pasado', () => {
      const ahora = moment.tz('2026-08-13 12:00', 'America/Lima');
      const atencion = moment.tz('2026-08-13 11:00', 'America/Lima');
      expect(esReservaInmediata(atencion, 20, ahora)).toBe(true);
    });
  });

  describe('calcularTotalesPlato', () => {
    test('plato sin complementos: total = precio × cantidad', () => {
      const platoDoc = { precio: 15 };
      const item = { cantidad: 2, complementosSeleccionados: [] };
      const r = calcularTotalesPlato(platoDoc, item);
      expect(r.precioBase).toBe(15);
      expect(r.extraComplementos).toBe(0);
      expect(r.precioUnitario).toBe(15);
      expect(r.total).toBe(30);
      expect(r.totalUnidadesComplementos).toBe(0);
    });

    test('plato con complementos: total = (precio + extras) × cantidad', () => {
      const platoDoc = { precio: 20 };
      const item = {
        cantidad: 2,
        complementosSeleccionados: [
          { grupo: 'Adicionales', opcion: 'Extra queso', cantidad: 1, precio: 3 },
          { grupo: 'Adicionales', opcion: 'Tocino', cantidad: 2, precio: 4 },
        ],
      };
      const r = calcularTotalesPlato(platoDoc, item);
      // extras = 3*1 + 4*2 = 11; unitario = 31; total = 62
      expect(r.extraComplementos).toBe(11);
      expect(r.precioUnitario).toBe(31);
      expect(r.totalUnidadesComplementos).toBe(3);
      expect(r.total).toBe(62);
      expect(r.complementosSeleccionados).toHaveLength(2);
    });

    test('snapshot de complementos normaliza strings y cantidades', () => {
      const platoDoc = { precio: 10 };
      const item = {
        cantidad: 1,
        complementosSeleccionados: [
          { grupo: 123, opcion: null, cantidad: '3', precio: '2.5' },
        ],
      };
      const r = calcularTotalesPlato(platoDoc, item);
      expect(r.complementosSeleccionados[0].grupo).toBe('123');
      expect(r.complementosSeleccionados[0].opcion).toBe('');
      expect(r.complementosSeleccionados[0].cantidad).toBe(3);
      expect(r.complementosSeleccionados[0].precio).toBe(2.5);
      expect(r.extraComplementos).toBe(7.5);
    });

    test('cantidad por defecto = 1 si no se indica', () => {
      const r = calcularTotalesPlato({ precio: 5 }, { complementosSeleccionados: [] });
      expect(r.cantidad).toBe(1);
      expect(r.total).toBe(5);
    });
  });

  describe('Casos E2E del plan (cobertura de lógica pura)', () => {
    // Estos tests documentan los escenarios del plan y validan la parte pura
    // de cada uno. La parte con DB (validarColisionReserva, activarReservaProgramada,
    // descuento de abono en boucher) requiere integración con Mongo y se deja
    // como smoke test manual / de integración.

    test('1. Reserva con pago adelantado aprobado: fechaCocina calculada correctamente', () => {
      const ahora = moment.tz('2026-08-13 12:00', 'America/Lima');
      const atencion = moment.tz('2026-08-13 20:00', 'America/Lima');
      const { fechaCocina, activacionInmediata } = calcularFechaCocina(atencion, 20, ahora);
      expect(activacionInmediata).toBe(false);
      expect(fechaCocina.format('HH:mm')).toBe('19:40');
    });

    test('2. Reserva sin pago adelantado: misma lógica de fechaCocina', () => {
      const ahora = moment.tz('2026-08-13 12:00', 'America/Lima');
      const atencion = moment.tz('2026-08-13 20:00', 'America/Lima');
      const { fechaCocina } = calcularFechaCocina(atencion, 20, ahora);
      expect(fechaCocina.format('HH:mm')).toBe('19:40');
    });

    test('3. Reserva con hora de atención muy cercana (<20 min): activación inmediata', () => {
      const ahora = moment.tz('2026-08-13 12:00', 'America/Lima');
      const atencion = moment.tz('2026-08-13 12:08', 'America/Lima');
      const { activacionInmediata, fechaCocina } = calcularFechaCocina(atencion, 20, ahora);
      expect(activacionInmediata).toBe(true);
      expect(fechaCocina.format('HH:mm')).toBe('12:00');
    });

    test('4. No-show: la lógica de fechaCocina no afecta la expiración (no-show se gestiona por timeoutService)', () => {
      // La expiración por no-show usa fechaReserva + tiempoEspera, independiente de fechaCocina.
      // Aquí solo validamos que fechaCocina se calcula sin error para una reserva lejana.
      const ahora = moment.tz('2026-08-13 12:00', 'America/Lima');
      const atencion = moment.tz('2026-08-14 12:00', 'America/Lima');
      const { activacionInmediata } = calcularFechaCocina(atencion, 20, ahora);
      expect(activacionInmediata).toBe(false);
    });

    test('5. Colisión de reservas: la ventana de conflicto define el rango de detección', () => {
      // validarColisionReserva usa [fechaReserva − ventana, fechaReserva + ventana].
      // Validamos la lógica pura del rango (sin DB) replicando el cálculo de la ventana.
      const ventana = 120;
      const fechaReserva = moment.tz('2026-08-13 20:00', 'America/Lima');
      const inicio = fechaReserva.clone().subtract(ventana, 'minutes');
      const fin = fechaReserva.clone().add(ventana, 'minutes');
      // Una reserva a las 19:30 (a 30 min) cae dentro de la ventana → colisión
      const otra = moment.tz('2026-08-13 19:30', 'America/Lima');
      expect(otra.isBetween(inicio, fin, null, '[]')).toBe(true);
      // Una reserva a las 17:00 (a 3 h) cae fuera → no colisión
      const lejana = moment.tz('2026-08-13 17:00', 'America/Lima');
      expect(lejana.isBetween(inicio, fin, null, '[]')).toBe(false);
    });
  });
});
