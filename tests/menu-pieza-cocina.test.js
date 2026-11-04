const { elegirPiezaMenu, anexarMarcaMenu, esPlatoDeMenu } = require('../src/utils/menuPiezaCocina');

test('sin pierna el menu sale de pecho', () => {
    expect(elegirPiezaMenu(20, 0)).toBe('pecho');
    expect(elegirPiezaMenu(0, 0)).toBe('pecho');
});

test('sin pecho el menu sale de pierna', () => {
    expect(elegirPiezaMenu(0, 20)).toBe('pierna');
});

test('con los dos stocks elige una de las dos piezas', () => {
    const vistos = new Set();
    for (let i = 0; i < 30; i++) vistos.add(elegirPiezaMenu(20, 20));
    expect(vistos.has('pecho')).toBe(true);
    expect(vistos.has('pierna')).toBe(true);
});

test('la marca va despues del nombre y solo en los tres platos', () => {
    expect(anexarMarcaMenu('Caldo de Pollo', 'pecho')).toBe('Caldo de Pollo Pec');
    expect(anexarMarcaMenu('Arroz con pollo', 'pierna')).toBe('Arroz con pollo Pie');
    expect(anexarMarcaMenu('Caldo de Pollo Pec', 'pierna')).toBe('Caldo de Pollo Pec');
    expect(esPlatoDeMenu('Pollo a la olla')).toBe(true);
    expect(esPlatoDeMenu('Filete de pollo')).toBe(false);
});
