const { calcular, mapearMedioPago, ErrorTributario } = require('../../src/facturacion/services/motorTributario');
const { reservarCorrelativo, validarSerie, ErrorSerie } = require('../../src/facturacion/services/serieService');
const { aCentimos } = require('../../src/facturacion/utils/dinero');

const CONFIG = { tasaIgv: 18, preciosIncluyenIGV: true, fechaEmision: '2026-10-15T12:00:00-05:00' };

const TRES_PLATOS = [
    { descripcion: 'Ceviche', cantidad: 3, precioUnitario: 12.37 },
    { descripcion: 'Chicha morada', cantidad: 1, precioUnitario: 8.99 },
    { descripcion: 'Arroz con mariscos', cantidad: 2, precioUnitario: 25.43 },
];

/** Σ líneas netas + cargos, en céntimos. */
const sumaLineas = (r) => r.items.reduce((s, it) => s + aCentimos(it.precioTotal) - aCentimos(it.descuentoGlobalProrrateado), 0)
    + aCentimos(r.totales.cargos);

describe('motorTributario — carrito con 3 platos gravados', () => {
    const r = calcular({ tipoComprobante: '03', items: TRES_PLATOS, config: CONFIG });

    test('cada línea: valorVenta = round2(precio/1.18), igv = precio - valorVenta', () => {
        expect(r.items.map((i) => [i.precioTotal, i.valorVenta, i.igv])).toEqual([
            [37.11, 31.45, 5.66],
            [8.99, 7.62, 1.37],
            [50.86, 43.10, 7.76],
        ]);
    });

    test('totales son la suma exacta de las líneas', () => {
        expect(r.totales.gravadas).toBe(82.17);
        expect(r.totales.igv).toBe(14.79);
        expect(r.totales.importeTotal).toBe(96.96);
        expect(sumaLineas(r)).toBe(aCentimos(r.totales.importeTotal));
        expect(aCentimos(r.totales.gravadas) + aCentimos(r.totales.igv)).toBe(9696);
    });

    test('leyenda 1000 con monto en letras', () => {
        expect(r.leyendas).toEqual([{ codigo: '1000', valor: 'NOVENTA Y SEIS CON 96/100 SOLES' }]);
    });

    test('precios sin IGV: igv = round2(valorVenta * 18%) por línea', () => {
        const s = calcular({ tipoComprobante: '03', items: TRES_PLATOS, config: { ...CONFIG, preciosIncluyenIGV: false } });
        expect(s.totales.gravadas).toBe(96.96);
        expect(s.totales.igv).toBe(17.45);
        expect(s.totales.importeTotal).toBe(114.41);
        expect(sumaLineas(s)).toBe(aCentimos(s.totales.importeTotal));
    });
});

describe('motorTributario — descuento global 10% (Cat. 53 código 02)', () => {
    const r = calcular({ tipoComprobante: '03', items: TRES_PLATOS, descuentoGlobal: { porcentaje: 10 }, config: CONFIG });

    test('reduce base e IGV proporcionalmente', () => {
        expect(r.descuentoGlobal).toEqual({
            codigo: '02', factor: 0.10004, montoBase: 82.17, monto: 8.22, igv: 1.48, montoConIgv: 9.70,
        });
        expect(r.totales.gravadas).toBe(73.95);
        expect(r.totales.igv).toBe(13.31);
        expect(r.totales.importeTotal).toBe(87.26);
    });

    test('prorrateo por línea suma exactamente el descuento y cuadra con el total', () => {
        const prorrateo = r.items.reduce((s, i) => s + aCentimos(i.descuentoGlobalProrrateado), 0);
        expect(prorrateo).toBe(970);
        expect(sumaLineas(r)).toBe(aCentimos(r.totales.importeTotal));
    });

    test('descuento por ítem (código 00) se informa sobre la base', () => {
        const s = calcular({
            tipoComprobante: '03',
            items: [{ descripcion: 'Promo', cantidad: 1, precioUnitario: 50, descuento: { porcentaje: 20 } }],
            config: CONFIG,
        });
        expect(s.items[0].precioTotal).toBe(40);
        expect(s.items[0].descuento).toEqual({ codigo: '00', montoBase: 42.37, monto: 8.47, factor: 0.19991 });
        expect(s.totales.importeTotal).toBe(40);
    });
});

describe('motorTributario — propina / recargo al consumo (Cat. 53 código 46)', () => {
    const r = calcular({
        tipoComprobante: '03',
        items: TRES_PLATOS,
        cargos: [
            { tipo: 'recargo_consumo', porcentaje: 10 },
            { tipo: 'propina', monto: 5 },
        ],
        config: CONFIG,
    });

    test('no altera base imponible ni IGV', () => {
        expect(r.totales.gravadas).toBe(82.17);
        expect(r.totales.igv).toBe(14.79);
        expect(r.totales.precioVenta).toBe(96.96);
    });

    test('se suman en cargosGlobales con código 46 y al importe total', () => {
        expect(r.cargosGlobales).toEqual([
            { codigo: '46', tipo: 'recargo_consumo', motivo: 'Recargo al consumo', afectaBase: false, factor: 0.1, montoBase: 96.96, monto: 9.70 },
            { codigo: '46', tipo: 'propina', motivo: 'Propina', afectaBase: false, factor: null, montoBase: 96.96, monto: 5 },
        ]);
        expect(r.totales.cargos).toBe(14.70);
        expect(r.totales.importeTotal).toBe(111.66);
        expect(sumaLineas(r)).toBe(aCentimos(r.totales.importeTotal));
    });
});

describe('motorTributario — cortesía al 100% (operación gratuita)', () => {
    const r = calcular({
        tipoComprobante: '03',
        items: [
            { descripcion: 'Lomo saltado', cantidad: 1, precioUnitario: 30 },
            { descripcion: 'Suspiro limeño (cortesía)', cantidad: 1, precioUnitario: 12, cortesia: true },
        ],
        config: CONFIG,
    });
    const cortesia = r.items[1];

    test('ítem con afectación gratuita gravada (11–16), precio 0 y valor referencial código 02', () => {
        expect(cortesia.tipoAfectacionIgv).toBe('15');
        expect(cortesia.gratuita).toBe(true);
        expect(cortesia.precioTotal).toBe(0);
        expect(cortesia.valorUnitario).toBe(0);
        expect(cortesia.tipoPrecio).toBe('02');
        expect(cortesia.valorReferencialUnitario).toBe(10.169492);
        expect(cortesia.valorVenta).toBe(10.17);
        expect(cortesia.igv).toBe(1.83);
    });

    test('totales gratuitos separados y no cobrados', () => {
        expect(r.totales.gratuitas).toBe(10.17);
        expect(r.totales.igvGratuitas).toBe(1.83);
        expect(r.totales.importeTotal).toBe(30);
        expect(r.totales.gravadas).toBe(25.42);
        expect(r.totales.igv).toBe(4.58);
    });

    test('incluye leyenda 1002', () => {
        expect(r.leyendas).toContainEqual({
            codigo: '1002',
            valor: 'TRANSFERENCIA GRATUITA DE UN BIEN Y/O SERVICIO PRESTADO GRATUITAMENTE',
        });
    });
});

describe('motorTributario — forma de pago y medios de pago', () => {
    test('Contado por defecto', () => {
        const r = calcular({ tipoComprobante: '01', items: TRES_PLATOS, config: CONFIG });
        expect(r.formaPago).toEqual({ tipo: 'Contado', montoPendiente: 0, cuotas: [] });
    });

    test('Crédito en factura con cuotas', () => {
        const r = calcular({
            tipoComprobante: '01',
            items: TRES_PLATOS,
            formaPago: { tipo: 'Credito', cuotas: [
                { monto: 50, fechaVencimiento: '2026-11-15' },
                { monto: 46.96, fechaVencimiento: '2026-12-15' },
            ] },
            config: CONFIG,
        });
        expect(r.formaPago.tipo).toBe('Credito');
        expect(r.formaPago.montoPendiente).toBe(96.96);
        expect(r.formaPago.cuotas.map((c) => [c.id, c.monto])).toEqual([['Cuota001', 50], ['Cuota002', 46.96]]);
    });

    test('Crédito rechaza cuotas que no suman el total o con fecha vencida', () => {
        const base = { tipoComprobante: '01', items: TRES_PLATOS, config: CONFIG };
        expect(() => calcular({ ...base, formaPago: { tipo: 'Credito', cuotas: [{ monto: 50, fechaVencimiento: '2026-11-15' }] } }))
            .toThrow(ErrorTributario);
        expect(() => calcular({ ...base, formaPago: { tipo: 'Credito', cuotas: [{ monto: 96.96, fechaVencimiento: '2026-10-01' }] } }))
            .toThrow(/vencimiento/);
    });

    test('Crédito no permitido en boleta', () => {
        expect(() => calcular({
            tipoComprobante: '03', items: TRES_PLATOS, config: CONFIG,
            formaPago: { tipo: 'Credito', cuotas: [{ monto: 96.96, fechaVencimiento: '2026-11-15' }] },
        })).toThrow(/Facturas/);
    });

    test('mapeo Catálogo 59', () => {
        expect(mapearMedioPago('efectivo')).toBe('001');
        expect(mapearMedioPago('tarjeta_debito')).toBe('005');
        expect(mapearMedioPago('tarjeta_credito')).toBe('006');
        expect(['yape', 'plin', 'transferencia'].map(mapearMedioPago)).toEqual(['008', '008', '008']);
        expect(() => mapearMedioPago('bitcoin')).toThrow(ErrorTributario);
    });

    test('pagos mixtos deben sumar el total', () => {
        const r = calcular({
            tipoComprobante: '03', items: TRES_PLATOS, config: CONFIG,
            pagos: [{ medio: 'efectivo', monto: 50 }, { medio: 'tarjeta_credito', monto: 46.96 }],
        });
        expect(r.mediosPago.map((m) => m.codigoSunat)).toEqual(['001', '006']);
        expect(() => calcular({
            tipoComprobante: '03', items: TRES_PLATOS, config: CONFIG,
            pagos: [{ medio: 'efectivo', monto: 50 }],
        })).toThrow(/suma de pagos/);
    });
});

describe('motorTributario — propiedad: Σ líneas == total (sin descuadres ±0.01)', () => {
    test('2000 carritos aleatorios con descuentos y recargos', () => {
        let semilla = 42;
        const rnd = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
        for (let n = 0; n < 2000; n += 1) {
            const items = Array.from({ length: 1 + Math.floor(rnd() * 8) }, (_, i) => ({
                descripcion: `Plato ${i}`,
                cantidad: 1 + Math.floor(rnd() * 5),
                precioUnitario: (1 + Math.floor(rnd() * 9999)) / 100,
                cortesia: rnd() < 0.05,
            }));
            if (items.every((i) => i.cortesia)) items[0].cortesia = false;
            const r = calcular({
                tipoComprobante: '03',
                items,
                descuentoGlobal: rnd() < 0.3 ? { porcentaje: Math.floor(rnd() * 30) } : undefined,
                cargos: rnd() < 0.3 ? [{ tipo: 'recargo_consumo', porcentaje: 10 }] : [],
                config: { ...CONFIG, preciosIncluyenIGV: rnd() < 0.7 },
            });
            const t = r.totales;
            expect(sumaLineas(r)).toBe(aCentimos(t.importeTotal));
            expect(aCentimos(t.gravadas) + aCentimos(t.igv) + aCentimos(t.cargos)).toBe(aCentimos(t.importeTotal));
        }
    });
});

/* ------------------------------------------------------------------ */
/* Reserva de correlativos: concurrencia simulada                      */
/* ------------------------------------------------------------------ */

/** Sesión falsa con registro de deshacer (simula rollback de transacción). */
function crearSesion() {
    const deshacer = [];
    let activa = true;
    return {
        inTransaction: () => activa,
        registrar: (fn) => deshacer.push(fn),
        abortar: () => { deshacer.reverse().forEach((fn) => fn()); activa = false; },
        confirmar: () => { activa = false; },
    };
}

/** Modelo falso: `$inc` atómico por documento con interleaving de I/O. */
function crearSerieFake({ serie = 'B001', tipo = '03', ultimoNumero = 0 } = {}) {
    const doc = { ruc: '20131312955', tipo, serie, activa: true, ultimoNumero };
    return {
        doc,
        async findOneAndUpdate(filtro, update, opciones) {
            await new Promise((r) => setTimeout(r, Math.random() * 5));
            if (!opciones?.session) throw new Error('sin sesión');
            const coincide = filtro.ruc === doc.ruc && filtro.tipo === doc.tipo && filtro.serie === doc.serie
                && filtro.activa === doc.activa && doc.ultimoNumero < filtro.ultimoNumero.$lt;
            if (!coincide) return null;
            const inc = update.$inc.ultimoNumero;
            doc.ultimoNumero += inc;
            opciones.session.registrar(() => { doc.ultimoNumero -= inc; });
            return { ...doc };
        },
    };
}

describe('serieService — reserva atómica de correlativos', () => {
    test('50 cobros simultáneos: correlativos únicos, consecutivos y sin saltos', async () => {
        const Modelo = crearSerieFake();
        const resultados = await Promise.all(Array.from({ length: 50 }, async () => {
            const session = crearSesion();
            const r = await reservarCorrelativo({ ruc: '20131312955', tipo: '03', serie: 'B001', session }, { Modelo });
            session.confirmar();
            return r;
        }));
        const numeros = resultados.map((r) => r.correlativo).sort((a, b) => a - b);
        expect(new Set(numeros).size).toBe(50);
        expect(numeros).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
        expect(resultados.every((r) => /^B001-\d{8}$/.test(r.idCompleto))).toBe(true);
        expect(Modelo.doc.ultimoNumero).toBe(50);
    });

    test('transacción abortada no avanza el correlativo', async () => {
        const Modelo = crearSerieFake({ ultimoNumero: 7 });
        const s1 = crearSesion();
        const r1 = await reservarCorrelativo({ ruc: '20131312955', tipo: '03', serie: 'B001', session: s1 }, { Modelo });
        expect(r1.numero).toBe('00000008');
        s1.abortar();
        expect(Modelo.doc.ultimoNumero).toBe(7);

        const s2 = crearSesion();
        const r2 = await reservarCorrelativo({ ruc: '20131312955', tipo: '03', serie: 'B001', session: s2 }, { Modelo });
        expect(r2.numero).toBe('00000008');
    });

    test('exige sesión con transacción activa', async () => {
        const Modelo = crearSerieFake();
        await expect(reservarCorrelativo({ ruc: '20131312955', tipo: '03', serie: 'B001' }, { Modelo }))
            .rejects.toMatchObject({ codigo: 'SESION_REQUERIDA' });
        const cerrada = crearSesion();
        cerrada.confirmar();
        await expect(reservarCorrelativo({ ruc: '20131312955', tipo: '03', serie: 'B001', session: cerrada }, { Modelo }))
            .rejects.toMatchObject({ codigo: 'TRANSACCION_REQUERIDA' });
    });

    test('serie agotada o inexistente', async () => {
        const Modelo = crearSerieFake({ ultimoNumero: 99999999 });
        await expect(reservarCorrelativo({ ruc: '20131312955', tipo: '03', serie: 'B001', session: crearSesion() }, { Modelo }))
            .rejects.toMatchObject({ codigo: 'SERIE_NO_DISPONIBLE' });
    });

    test('formato de series', () => {
        expect(() => validarSerie('01', 'F001')).not.toThrow();
        expect(() => validarSerie('03', 'B0A1')).not.toThrow();
        expect(() => validarSerie('07', 'FC01')).not.toThrow();
        expect(() => validarSerie('07', 'BC01')).not.toThrow();
        expect(() => validarSerie('01', 'B001')).toThrow(ErrorSerie);
        expect(() => validarSerie('01', 'FC01')).toThrow(ErrorSerie);
        expect(() => validarSerie('03', 'B01')).toThrow(ErrorSerie);
        expect(() => validarSerie('07', 'F001')).toThrow(ErrorSerie);
        expect(() => validarSerie('07', 'FC0A')).toThrow(ErrorSerie);
        expect(() => validarSerie('07', 'BC01', { tipo: '01' })).toThrow(/FC##/);
    });
});
