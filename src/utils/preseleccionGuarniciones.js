/**
 * Guarniciones marcadas en el catálogo (platos.html) que el mozo no eligió
 * porque eligió variación (OP) u otro flujo que no copia esos grupos.
 * No toca MIX / anexar nombre (no son guarnición KDS).
 */
const { getNombreOpcion } = require('./precioComplementos');

function claveGrupo(v) {
  return String(v || '').trim().toLowerCase();
}

function grupoNombreCocina(grupo) {
  return !!(grupo && (grupo.esVariantePlato === true || grupo.anexarVarianteAlNombre === true));
}

function grupoSeleccionFija(grupo) {
  return grupo?.seleccionFija === true && !grupoNombreCocina(grupo);
}

function opcionesAAplicarDeGrupo(grupo) {
  const ops = Array.isArray(grupo?.opciones) ? grupo.opciones : [];
  const named = ops.filter((op) => getNombreOpcion(op));
  if (grupoSeleccionFija(grupo)) {
    const marked = named.filter((op) => op && typeof op === 'object' && op.preseleccionada === true);
    return marked.length ? marked : named;
  }
  return named.filter((op) => op && typeof op === 'object' && op.preseleccionada === true);
}

function snapshotOpcionesGrupo(grupo, opciones) {
  const out = [];
  const grupoNombre = String(grupo?.grupo || '').trim();
  if (!grupoNombre) return out;
  const fija = grupoSeleccionFija(grupo);
  const modoCant = grupo.modoSeleccion === 'cantidades' || fija;
  const maxGrupoRaw = Number(grupo.maxUnidadesGrupo);
  const maxGrupo = !fija && Number.isFinite(maxGrupoRaw) && maxGrupoRaw > 0 ? maxGrupoRaw : null;
  const maxOpRaw = Number(grupo.maxUnidadesPorOpcion);
  const maxOp = !fija && Number.isFinite(maxOpRaw) && maxOpRaw > 0 ? maxOpRaw : null;
  const soloUna = !fija && !grupo.seleccionMultiple && grupo.modoSeleccion !== 'cantidades';
  let unidadesGrupo = 0;
  for (const op of opciones) {
    const nombre = getNombreOpcion(op);
    if (!nombre) continue;
    let cant = modoCant ? Number(op?.cantidadPreseleccion) : 1;
    if (!Number.isFinite(cant) || cant < 1) cant = 1;
    cant = Math.floor(cant);
    if (maxOp != null && cant > maxOp) cant = maxOp;
    if (maxGrupo != null && unidadesGrupo + cant > maxGrupo) cant = maxGrupo - unidadesGrupo;
    if (cant < 1) break;
    const precio = Number(op?.precio);
    out.push({
      grupo: grupoNombre,
      opcion: nombre,
      cantidad: cant,
      precio: Number.isFinite(precio) && precio > 0 ? precio : 0,
      pronombre: typeof op === 'object' ? String(op.pronombre || '').trim() : '',
    });
    unidadesGrupo += cant;
    if (soloUna) break;
    if (maxGrupo != null && unidadesGrupo >= maxGrupo) break;
  }
  return out;
}

function preseleccionGuarnicionesDeCatalogo(platoCompleto) {
  const out = [];
  for (const grupo of platoCompleto?.complementos || []) {
    if (grupoNombreCocina(grupo)) continue;
    out.push(...snapshotOpcionesGrupo(grupo, opcionesAAplicarDeGrupo(grupo)));
  }
  return out;
}

function gruposGuarnicionPresentes(platoCompleto, seleccionados) {
  const skip = new Set(
    (platoCompleto?.complementos || [])
      .filter(grupoNombreCocina)
      .map((g) => claveGrupo(g.grupo))
  );
  const present = new Set();
  (Array.isArray(seleccionados) ? seleccionados : []).forEach((c) => {
    const k = claveGrupo(c?.grupo);
    if (!k || skip.has(k)) return;
    present.add(k);
  });
  return present;
}

function fusionarGuarnicionesPreseleccionadas(platoCompleto, seleccionados) {
  const actuales = Array.isArray(seleccionados) ? seleccionados.filter(Boolean) : [];
  const defs = preseleccionGuarnicionesDeCatalogo(platoCompleto);
  if (!defs.length) return actuales;
  const presentes = gruposGuarnicionPresentes(platoCompleto, actuales);
  const extra = defs.filter((d) => !presentes.has(claveGrupo(d.grupo)));
  if (!extra.length) return actuales;
  return [...actuales, ...extra];
}

module.exports = {
  preseleccionGuarnicionesDeCatalogo,
  fusionarGuarnicionesPreseleccionadas,
};
