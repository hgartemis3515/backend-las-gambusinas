const {
    platoOcultaCronometroCocina,
    platoJuntaGuarnicionesEntreVariantes,
    snapshotFlagsCocinaPlato,
    overlayFlagsCocinaEnPlatoLinea
} = require('../src/utils/platoFlagsCocina');

describe('platoOcultaCronometroCocina / platoJuntaGuarnicionesEntreVariantes', () => {
    test('snapshot true gana', () => {
        expect(platoOcultaCronometroCocina({
            ocultarCronometroCocina: true,
            plato: { ocultarCronometroCocina: false }
        })).toBe(true);
        expect(platoJuntaGuarnicionesEntreVariantes({
            juntarGuarnicionesEntreVariantes: true,
            plato: { juntarGuarnicionesEntreVariantes: false }
        })).toBe(true);
    });

    test('catálogo true aplica aunque el snapshot sea false', () => {
        expect(platoOcultaCronometroCocina({
            ocultarCronometroCocina: false,
            plato: { ocultarCronometroCocina: true }
        })).toBe(true);
        expect(platoJuntaGuarnicionesEntreVariantes({
            juntarGuarnicionesEntreVariantes: false,
            plato: { juntarGuarnicionesEntreVariantes: true }
        })).toBe(true);
    });

    test('sin flag → false', () => {
        expect(platoOcultaCronometroCocina({})).toBe(false);
        expect(platoJuntaGuarnicionesEntreVariantes(null)).toBe(false);
    });
});

describe('snapshot / overlay', () => {
    test('snapshot copia los tres flags del catálogo', () => {
        const dest = {};
        snapshotFlagsCocinaPlato(dest, {
            complementosUnidosAlPlato: true,
            ocultarCronometroCocina: true,
            juntarGuarnicionesEntreVariantes: true
        });
        expect(dest).toEqual({
            complementosUnidosAlPlato: true,
            ocultarCronometroCocina: true,
            juntarGuarnicionesEntreVariantes: true
        });
    });

    test('overlay marca true desde el catálogo populado', () => {
        const linea = { plato: { ocultarCronometroCocina: true, juntarGuarnicionesEntreVariantes: true } };
        overlayFlagsCocinaEnPlatoLinea(linea);
        expect(linea.ocultarCronometroCocina).toBe(true);
        expect(linea.juntarGuarnicionesEntreVariantes).toBe(true);
    });
});
