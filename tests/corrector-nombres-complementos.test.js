const {
    claveNombreComplemento,
    extraerNombreOpcion,
    sugerirNombreCanonico,
    contarGuarnicionesPorNombre,
    textoContadorGuarniciones,
} = require('../src/utils/nombreComplementoCanonico');
const {
    construirPreviewCorrector,
    construirCatalogoOpciones,
    aplicarCorrectorEnMemoria,
    mapaNombresDesdePreview,
} = require('../src/utils/correctorNombresComplementos');

describe('corrector nombres complementos', () => {
    test('clave unifica papa frita / papas fritas', () => {
        expect(claveNombreComplemento('Papa frita')).toBe(claveNombreComplemento('Papas fritas'));
        expect(extraerNombreOpcion({ nombre: 'Arroz' })).toBe('Arroz');
        expect(sugerirNombreCanonico([
            { nombre: 'Papas fritas', total: 1 },
            { nombre: 'Papa frita', total: 4 },
        ])).toBe('Papa frita');
    });

    test('preview agrupa variantes de platos y plantillas', () => {
        const preview = construirPreviewCorrector(
            [
                { _id: 'p1', complementos: [{ grupo: 'Guarnición', opciones: [{ nombre: 'Papa frita' }, { nombre: 'Arroz' }] }] },
                { _id: 'p2', complementos: [{ grupo: 'Guarnición', opciones: ['Papas fritas', 'Arroz'] }] },
            ],
            [{ _id: 't1', opciones: [{ nombre: 'papas fritas' }] }]
        );
        const papa = preview.grupos.find((g) => g.clave === 'papa frita');
        expect(papa).toBeTruthy();
        expect(papa.variantes.length).toBeGreaterThanOrEqual(2);
        expect(papa.nombreSugerido).toBeTruthy();
        expect(preview.grupos.find((g) => g.clave === 'arroz')).toBeUndefined();
    });

    test('aplicar reescribe y fusiona duplicados del mismo grupo', () => {
        const preview = construirPreviewCorrector(
            [{
                _id: 'p1',
                complementos: [{
                    grupo: 'Guarnición',
                    opciones: [
                        { nombre: 'Papa frita', pronombre: 'PFrita', precio: 0 },
                        { nombre: 'Papas fritas', precio: 0 },
                    ],
                }],
            }],
            []
        );
        const map = mapaNombresDesdePreview(preview);
        const out = aplicarCorrectorEnMemoria(
            [{
                _id: 'p1',
                complementos: [{
                    grupo: 'Guarnición',
                    opciones: [
                        { nombre: 'Papa frita', pronombre: 'PFrita', precio: 0 },
                        { nombre: 'Papas fritas', precio: 0 },
                    ],
                }],
            }],
            [],
            map
        );
        expect(out.platosActualizados).toBe(1);
        expect(out.platos[0].complementos[0].opciones).toHaveLength(1);
        expect(out.platos[0].complementos[0].opciones[0].nombre).toBe(preview.grupos[0].nombreSugerido);
        expect(out.platos[0].complementos[0].opciones[0].pronombre).toBe('PFrita');
    });

    test('catálogo agrupa S y cuenta platos únicos', () => {
        const cat = construirCatalogoOpciones(
            [
                { _id: 'p1', complementos: [{ grupo: 'Guarnición', opciones: [{ nombre: 'Papa frita' }, { nombre: 'Arroz' }] }] },
                { _id: 'p2', complementos: [{ grupo: 'Guarnición', opciones: ['Papas fritas', 'Arroz'] }] },
            ],
            [{ _id: 't1', opciones: [{ nombre: 'papas fritas' }] }]
        );
        const papa = cat.opciones.find((o) => o.clave === 'papa frita');
        expect(papa).toBeTruthy();
        expect(papa.platos).toBe(2);
        expect(papa.plantillas).toBe(1);
        expect(papa.variantes.length).toBeGreaterThanOrEqual(2);
        expect(papa.tieneVariantes).toBe(true);
        const arroz = cat.opciones.find((o) => o.clave === 'arroz');
        expect(arroz.platos).toBe(2);
        expect(arroz.tieneVariantes).toBe(false);
    });

    test('catálogo sugiere pronombre más usado y marca si hay distintos', () => {
        const cat = construirCatalogoOpciones(
            [
                { _id: 'p1', complementos: [{ opciones: [{ nombre: 'Papa frita', pronombre: 'PFrita' }] }] },
                { _id: 'p2', complementos: [{ opciones: [{ nombre: 'Papas fritas', pronombre: 'Papa' }] }] },
                { _id: 'p3', complementos: [{ opciones: [{ nombre: 'Papa frita', pronombre: 'PFrita' }] }] },
            ],
            []
        );
        const papa = cat.opciones.find((o) => o.clave === 'papa frita');
        expect(papa.platos).toBe(3);
        expect(papa.pronombre).toBe('PFrita');
        expect(papa.tienePronombresDistintos).toBe(true);
        expect(papa.pronombres.some((p) => p.pronombre === 'Papa')).toBe(true);
    });

    test('soloOverrides renombra una clave y no unifica el resto', () => {
        const platos = [{
            _id: 'p1',
            complementos: [{
                grupo: 'Guarnición',
                opciones: [
                    { nombre: 'Papa frita' },
                    { nombre: 'Papas fritas' },
                    { nombre: 'Arroz' },
                ],
            }],
        }];
        const out = aplicarCorrectorEnMemoria(platos, [], new Map([['arroz', 'Arroz blanco']]));
        const nombres = out.platos[0].complementos[0].opciones.map((o) => o.nombre);
        expect(nombres).toEqual(['Papa frita', 'Papas fritas', 'Arroz blanco']);
        expect(out.platosActualizados).toBe(1);
    });

    test('sobrescribe pronombre de una clave sin tocar las demás', () => {
        const platos = [{
            _id: 'p1',
            complementos: [{
                opciones: [
                    { nombre: 'Arroz', pronombre: 'Arr' },
                    { nombre: 'Papa frita', pronombre: 'Papa' },
                    { nombre: 'Arroz', pronombre: 'A' },
                ],
            }],
        }];
        const out = aplicarCorrectorEnMemoria(
            platos,
            [],
            new Map([['arroz', 'Arroz']]),
            new Map([['arroz', 'Arr']])
        );
        const ops = out.platos[0].complementos[0].opciones;
        expect(ops).toHaveLength(2);
        expect(ops[0]).toMatchObject({ nombre: 'Arroz', pronombre: 'Arr' });
        expect(ops[1]).toMatchObject({ nombre: 'Papa frita', pronombre: 'Papa' });
    });
});

describe('contador filtrado por claves', () => {
    test('solo muestra las 3 elegidas, con x0 si no hay pendientes', () => {
        const filas = contarGuarnicionesPorNombre(
            [
                { nombre: 'Yuca', cantidad: 4 },
                { nombre: 'Papa frita', cantidad: 1 },
                { nombre: 'Papas fritas', cantidad: 2 },
            ],
            { claves: ['arroz', 'papa frita', 'ensalada'] }
        );
        expect(textoContadorGuarniciones(filas)).toBe('Arroz x0, Papa frita x3, Ensalada x0');
        expect(filas.map((f) => f.clave)).toEqual(['arroz', 'papa frita', 'ensalada']);
    });
});
