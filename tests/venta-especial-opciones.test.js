const op = require('../public/assets/js/ventaEspecialOpciones');

test('pachamanca 3 sabores sale del nombre y 2 sabores puede venir de la ficha', () => {
  expect(op.metaPlato('Pachamanca 3 sabores').saboresPorPlato).toBe(3);
  expect(op.metaPlato('Pachamanca a la Olla', 2).saboresPorPlato).toBe(2);
  expect(op.metaPlato('Pachamanca de Cordero').saboresPorPlato).toBe(0);
  expect(op.metaPlato('1/4 pollo a la leña').esLena).toBe(true);
  expect(op.metaPlato('1/4 pollo a la leña').esPacha).toBe(false);
  expect(op.esIngredienteSabor({ productoNombre: 'Pollo pachamanca pierna', complemento: '' })).toBe(true);
  expect(op.esIngredienteSabor({ productoNombre: 'Humita', complemento: '1 humita' })).toBe(false);
});

test('un plato de 2 sabores solo resta los sabores elegidos', () => {
  const meta = op.metaPlato('Pachamanca 2 sabores');
  const pollo = { complemento: 'Sabor: Pollo', productoNombre: 'Pollo pachamanca pierna', factor: 1, rowId: 'pollo_pachamanca' };
  const chancho = { complemento: 'Sabor: Chancho', productoNombre: 'Cerdo pachamanca', factor: 1, rowId: 'cerdo_pachamanca' };
  const humita = { complemento: '2 humitas', productoNombre: 'Humita', factor: 2, rowId: 'humita' };
  expect(op.cantidadDescarga({ cantPlatos: 2, factor: 1, ing: pollo, meta, saboresElegidos: 3 })).toBe(3);
  expect(op.cantidadDescarga({ cantPlatos: 2, factor: 1, ing: chancho, meta, saboresElegidos: 0 })).toBe(0);
  expect(op.cantidadDescarga({ cantPlatos: 2, factor: 2, ing: humita, meta })).toBe(4);
  expect(op.avisoPlato({ nombre: 'Pachamanca 2 sabores', cant: 2, meta, saboresElegidos: 3 }))
    .toBe('Pachamanca 2 sabores: elige 4 sabores (van 3).');
  expect(op.avisoPlato({ nombre: 'Pachamanca 2 sabores', cant: 2, meta, saboresElegidos: 4 })).toBe('');
  const cordero = op.metaPlato('Pachamanca de Cordero');
  expect(op.cantidadDescarga({ cantPlatos: 1, factor: 1, ing: pollo, meta: cordero, saboresElegidos: 0 })).toBe(1);
});

test('leña resta solo el corte elegido', () => {
  const meta = op.metaPlato('1/4 pollo a la leña');
  const pecho = { complemento: 'Parte pecho', productoNombre: 'Pecho a la Leña', factor: 1 };
  const pierna = { complemento: 'Parte pierna. Solo cocido', productoNombre: 'Pierna a la leña', factor: 1 };
  const papa = { complemento: 'Guarnición: papa', productoNombre: 'Papas', factor: 1 };
  expect(op.corteLenaDe(pecho)).toBe('pechugas');
  expect(op.corteLenaDe(pierna)).toBe('piernas');
  expect(op.cantidadDescarga({ cantPlatos: 2, factor: 1, ing: pecho, meta, corteElegido: 'piernas' })).toBe(0);
  expect(op.cantidadDescarga({ cantPlatos: 2, factor: 1, ing: pierna, meta, corteElegido: 'piernas' })).toBe(2);
  expect(op.cantidadDescarga({ cantPlatos: 2, factor: 1, ing: papa, meta, corteElegido: 'piernas' })).toBe(2);
});
