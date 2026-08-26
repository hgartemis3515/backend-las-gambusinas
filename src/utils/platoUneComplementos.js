/**
 * Complementos unidos al plato principal (sabores, no guarnición aparte).
 * True si el snapshot de la línea O el catálogo populado lo marca.
 * El catálogo gana sobre snapshot false para que activar el flag en el menú
 * aplique a tickets ya abiertos (p. ej. pachamanca 1 sabor).
 */
function platoUneComplementos(plato) {
    if (!plato) return false;
    if (plato.complementosUnidosAlPlato === true) return true;
    const cat = plato.plato;
    return !!(cat && typeof cat === 'object' && cat.complementosUnidosAlPlato === true);
}

module.exports = { platoUneComplementos };
