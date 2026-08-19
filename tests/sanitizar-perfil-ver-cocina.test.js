const {
    sanitizarConfigPerfilVerCocina,
    fusionarConfigPerfilVerCocina,
} = require('../src/utils/sanitizarPerfilVerCocina');

describe('sanitizarConfigPerfilVerCocina', () => {
    test('conserva opciones de Personalizar incluidas las de guarniciones', () => {
        const out = sanitizarConfigPerfilVerCocina({
            ocultarCronometroGuarniciones: true,
            ocultarCuadroGuarniciones: true,
            tituloListaGuarniciones: 'Lista de Guarniciones',
            colorTextoGuarnicion: null,
            tamanioFuentePlato: 40,
        });
        expect(out.ocultarCronometroGuarniciones).toBe(true);
        expect(out.ocultarCuadroGuarniciones).toBe(true);
        expect(out.tituloListaGuarniciones).toBe('Lista de Guarniciones');
        expect(out.colorTextoGuarnicion).toBeNull();
        expect(out.tamanioFuentePlato).toBe(40);
    });

    test('conserva color y tamaño del plato referencial de guarniciones', () => {
        const out = sanitizarConfigPerfilVerCocina({
            colorTextoPadreGuarnicion: '#fbbf24',
            tamanioFuentePadreGuarnicion: 18,
            referenciaPadreGuarnicion: 'parentesis',
            mostrarTitulosListasSplit: true,
            fuenteFamiliaCustom: 'Comic Sans MS, cursive',
        });
        expect(out.colorTextoPadreGuarnicion).toBe('#fbbf24');
        expect(out.tamanioFuentePadreGuarnicion).toBe(18);
        expect(out.referenciaPadreGuarnicion).toBe('parentesis');
        expect(out.mostrarTitulosListasSplit).toBe(true);
        expect(out.fuenteFamiliaCustom).toBe('Comic Sans MS, cursive');
    });

    test('acepta una clave visual nueva (no pierde opciones futuras del panel)', () => {
        const out = sanitizarConfigPerfilVerCocina({ nuevaOpcionPersonalizar: false });
        expect(out.nuevaOpcionPersonalizar).toBe(false);
    });

    test('rechaza prototype pollution y secretos', () => {
        const out = sanitizarConfigPerfilVerCocina({
            constructor: 'x',
            token: 'abc',
            __proto__: { admin: true },
            nested: { a: 1 },
        });
        expect(Object.prototype.hasOwnProperty.call(out, 'constructor')).toBe(false);
        expect(out.token).toBeUndefined();
        expect(out.nested).toBeUndefined();
    });

    test('fusionar no pisa claves viejas si el payload nuevo no las trae', () => {
        const merged = fusionarConfigPerfilVerCocina(
            { ocultarBuscadorPlatos: true, colorAcento: '#fff' },
            { colorAcento: '#d4af37' }
        );
        expect(merged.ocultarBuscadorPlatos).toBe(true);
        expect(merged.colorAcento).toBe('#d4af37');
    });
});
