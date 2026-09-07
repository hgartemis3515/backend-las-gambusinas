function catalogoDeLinea(plato) {
    const cat = plato && plato.plato;
    return cat && typeof cat === 'object' && !Array.isArray(cat) ? cat : null;
}

function flagCatalogoOSnapshot(plato, key) {
    if (!plato) return false;
    if (plato[key] === true) return true;
    const cat = catalogoDeLinea(plato);
    return !!(cat && cat[key] === true);
}

function platoOcultaCronometroCocina(plato) {
    return flagCatalogoOSnapshot(plato, 'ocultarCronometroCocina');
}

function platoJuntaGuarnicionesEntreVariantes(plato) {
    return flagCatalogoOSnapshot(plato, 'juntarGuarnicionesEntreVariantes');
}

function snapshotFlagsCocinaPlato(dest, catalogo) {
    if (!dest || !catalogo) return dest;
    dest.complementosUnidosAlPlato = catalogo.complementosUnidosAlPlato === true;
    dest.ocultarCronometroCocina = catalogo.ocultarCronometroCocina === true;
    dest.juntarGuarnicionesEntreVariantes = catalogo.juntarGuarnicionesEntreVariantes === true;
    return dest;
}

function overlayFlagsCocinaEnPlatoLinea(platoLinea) {
    if (!platoLinea) return;
    const cat = catalogoDeLinea(platoLinea);
    if (!cat) return;
    if (cat.complementosUnidosAlPlato === true) platoLinea.complementosUnidosAlPlato = true;
    if (cat.ocultarCronometroCocina === true) platoLinea.ocultarCronometroCocina = true;
    if (cat.juntarGuarnicionesEntreVariantes === true) {
        platoLinea.juntarGuarnicionesEntreVariantes = true;
    }
}

module.exports = {
    platoOcultaCronometroCocina,
    platoJuntaGuarnicionesEntreVariantes,
    snapshotFlagsCocinaPlato,
    overlayFlagsCocinaEnPlatoLinea
};
