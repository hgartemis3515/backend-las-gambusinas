/**
 * Variante de plato (MIX): un grupo de complementos define el nombre en cocina.
 * Ej: MIX x5 con 3 TÉ + 2 CAFÉ → dos líneas (TÉ x3, CAFÉ x2), cada una con las
 * guarniciones del plato. Las opciones de ese grupo no son unidades KDS de guarnición.
 */

function claveGrupo(v) {
  return String(v || '').trim().toLowerCase();
}

function gruposVarianteDeCatalogo(catalogo) {
  return (catalogo?.complementos || []).filter((g) => g && g.esVariantePlato === true);
}

function nombreCocinaDeOpcion(grupo, opcionNombre) {
  const key = claveGrupo(opcionNombre);
  const op = (grupo?.opciones || []).find((o) => claveGrupo(o?.nombre) === key);
  const corto = String(op?.pronombre || '').trim();
  if (corto) return corto.slice(0, 40);
  return String(opcionNombre || '').trim().slice(0, 40);
}

function catalogoDesdeMapa(platoLinea, platosMap) {
  if (!platosMap || typeof platosMap.get !== 'function') return null;
  const platoRef = platoLinea?.plato ?? platoLinea?.platoId;
  if (platoRef == null || platoRef === '') return null;
  return platosMap.get(String(platoRef))
    || platosMap.get(Number(platoRef))
    || null;
}

function aplicarVarianteEnLinea(linea, varianteSel, grupo) {
  const nombre = nombreCocinaDeOpcion(grupo, varianteSel.opcion);
  const keys = new Set(gruposVarianteDeCatalogo({ complementos: [grupo] }).map((g) => claveGrupo(g.grupo)));
  const comps = Array.isArray(linea.complementosSeleccionados) ? linea.complementosSeleccionados : [];
  const garnishes = comps.filter((c) => !keys.has(claveGrupo(c.grupo)));
  return {
    ...linea,
    complementosSeleccionados: [...garnishes, { ...varianteSel, cantidad: 1 }],
    nombreCocinaPedido: String(linea.nombreCocinaPedido || nombre).trim().slice(0, 40),
    variantePlato: {
      grupo: String(varianteSel.grupo || grupo?.grupo || '').trim(),
      opcion: String(varianteSel.opcion || '').trim(),
      pronombre: nombre,
    },
  };
}

/**
 * Parte una línea de comanda si el catálogo tiene grupo esVariantePlato y hay
 * varias opciones con cantidad. Si hay una sola, solo anota el nombre de cocina.
 */
function partirLineaPorVariante(platoLinea, catalogo, cantidadLinea) {
  const n = Math.max(1, Number(cantidadLinea) || 1);
  const linea = platoLinea && typeof platoLinea === 'object' ? { ...platoLinea } : {};
  const gruposVar = gruposVarianteDeCatalogo(catalogo);
  if (!gruposVar.length) return [{ linea, cantidad: n }];

  const keys = new Set(gruposVar.map((g) => claveGrupo(g.grupo)));
  const comps = Array.isArray(linea.complementosSeleccionados) ? linea.complementosSeleccionados : [];
  const vars = comps.filter((c) => keys.has(claveGrupo(c.grupo)) && (Number(c.cantidad) || 1) > 0);

  if (!vars.length) return [{ linea, cantidad: n }];

  const resolverGrupo = (v) => gruposVar.find((g) => claveGrupo(g.grupo) === claveGrupo(v.grupo)) || gruposVar[0];

  if (vars.length === 1) {
    return [{ linea: aplicarVarianteEnLinea(linea, vars[0], resolverGrupo(vars[0])), cantidad: n }];
  }

  return vars.map((v) => ({
    linea: aplicarVarianteEnLinea(linea, v, resolverGrupo(v)),
    cantidad: Math.max(1, Number(v.cantidad) || 1),
  }));
}

function expandirPlatosPorVariante(platos, cantidades, platosMap) {
  const lista = Array.isArray(platos) ? platos : [];
  const cants = Array.isArray(cantidades) ? cantidades : lista.map(() => 1);
  const outP = [];
  const outC = [];
  lista.forEach((plato, i) => {
    const n = cants[i] != null ? cants[i] : 1;
    const catalogo = catalogoDesdeMapa(plato, platosMap);
    const partes = partirLineaPorVariante(plato, catalogo, n);
    partes.forEach((p) => {
      outP.push(p.linea);
      outC.push(p.cantidad);
    });
  });
  return { platos: outP, cantidades: outC };
}

function esComplementoVariante(comp, catalogo, variantePlato) {
  if (!comp) return false;
  if (variantePlato && claveGrupo(variantePlato.grupo) && claveGrupo(variantePlato.grupo) === claveGrupo(comp.grupo)) {
    return true;
  }
  return gruposVarianteDeCatalogo(catalogo).some((g) => claveGrupo(g.grupo) === claveGrupo(comp.grupo));
}

function snapshotNombreCocinaPedido(platoLinea, catalogo) {
  const existente = String(platoLinea?.nombreCocinaPedido || '').trim();
  if (existente) {
    platoLinea.nombreCocinaPedido = existente.slice(0, 40);
    return platoLinea.nombreCocinaPedido;
  }
  const gruposVar = gruposVarianteDeCatalogo(catalogo);
  if (!gruposVar.length) return '';
  const keys = new Set(gruposVar.map((g) => claveGrupo(g.grupo)));
  const vars = (platoLinea.complementosSeleccionados || []).filter((c) => keys.has(claveGrupo(c.grupo)));
  if (vars.length !== 1) return '';
  const grupo = gruposVar.find((g) => claveGrupo(g.grupo) === claveGrupo(vars[0].grupo)) || gruposVar[0];
  const nombre = nombreCocinaDeOpcion(grupo, vars[0].opcion);
  platoLinea.nombreCocinaPedido = nombre;
  platoLinea.variantePlato = {
    grupo: String(vars[0].grupo || grupo.grupo || '').trim(),
    opcion: String(vars[0].opcion || '').trim(),
    pronombre: nombre,
  };
  return nombre;
}

module.exports = {
  claveGrupo,
  gruposVarianteDeCatalogo,
  nombreCocinaDeOpcion,
  partirLineaPorVariante,
  expandirPlatosPorVariante,
  esComplementoVariante,
  snapshotNombreCocinaPedido,
};
