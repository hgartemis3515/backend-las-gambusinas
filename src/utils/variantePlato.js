/**
 * Variante de plato:
 *  - MIX (`esVariantePlato`): las opciones (TÉ / CAFÉ) REEMPLAZAN el nombre en cocina.
 *  - Variación de nombre (`anexarVarianteAlNombre`): la opción se ANEXA
 *    (Pollo leña + Pierna → Pollo leña Pierna). No es guarnición KDS.
 */

const MAX_NOMBRE_COCINA_PEDIDO = 80;

function claveGrupo(v) {
  return String(v || '').trim().toLowerCase();
}

function grupoEsVariantePlato(grupo) {
  return !!(grupo && grupo.esVariantePlato === true);
}

function grupoAnexaNombre(grupo) {
  return !!(grupo && grupo.anexarVarianteAlNombre === true && !grupoEsVariantePlato(grupo));
}

function grupoDefineNombreCocina(grupo) {
  return grupoEsVariantePlato(grupo) || grupoAnexaNombre(grupo);
}

function gruposVarianteDeCatalogo(catalogo) {
  return (catalogo?.complementos || []).filter(grupoDefineNombreCocina);
}

function grupoOpCantidades(grupo) {
  return grupoAnexaNombre(grupo) && grupo?.modoSeleccion === 'cantidades';
}

function enteroEnRango(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < min || i > max) return null;
  return i;
}

function saboresPorUnidadDeCatalogo(catalogo) {
  const g = (catalogo?.complementos || []).find(grupoOpCantidades);
  const fromField = enteroEnRango(g?.saboresPorUnidad, 1, 8);
  if (fromField && fromField >= 2) return fromField;
  const textos = [catalogo?.nombreCocina, catalogo?.nombre, g?.grupo];
  for (const t of textos) {
    const m = String(t || '').match(/(\d+)\s*sabou?res?\b/i);
    if (m) {
      const n = enteroEnRango(m[1], 1, 8);
      if (n) return n;
    }
  }
  const fromMin = enteroEnRango(g?.minUnidadesGrupo, 2, 8);
  if (fromMin) return fromMin;
  return fromField || 1;
}

function expandirSlotsOp(vars) {
  const slots = [];
  (Array.isArray(vars) ? vars : []).forEach((v) => {
    const q = Math.max(0, Math.min(99, Number(v?.cantidad) || 0));
    for (let i = 0; i < q; i += 1) slots.push({ ...v, cantidad: 1 });
  });
  return slots;
}

function chunkSlotsOp(slots, nSab) {
  const n = Math.max(1, Number(nSab) || 1);
  const out = [];
  for (let i = 0; i < slots.length; i += n) out.push(slots.slice(i, i + n));
  return out;
}

function textoComboSabores(slots, grupo) {
  return (slots || [])
    .map((v) => nombreCocinaDeOpcion(grupo, v?.opcion))
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' - ');
}

function nombreCocinaDeOpcion(grupo, opcionNombre) {
  const key = claveGrupo(opcionNombre);
  const op = (grupo?.opciones || []).find((o) => claveGrupo(o?.nombre) === key);
  const corto = String(op?.pronombre || '').trim();
  if (corto) return corto.slice(0, 40);
  return String(opcionNombre || '').trim().slice(0, 40);
}

function anexarSufijoNombre(base, extra) {
  const b = String(base || '').trim();
  const e = String(extra || '').trim();
  if (!e) return b.slice(0, MAX_NOMBRE_COCINA_PEDIDO);
  if (!b) return e.slice(0, MAX_NOMBRE_COCINA_PEDIDO);
  const bLow = b.toLowerCase();
  const eLow = e.toLowerCase();
  if (bLow === eLow || bLow.endsWith(` ${eLow}`)) return b.slice(0, MAX_NOMBRE_COCINA_PEDIDO);
  return `${b} ${e}`.trim().slice(0, MAX_NOMBRE_COCINA_PEDIDO);
}

function nombreBaseCocina(catalogo, linea) {
  return String(
    catalogo?.nombreCocina
    || catalogo?.nombre
    || linea?.nombreCocina
    || linea?.nombre
    || ''
  ).trim();
}

function nombrePedidoDeVariante(grupo, opcionNombre, catalogo, linea) {
  const extra = nombreCocinaDeOpcion(grupo, opcionNombre);
  if (grupoAnexaNombre(grupo)) {
    return anexarSufijoNombre(nombreBaseCocina(catalogo, linea), extra);
  }
  return extra.slice(0, MAX_NOMBRE_COCINA_PEDIDO);
}

function catalogoDesdeMapa(platoLinea, platosMap) {
  if (!platosMap || typeof platosMap.get !== 'function') return null;
  const platoRef = platoLinea?.plato ?? platoLinea?.platoId;
  if (platoRef == null || platoRef === '') return null;
  return platosMap.get(String(platoRef))
    || platosMap.get(Number(platoRef))
    || null;
}

function aplicarVarianteEnLinea(linea, varianteSel, grupo, catalogo) {
  const extra = nombreCocinaDeOpcion(grupo, varianteSel.opcion);
  const nombre = nombrePedidoDeVariante(grupo, varianteSel.opcion, catalogo, linea);
  const keys = new Set([claveGrupo(grupo?.grupo)]);
  const comps = Array.isArray(linea.complementosSeleccionados) ? linea.complementosSeleccionados : [];
  const garnishes = comps.filter((c) => !keys.has(claveGrupo(c.grupo)));
  return {
    ...linea,
    complementosSeleccionados: [...garnishes, { ...varianteSel, cantidad: 1 }],
    nombreCocinaPedido: nombre,
    variantePlato: {
      grupo: String(varianteSel.grupo || grupo?.grupo || '').trim(),
      opcion: String(varianteSel.opcion || '').trim(),
      pronombre: extra,
      anexaNombre: grupoAnexaNombre(grupo),
    },
  };
}

/** Una sola opción MIX: usa max(cantidad línea, cantidad de la opción). */
function cantidadParteVariante(varianteSel, nLinea) {
  const q = Math.max(1, Number(varianteSel?.cantidad) || 1);
  const n = Math.max(1, Number(nLinea) || 1);
  return Math.max(n, q);
}

/**
 * Parte una línea de comanda si el catálogo tiene grupo MIX o variación de nombre
 * y hay varias opciones con cantidad. Si hay una sola, anota el nombre de cocina.
 */
function aplicarComboOpEnLinea(linea, chunk, grupo, catalogo) {
  const extra = textoComboSabores(chunk, grupo);
  const nombre = anexarSufijoNombre(nombreBaseCocina(catalogo, linea), extra);
  const keys = new Set([claveGrupo(grupo?.grupo)]);
  const comps = Array.isArray(linea.complementosSeleccionados) ? linea.complementosSeleccionados : [];
  const garnishes = comps.filter((c) => !keys.has(claveGrupo(c.grupo)));
  const compsOp = chunk.map((v) => ({
    ...v,
    cantidad: 1,
    pronombre: nombreCocinaDeOpcion(grupo, v.opcion),
  }));
  return {
    ...linea,
    complementosSeleccionados: [...garnishes, ...compsOp],
    nombreCocinaPedido: nombre,
    variantePlato: {
      grupo: String(grupo?.grupo || '').trim(),
      opcion: extra,
      pronombre: extra,
      anexaNombre: true,
    },
  };
}

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
  const grupoOp = gruposVar.find(grupoOpCantidades);

  if (grupoOp) {
    const opVars = vars.filter((v) => claveGrupo(v.grupo) === claveGrupo(grupoOp.grupo));
    const slots = expandirSlotsOp(opVars);
    const nSab = saboresPorUnidadDeCatalogo(catalogo);
    const merge = (partes) => {
      const merged = [];
      partes.forEach((p) => {
        const last = merged[merged.length - 1];
        const same = last
          && String(last.linea?.variantePlato?.opcion || '').toLowerCase()
            === String(p.linea?.variantePlato?.opcion || '').toLowerCase();
        if (same) last.cantidad += p.cantidad;
        else merged.push(p);
      });
      return merged;
    };
    if (!slots.length) return [{ linea, cantidad: n }];
    if (nSab <= 1) {
      if (opVars.length === 1 && (Number(opVars[0].cantidad) || 1) === 1 && n > 1) {
        return [{ linea: aplicarComboOpEnLinea(linea, slots, grupoOp, catalogo), cantidad: n }];
      }
      return merge(opVars.map((v) => ({
        linea: aplicarComboOpEnLinea(linea, [{ ...v, cantidad: 1 }], grupoOp, catalogo),
        cantidad: Math.max(1, Number(v.cantidad) || 1),
      })));
    }
    if (slots.length % nSab !== 0) {
      return [{ linea: aplicarComboOpEnLinea(linea, slots, grupoOp, catalogo), cantidad: 1 }];
    }
    const chunks = chunkSlotsOp(slots, nSab);
    if (chunks.length === 1) {
      return [{ linea: aplicarComboOpEnLinea(linea, chunks[0], grupoOp, catalogo), cantidad: n }];
    }
    return merge(chunks.map((ch) => ({
      linea: aplicarComboOpEnLinea(linea, ch, grupoOp, catalogo),
      cantidad: 1,
    })));
  }

  if (vars.length === 1) {
    const grupo = resolverGrupo(vars[0]);
    return [{
      linea: aplicarVarianteEnLinea(linea, vars[0], grupo, catalogo),
      cantidad: grupoAnexaNombre(grupo)
        ? n
        : cantidadParteVariante(vars[0], n),
    }];
  }

  return vars.map((v) => ({
    linea: aplicarVarianteEnLinea(linea, v, resolverGrupo(v), catalogo),
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
    platoLinea.nombreCocinaPedido = existente.slice(0, MAX_NOMBRE_COCINA_PEDIDO);
    return platoLinea.nombreCocinaPedido;
  }
  const gruposVar = gruposVarianteDeCatalogo(catalogo);
  if (!gruposVar.length) return '';
  const keys = new Set(gruposVar.map((g) => claveGrupo(g.grupo)));
  const vars = (platoLinea.complementosSeleccionados || []).filter((c) => keys.has(claveGrupo(c.grupo)));
  if (!vars.length) return '';
  const grupoOp = gruposVar.find(grupoOpCantidades);
  if (grupoOp && vars.length > 1) {
    const slots = expandirSlotsOp(vars.filter((v) => claveGrupo(v.grupo) === claveGrupo(grupoOp.grupo)));
    const extra = textoComboSabores(slots, grupoOp);
    const nombre = anexarSufijoNombre(nombreBaseCocina(catalogo, platoLinea), extra);
    platoLinea.nombreCocinaPedido = nombre;
    platoLinea.variantePlato = {
      grupo: String(grupoOp.grupo || '').trim(),
      opcion: extra,
      pronombre: extra,
      anexaNombre: true,
    };
    return nombre;
  }
  if (vars.length !== 1) return '';
  const grupo = gruposVar.find((g) => claveGrupo(g.grupo) === claveGrupo(vars[0].grupo)) || gruposVar[0];
  const extra = nombreCocinaDeOpcion(grupo, vars[0].opcion);
  const nombre = nombrePedidoDeVariante(grupo, vars[0].opcion, catalogo, platoLinea);
  platoLinea.nombreCocinaPedido = nombre;
  platoLinea.variantePlato = {
    grupo: String(vars[0].grupo || grupo.grupo || '').trim(),
    opcion: String(vars[0].opcion || '').trim(),
    pronombre: extra,
    anexaNombre: grupoAnexaNombre(grupo),
  };
  return nombre;
}

module.exports = {
  MAX_NOMBRE_COCINA_PEDIDO,
  claveGrupo,
  grupoEsVariantePlato,
  grupoAnexaNombre,
  grupoOpCantidades,
  saboresPorUnidadDeCatalogo,
  gruposVarianteDeCatalogo,
  nombreCocinaDeOpcion,
  anexarSufijoNombre,
  nombrePedidoDeVariante,
  cantidadParteVariante,
  partirLineaPorVariante,
  expandirPlatosPorVariante,
  esComplementoVariante,
  snapshotNombreCocinaPedido,
};
