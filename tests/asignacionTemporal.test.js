const {
    finTemporalLima,
    temporalVigente,
    indiceTurnoComanda,
    rotarCandidatos,
    sanitizarTemporal,
    reglaEfectivaParaAsignar
} = require('../src/utils/asignacionTemporal');
const moment = require('moment-timezone');

const TZ = 'America/Lima';

describe('asignacionTemporal', () => {
    test('Hoy cierra a las 23:59:59.999 Lima', () => {
        const from = moment.tz('2026-09-07T10:00:00', TZ);
        const hasta = finTemporalLima(1, from);
        const m = moment(hasta).tz(TZ);
        expect(m.format('YYYY-MM-DD HH:mm:ss')).toBe('2026-09-07 23:59:59');
        expect(temporalVigente({ dias: 1, hasta }, from)).toBe(true);
        expect(temporalVigente({ dias: 1, hasta }, moment.tz('2026-09-08T00:00:00', TZ))).toBe(false);
    });

    test('2 días cierra mañana a las 23:59', () => {
        const from = moment.tz('2026-09-07T10:00:00', TZ);
        const hasta = finTemporalLima(2, from);
        expect(moment(hasta).tz(TZ).format('YYYY-MM-DD')).toBe('2026-09-08');
    });

    test('turno: 1ª comanda → 0, 2ª → 1, 3ª vuelve a 0', () => {
        expect(indiceTurnoComanda(0, 2)).toBe(0);
        expect(indiceTurnoComanda(1, 2)).toBe(1);
        expect(indiceTurnoComanda(2, 2)).toBe(0);
    });

    test('rotarCandidatos deja primero al de ese turno', () => {
        const cands = [
            { cocineroId: 'A', esPrimario: true, orden: 0 },
            { cocineroId: 'B', esPrimario: false, orden: 1 }
        ];
        expect(rotarCandidatos(cands, 1)[0].cocineroId).toBe('B');
        expect(rotarCandidatos(cands, 1)[0].esPrimario).toBe(true);
    });

    test('sanitizarTemporal no recorta la ventana si dias no cambió', () => {
        const from = moment.tz('2026-09-07T10:00:00', TZ);
        const existente = { dias: 2, hasta: finTemporalLima(2, from), cocineroPrimarioId: 'A' };
        const later = moment.tz('2026-09-07T18:00:00', TZ);
        const out = sanitizarTemporal({ dias: 2, cocineroPrimarioId: 'A' }, existente, later);
        expect(out.hasta).toEqual(existente.hasta);
    });

    test('reglaEfectivaParaAsignar usa el cocinero temporal vigente', () => {
        const from = moment.tz('2026-09-07T10:00:00', TZ);
        const regla = {
            cocineroPrimarioId: 'PERM',
            backups: [],
            temporal: {
                dias: 1,
                hasta: finTemporalLima(1, from),
                cocineroPrimarioId: 'TEMP',
                backups: [],
                variarPorTurno: false
            }
        };
        const r = reglaEfectivaParaAsignar(regla, from);
        expect(r.origenTemporal).toBe(true);
        expect(r.regla.cocineroPrimarioId).toBe('TEMP');
    });

    test('sanitizarTemporal no revive un overlay ya vencido', () => {
        const from = moment.tz('2026-09-07T10:00:00', TZ);
        const hasta = finTemporalLima(1, moment.tz('2026-09-06T10:00:00', TZ));
        expect(sanitizarTemporal(
            { dias: 1, hasta, cocineroPrimarioId: 'A' },
            { dias: 1, hasta, cocineroPrimarioId: 'A' },
            from
        )).toBeNull();
    });

    test('sanitizarTemporal respeta hasta vigente enviado por el cliente', () => {
        const from = moment.tz('2026-09-07T10:00:00', TZ);
        const hasta = finTemporalLima(2, from);
        const later = moment.tz('2026-09-07T18:00:00', TZ);
        const out = sanitizarTemporal({ dias: 2, hasta, cocineroPrimarioId: 'A' }, null, later);
        expect(out.hasta).toEqual(hasta);
    });
});
