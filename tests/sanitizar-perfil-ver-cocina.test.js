const {
    sanitizarConfigPerfilVerCocina,
    fusionarConfigPerfilVerCocina,
    sanitizarConfigPerfilTablasKds,
    PERFIL_VER_COCINA_KEYS,
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

    test('conserva split, títulos, notas y pronombre de cocinero', () => {
        const out = sanitizarConfigPerfilVerCocina({
            grosorSeparadorSplit: 6,
            alinearTituloListaSplit: 'centro',
            mostrarTablaNotas: true,
            tituloTablaNotas: 'Notas:',
            mostrarPronombreCocineroGuarnicion: false,
            notasJuntoAGuarniciones: true,
            cuadroGuarnicionSiHayNota: false,
        });
        expect(out.grosorSeparadorSplit).toBe(6);
        expect(out.alinearTituloListaSplit).toBe('centro');
        expect(out.mostrarTablaNotas).toBe(true);
        expect(out.tituloTablaNotas).toBe('Notas:');
        expect(out.mostrarPronombreCocineroGuarnicion).toBe(false);
        expect(out.notasJuntoAGuarniciones).toBe(true);
        expect(out.cuadroGuarnicionSiHayNota).toBe(false);
    });

    test('conserva estilo de pronombre junto al plato referencial', () => {
        const out = sanitizarConfigPerfilVerCocina({
            heredarEstiloPronombrePadre: false,
            colorTextoPronombreGuarnicion: '#60a5fa',
            tamanioFuentePronombreGuarnicion: 22,
            fuenteFamiliaPronombreGuarnicion: 'Arial, Helvetica, sans-serif',
        });
        expect(out.heredarEstiloPronombrePadre).toBe(false);
        expect(out.colorTextoPronombreGuarnicion).toBe('#60a5fa');
        expect(out.tamanioFuentePronombreGuarnicion).toBe(22);
        expect(out.fuenteFamiliaPronombreGuarnicion).toBe('Arial, Helvetica, sans-serif');
    });

    test('conserva intercambio buscador/contador y su estilo', () => {
        const out = sanitizarConfigPerfilVerCocina({
            ocultarBuscadorPlatos: true,
            mostrarContadorGuarniciones: true,
            contadorGuarnicionesConPronombre: true,
            colorTextoContadorGuarniciones: '#fbbf24',
            tamanioFuenteContadorGuarniciones: 18,
            fuenteFamiliaContadorGuarniciones: 'Arial, Helvetica, sans-serif',
        });
        expect(out.ocultarBuscadorPlatos).toBe(true);
        expect(out.mostrarContadorGuarniciones).toBe(true);
        expect(out.contadorGuarnicionesConPronombre).toBe(true);
        expect(out.colorTextoContadorGuarniciones).toBe('#fbbf24');
        expect(out.tamanioFuenteContadorGuarniciones).toBe(18);
        expect(out.fuenteFamiliaContadorGuarniciones).toBe('Arial, Helvetica, sans-serif');
    });

    test('conserva hasta 3 claves del contador (Papas fritas → papa frita)', () => {
        const out = sanitizarConfigPerfilVerCocina({
            contadorGuarnicionesClaves: ['Arroz', 'Papas fritas', 'Ensalada', 'Yuca'],
        });
        expect(out.contadorGuarnicionesClaves).toEqual(['arroz', 'papa frita', 'ensalada']);
    });

    test('todas las claves conocidas de Personalizar sobreviven al sanitizar', () => {
        const sample = {};
        for (const k of PERFIL_VER_COCINA_KEYS) {
            if (/^(mostrar|ocultar|heredar|quitar|auto|degradado|animaciones|aprovechar|diferenciar|cuadro|notasJunto|contadorGuarnicionesConPronombre)/i.test(k)
                || /Prefijo$|Glow$|SeguirAlerta$|modoNocturno/.test(k)) {
                sample[k] = true;
            } else if (/color|Color/.test(k)) {
                sample[k] = '#112233';
            } else if (/tamanio|Tamanio|grosor|Grosor|radio|Radio|padding|Padding|gap|Gap|tiempo|umbral|maxTimers|duracion|columnas|Columnas|cantidadEmoji|filas/.test(k)) {
                sample[k] = 12;
            } else if (/peso|Peso/.test(k)) {
                sample[k] = '700';
            } else {
                sample[k] = 'ok';
            }
        }
        const out = sanitizarConfigPerfilVerCocina(sample);
        const missing = [...PERFIL_VER_COCINA_KEYS].filter((k) => !(k in out));
        expect(missing).toEqual([]);
        expect(out.icono).toBe('ok');
        expect(out.fuenteFamiliaNotas).toBe('ok');
        expect(out.colorFondoTarjeta).toBe('#112233');
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

    test('tablas KDS conserva vista/alertas y claves nuevas del panel', () => {
        const out = sanitizarConfigPerfilTablasKds({
            tamanoFuente: 18,
            mostrarBadgeGuarnicion: false,
            usarNombreCocinaEnTablaKds: false,
            juntarGuarnicionesVisualKds: false,
            sonidoNuevaComanda: true,
            sonidoFinalizar: false,
            sonidoEntregar: true,
            timbreFinalizarClave: 'campana',
            timbreEntregarClave: 'ding_dong',
            timbreClave: 'ding_dong',
            timbreVolumen: 40,
            token: 'x',
            nested: { a: 1 },
        });
        expect(out.tamanoFuente).toBe(18);
        expect(out.mostrarBadgeGuarnicion).toBe(false);
        expect(out.usarNombreCocinaEnTablaKds).toBe(false);
        expect(out.juntarGuarnicionesVisualKds).toBe(false);
        expect(out.sonidoNuevaComanda).toBe(true);
        expect(out.sonidoFinalizar).toBe(false);
        expect(out.sonidoEntregar).toBe(true);
        expect(out.timbreFinalizarClave).toBe('campana');
        expect(out.timbreEntregarClave).toBe('ding_dong');
        expect(out.timbreClave).toBe('ding_dong');
        expect(out.timbreVolumen).toBe(40);
        expect(out.token).toBeUndefined();
        expect(out.nested).toBeUndefined();
    });
});
