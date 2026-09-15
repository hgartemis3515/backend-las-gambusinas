/**
 * Campos de catálogo que cocina (KDS / Ver Cocina) necesita al popular `platos.plato`.
 * Incluye `nombreCocina` (alias de platos.html). Un select sin ese campo hace que
 * los platos para llevar (que suelen entrar por comanda-actualizada de PPA)
 * se pinten con el nombre de carta.
 */
const SELECT_PLATO_COCINA =
  'nombre precio categoria codigo nombreCocina tipo tipos complementos complementosUnidosAlPlato ocultarCronometroCocina juntarGuarnicionesEntreVariantes kdsEstiloCompacto requiereNumeroSerie';

module.exports = { SELECT_PLATO_COCINA };
