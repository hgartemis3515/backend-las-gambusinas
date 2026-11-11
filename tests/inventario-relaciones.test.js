const { sanearGuardado, fusionarRelaciones } = require('../public/assets/js/inventarioRelaciones');

test('un vínculo editado se queda y el automático no lo pisa', () => {
    const guardado = sanearGuardado({
        manuales: [{ id: 4, plato: 'Ceviche', rubro: 'Pieza de pescado', cantidad: 2, manual: true }]
    });
    const vista = fusionarRelaciones([
        { id: 1, plato: 'Ceviche', rubro: 'Pieza de pescado', cantidad: 1 },
        { id: 2, plato: 'Humita', rubro: 'Humita', cantidad: 1 }
    ], guardado);
    const ceviche = vista.find((r) => r.plato === 'Ceviche');
    expect(ceviche.cantidad).toBe(2);
    expect(ceviche.manual).toBe(true);
    expect(vista.some((r) => r.plato === 'Humita')).toBe(true);
});

test('un vínculo quitado no vuelve con el automático', () => {
    const vista = fusionarRelaciones([
        { id: 1, plato: 'Ceviche', rubro: 'Pieza de pescado', cantidad: 1 },
        { id: 2, plato: 'Humita', rubro: 'Humita', cantidad: 1 }
    ], {
        manuales: [],
        quitadas: [{ plato: 'Ceviche', rubro: 'Pieza de pescado' }]
    });
    expect(vista.map((r) => r.plato)).toEqual(['Humita']);
});

test('volver a vincular borra la marca de quitado', () => {
    const guardado = sanearGuardado({
        manuales: [{ id: 9, plato: 'Ceviche', rubro: 'Pieza de pescado', cantidad: 1, manual: true }],
        quitadas: [{ plato: 'Ceviche', rubro: 'Pieza de pescado' }]
    });
    expect(guardado.quitadas).toEqual([]);
    expect(guardado.manuales).toHaveLength(1);
});
