const moment = require('moment-timezone');
const {
    corteAntiguedad,
    debeExportarSemanal,
    validarPaquete,
    resumenPaquete,
    nombreSeguro,
    enRango,
    FORMATO,
    VERSION,
    NUNCA_BORRA,
    COLECCIONES,
} = require('../src/utils/archivoCaja');

describe('archivoCaja', () => {
    test('el corte es 7 días atrás en Lima', () => {
        const ahora = new Date('2026-09-24T15:00:00.000Z');
        const corte = corteAntiguedad(ahora, 7);
        const dias = moment(ahora).diff(moment(corte), 'days');
        expect(dias).toBe(7);
    });

    test('el lunes a las 04:00 corre una vez por semana', () => {
        const lunesTemprano = new Date('2026-09-21T08:30:00.000Z'); // 03:30 Lima
        const lunesListo = new Date('2026-09-21T09:30:00.000Z'); // 04:30 Lima
        expect(debeExportarSemanal(lunesTemprano, null)).toBe(false);
        expect(debeExportarSemanal(lunesListo, null)).toBe(true);
        expect(debeExportarSemanal(lunesListo, '2026-09-21')).toBe(false);
        const jueves = new Date('2026-09-24T15:00:00.000Z');
        expect(debeExportarSemanal(jueves, '2026-09-14')).toBe(true);
        expect(debeExportarSemanal(jueves, '2026-09-21')).toBe(false);
    });

    test('rechaza archivos que no son de caja y claves ajenas', () => {
        expect(validarPaquete({ formato: 'otro', version: 1, colecciones: {} }).ok).toBe(false);
        const malo = validarPaquete({
            formato: FORMATO,
            version: VERSION,
            colecciones: { platos: [] },
        });
        expect(malo.ok).toBe(false);
        expect(malo.error).toMatch(/platos/);
    });

    test('verifica el rango de fechas de un exportado', () => {
        const paquete = {
            formato: FORMATO,
            version: VERSION,
            colecciones: {
                comandas: [
                    { _id: 'a', createdAt: '2026-09-01T12:00:00.000Z' },
                    { _id: 'b', createdAt: '2026-09-10T12:00:00.000Z' },
                ],
            },
        };
        expect(validarPaquete(paquete).ok).toBe(true);
        const filas = resumenPaquete(paquete, '2026-09-01', '2026-09-02');
        const comandas = filas.find((f) => f.clave === 'comandas');
        expect(comandas.total).toBe(2);
        expect(comandas.enRango).toBe(1);
        expect(enRango(paquete.colecciones.comandas[1], 'createdAt', '2026-09-09', '2026-09-11')).toBe(true);
    });

    test('el nombre de archivo no sale de EXPORTADOS', () => {
        expect(nombreSeguro('../.env')).toBeNull();
        expect(nombreSeguro('caja-20260924-040000.json')).toBe('caja-20260924-040000.json');
        expect(NUNCA_BORRA.some((s) => /platos|usuarios|configuraci/i.test(s))).toBe(true);
        expect(COLECCIONES.some((c) => c.clave === 'platos')).toBe(false);
        expect(COLECCIONES.some((c) => c.clave === 'comandas')).toBe(true);
    });
});
