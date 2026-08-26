/**
 * Complementos unidos al plato principal (sabores, no guarnición aparte).
 * Prioridad: snapshot en la línea de comanda; si no hay boolean, catálogo populado.
 */
function platoUneComplementos(plato) {
    if (!plato) return false;
    if (plato.complementosUnidosAlPlato === true) return true;
    if (plato.complementosUnidosAlPlato === false) return false;
    const cat = plato.plato;
    return !!(cat && typeof cat === 'object' && cat.complementosUnidosAlPlato === true);
}

module.exports = { platoUneComplementos };
