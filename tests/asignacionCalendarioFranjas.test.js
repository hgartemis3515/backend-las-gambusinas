const {
    cruzaMedianoche,
    horaEnRango,
    validarHorarioFranja,
    bloqueCubreMomento,
    elegirBloqueActivo,
    franjasSolapan
} = require('../src/utils/asignacionCalendarioFranjas');

const LUN_VIE = [1, 2, 3, 4, 5];

function bloq(over = {}) {
    return {
        id: 'b',
        perfilId: 'noche',
        diasSemana: LUN_VIE,
        horaInicio: '22:00',
        horaFin: '06:00',
        activo: true,
        ...over
    };
}

describe('asignacionCalendarioFranjas', () => {
    test('cruzaMedianoche solo si fin < inicio', () => {
        expect(cruzaMedianoche('22:00', '06:00')).toBe(true);
        expect(cruzaMedianoche('08:00', '22:00')).toBe(false);
        expect(cruzaMedianoche('00:00', '23:59')).toBe(false);
    });

    test('validarHorarioFranja acepta overnight y rechaza duración 0', () => {
        expect(() => validarHorarioFranja('22:00', '06:00')).not.toThrow();
        expect(() => validarHorarioFranja('08:00', '22:00')).not.toThrow();
        expect(() => validarHorarioFranja('08:00', '08:00')).toThrow(/duración 0/);
        expect(() => validarHorarioFranja('8:00', '12:00')).toThrow(/HH:mm/);
    });

    describe('turno noche Lun–Vie 22:00–06:00', () => {
        const noche = bloq();

        test('viernes 22:00 activa; 21:59 no', () => {
            expect(bloqueCubreMomento(noche, 5, '22:00')).toBe(true);
            expect(bloqueCubreMomento(noche, 5, '21:59')).toBe(false);
        });

        test('sábado 03:00 sigue (continuación de viernes) aunque Sáb no esté en diasSemana', () => {
            expect(bloqueCubreMomento(noche, 6, '03:00')).toBe(true);
            expect(bloqueCubreMomento(noche, 6, '05:59')).toBe(true);
            expect(bloqueCubreMomento(noche, 6, '06:00')).toBe(false);
        });

        test('domingo 03:00 no cubre (no hay sábado-noche)', () => {
            expect(bloqueCubreMomento(noche, 0, '03:00')).toBe(false);
        });

        test('lunes 03:00 no cubre (domingo no está en diasSemana)', () => {
            expect(bloqueCubreMomento(noche, 1, '03:00')).toBe(false);
        });
    });

    describe('switch día 08:00–22:00 + noche 22:00–08:00', () => {
        const dia = bloq({ id: 'd', perfilId: 'dia', horaInicio: '08:00', horaFin: '22:00' });
        const noche = bloq({ id: 'n', perfilId: 'noche', horaInicio: '22:00', horaFin: '08:00' });
        const bloques = [dia, noche];

        test('22:00 gana noche; 08:00 gana día; 07:59 sigue noche', () => {
            expect(elegirBloqueActivo(bloques, 1, '22:00').perfilId).toBe('noche');
            expect(elegirBloqueActivo(bloques, 2, '07:59').perfilId).toBe('noche');
            expect(elegirBloqueActivo(bloques, 2, '08:00').perfilId).toBe('dia');
            expect(elegirBloqueActivo(bloques, 1, '21:59').perfilId).toBe('dia');
        });

        test('no hay solape de intervalos (fin exclusivo)', () => {
            expect(franjasSolapan(dia, noche)).toBe(false);
        });
    });

    test('solape 08:00–23:00 con noche 22:00–08:00 avisa', () => {
        const dia = bloq({ horaInicio: '08:00', horaFin: '23:00', perfilId: 'dia' });
        const noche = bloq({ horaInicio: '22:00', horaFin: '08:00', perfilId: 'noche' });
        expect(franjasSolapan(dia, noche)).toBe(true);
        expect(elegirBloqueActivo([dia, noche], 1, '22:30').perfilId).toBe('noche');
    });

    test('00:00–23:59 cubre todo el día', () => {
        const all = bloq({ diasSemana: [1], horaInicio: '00:00', horaFin: '23:59' });
        expect(horaEnRango('00:00', '00:00', '23:59')).toBe(true);
        expect(horaEnRango('23:59', '00:00', '23:59')).toBe(true);
        expect(bloqueCubreMomento(all, 1, '23:59')).toBe(true);
        expect(bloqueCubreMomento(all, 2, '00:00')).toBe(false);
    });

    test('prioridad: menos días gana al 24h', () => {
        const gen = bloq({
            id: 'g',
            perfilId: 'gen',
            diasSemana: [0, 1, 2, 3, 4, 5, 6],
            horaInicio: '00:00',
            horaFin: '23:59'
        });
        const lun = bloq({
            id: 'l',
            perfilId: 'lun',
            diasSemana: [1],
            horaInicio: '08:00',
            horaFin: '12:00'
        });
        expect(elegirBloqueActivo([gen, lun], 1, '10:00').perfilId).toBe('lun');
        expect(elegirBloqueActivo([gen, lun], 1, '13:00').perfilId).toBe('gen');
    });
});
