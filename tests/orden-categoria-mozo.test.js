const {
    sanitizarOrdenPorTipo,
    sanitizarOcultoEnTipos,
    codigoCategoriaRank,
    prioridadCategoriaEnTipo,
    categoriaVisibleEnTipo,
    cmpCategoriasMozo,
    ordenarNombresCategoria,
    platoVisibleEnCarta,
    ordenarPlatosPorCategoriaYCodigo,
} = require('../src/utils/ordenCategoriaMozo');

describe('orden categorías mozo', () => {
    test('código 1–10 numérico, luego letras, vacío al final', () => {
        const cats = [
            { nombre: 'Postres', codigoMozo: '10' },
            { nombre: 'Bebidas', codigoMozo: '2' },
            { nombre: 'Entradas', codigoMozo: '1' },
            { nombre: 'Extra', codigoMozo: 'A' },
            { nombre: 'Sin código', codigoMozo: '' },
        ];
        cats.sort((a, b) => cmpCategoriasMozo(a, b, ''));
        expect(cats.map((c) => c.nombre)).toEqual(['Entradas', 'Bebidas', 'Postres', 'Extra', 'Sin código']);
        expect(codigoCategoriaRank('1')).toBeLessThan(codigoCategoriaRank('10'));
    });

    test('prioridad por carta pisa el código', () => {
        const a = { nombre: 'A', codigoMozo: '1', ordenPorTipo: { 'platos-desayuno': 50 } };
        const b = { nombre: 'B', codigoMozo: '2', ordenPorTipo: { 'platos-desayuno': 10 } };
        expect(prioridadCategoriaEnTipo(b, 'platos-desayuno')).toBeLessThan(prioridadCategoriaEnTipo(a, 'platos-desayuno'));
        expect(prioridadCategoriaEnTipo(a, 'carta')).toBe(1);
    });

    test('ocultar en una carta', () => {
        const cat = { nombre: 'Postres', ocultoEnTipos: ['platos-desayuno'] };
        expect(categoriaVisibleEnTipo(cat, 'platos-desayuno')).toBe(false);
        expect(categoriaVisibleEnTipo(cat, 'carta')).toBe(true);
        expect(ordenarNombresCategoria(['Postres', 'Bebidas'], [
            { nombre: 'Postres', codigoMozo: '2', ocultoEnTipos: ['platos-desayuno'] },
            { nombre: 'Bebidas', codigoMozo: '1' },
        ], 'platos-desayuno')).toEqual(['Bebidas']);
    });

    test('plato visible si alguna categoría de la carta no está oculta', () => {
        const info = [
            { nombre: 'Postres', ocultoEnTipos: ['platos-desayuno'] },
            { nombre: 'Bebidas', ocultoEnTipos: [] },
        ];
        expect(platoVisibleEnCarta({ categorias: ['Postres'] }, info, 'platos-desayuno')).toBe(false);
        expect(platoVisibleEnCarta({ categorias: ['Postres', 'Bebidas'] }, info, 'platos-desayuno')).toBe(true);
    });

    test('platos: categoría luego código de mozo', () => {
        const info = [
            { nombre: 'Entradas', codigoMozo: '1' },
            { nombre: 'Bebidas', codigoMozo: '2' },
        ];
        const list = ordenarPlatosPorCategoriaYCodigo([
            { nombre: 'Jugo', categorias: ['Bebidas'], codigoMozo: '1' },
            { nombre: 'Ceviche', categorias: ['Entradas'], codigoMozo: '10' },
            { nombre: 'Tequeños', categorias: ['Entradas'], codigoMozo: '2' },
        ], info, 'carta');
        expect(list.map((p) => p.nombre)).toEqual(['Tequeños', 'Ceviche', 'Jugo']);
    });

    test('sanitiza lote de vista por carta', () => {
        expect(sanitizarOrdenPorTipo({ 'platos-desayuno': 3.7, '': 1, x: 'no' })).toEqual({ 'platos-desayuno': 4 });
        expect(sanitizarOcultoEnTipos(['carta', 'carta', '  Cena  ', ''])).toEqual(['carta', 'Cena']);
    });
});
