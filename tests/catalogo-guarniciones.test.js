const svc = require('../src/utils/catalogoGuarniciones');

describe('construirCatalogoGuarniciones', () => {
    const plantillas = [{
        nombre: 'Acompañamiento',
        opciones: [{ nombre: 'Papas fritas' }, 'Arroz']
    }];
    const platos = [
        {
            id: 1, _id: 'p1', nombre: 'Lomo saltado', codigo: 'L1',
            complementos: [{ grupo: 'Acompañamiento', opciones: [{ nombre: 'Papas fritas' }, { nombre: 'Arroz' }] }]
        },
        {
            id: 2, _id: 'p2', nombre: 'Pollo a la brasa', codigo: 'P2',
            complementos: [{ grupo: 'Acompañamiento', opciones: ['Papas fritas'] }]
        }
    ];

    test('asocia platos a cada opción y no duplica el mismo plato', () => {
        const { items, grupos } = svc.construirCatalogoGuarniciones(plantillas, platos);
        expect(grupos).toEqual(['Acompañamiento']);
        const papas = items.find((i) => i.key === 'acompañamiento::papas fritas');
        expect(papas.platos.map((p) => p.nombre)).toEqual(['Lomo saltado', 'Pollo a la brasa']);
        expect(papas.platos).toHaveLength(2);
        const arroz = items.find((i) => i.key === 'acompañamiento::arroz');
        expect(arroz.platos.map((p) => p.nombre)).toEqual(['Lomo saltado']);
    });

    test('opción solo en plantilla de otro grupo queda sin platos', () => {
        const extra = [{ nombre: 'Guarnición', opciones: [{ nombre: 'Yuca' }] }];
        const { items } = svc.construirCatalogoGuarniciones(extra, platos);
        const yuca = items.find((i) => i.key === 'guarnición::yuca');
        expect(yuca.platos).toEqual([]);
    });

    test('si la opción no coincide, rellena por grupo (como platos.html)', () => {
        const plantilla = [{ nombre: 'Acompañamiento', opciones: [{ nombre: 'Yuca sancochada' }] }];
        const { items } = svc.construirCatalogoGuarniciones(plantilla, platos);
        const yuca = items.find((i) => i.key === 'acompañamiento::yuca sancochada');
        expect(yuca.platos.map((p) => p.nombre)).toEqual(['Lomo saltado', 'Pollo a la brasa']);
    });

    test('lee opciones legacy { opcion } además de { nombre }', () => {
        const { items } = svc.construirCatalogoGuarniciones([], [{
            id: 9, nombre: 'Ceviche', codigo: 'C1',
            complementos: [{ grupo: 'Guarnición', opciones: [{ opcion: 'Cancha' }] }]
        }]);
        const cancha = items.find((i) => i.key === 'guarnición::cancha');
        expect(cancha.platos.map((p) => p.nombre)).toEqual(['Ceviche']);
    });
});
