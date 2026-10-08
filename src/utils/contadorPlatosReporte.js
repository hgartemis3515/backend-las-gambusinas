'use strict';

/**
 * Contador lógico de la Tabla de platos (reportes).
 * La ficha sale del catálogo de platos.html: OP, MIX, sabores de pachamanca y leña.
 * Una línea vendida no suma la misma unidad dos veces.
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function compacto(s) {
  return norm(s).replace(/\s+/g, '');
}

function nombreVisible(s) {
  return String(s || '').trim();
}

function gruposDe(plato) {
  return Array.isArray(plato && plato.complementos) ? plato.complementos : [];
}

function esParteDelPlato(grupo) {
  if (!grupo) return false;
  return grupo.esVariantePlato === true || grupo.anexarVarianteAlNombre === true;
}

/**
 * Ficha de conteo de un plato del catálogo.
 * suelto | pliegue | pachamanca | mixto-lena | chancho-lena | cuarto-lena | medio-lena | mix
 */
function fichaDePlato(plato) {
  const nombre = nombreVisible(plato && (plato.nombre || plato.nombreCocina)) || 'Plato';
  const cat = norm(plato && plato.categoria);
  const n = norm(nombre);
  const grupos = gruposDe(plato);
  const gruposParte = [];
  for (const g of grupos) {
    if (esParteDelPlato(g) && g.grupo) gruposParte.push(norm(g.grupo));
  }
  const grupoSabores = grupos.find((g) => norm(g.grupo) === 'sabores');
  const esPacha = (plato && plato.complementosUnidosAlPlato === true && !!grupoSabores)
    || n.startsWith('pachamanca');
  if (esPacha) {
    if (grupoSabores && grupoSabores.grupo) {
      const ng = norm(grupoSabores.grupo);
      if (!gruposParte.includes(ng)) gruposParte.push(ng);
    }
    return {
      tipo: 'pachamanca',
      nombre,
      gruposParte,
      grupoSabores: grupoSabores ? norm(grupoSabores.grupo) : 'sabores',
    };
  }

  const esLena = cat.includes('lena') || n.includes('lena');
  if (esLena && n.includes('mixto')) {
    return { tipo: 'mixto-lena', nombre, gruposParte };
  }
  if (esLena && n.includes('chancho') && !n.includes('mixto')) {
    return { tipo: 'chancho-lena', nombre, nombreContador: 'Chancho a la leña', gruposParte };
  }
  if (esLena && n.includes('pollo') && (n.includes('1/2') || n.includes('baby'))) {
    return { tipo: 'medio-lena', nombre, nombreContador: '1/2 pollo a la leña baby', gruposParte };
  }
  if (esLena && n.includes('pollo')) {
    return { tipo: 'cuarto-lena', nombre, nombreContador: '1/4 pollo a la leña', gruposParte };
  }

  const grupoMix = grupos.find((g) => g.esVariantePlato === true);
  if (grupoMix) {
    return { tipo: 'mix', nombre, grupoMix: norm(grupoMix.grupo), gruposParte };
  }
  if (gruposParte.length) {
    return { tipo: 'pliegue', nombre, gruposParte };
  }
  return { tipo: 'suelto', nombre, gruposParte: [] };
}

function complementosDe(linea) {
  const raw = linea && (linea.complementos || linea.complementosSeleccionados);
  return Array.isArray(raw) ? raw.filter((c) => c && !c.eliminado) : [];
}

function delGrupo(linea, grupoNorm) {
  if (!grupoNorm) return [];
  return complementosDe(linea).filter((c) => norm(c.grupo) === grupoNorm);
}

function opcionesParte(linea, ficha) {
  const parte = new Set(ficha.gruposParte || []);
  return complementosDe(linea).filter((c) => parte.has(norm(c.grupo)));
}

function saborDe(opcion) {
  const o = norm(opcion);
  if (o === 'pollo') return { bloque: 'pollos', nombre: 'Pollo de pachamanca' };
  if (o === 'cerdo') return { bloque: 'carnes', nombre: 'Cerdo de pachamanca' };
  if (o === 'res') return { bloque: 'carnes', nombre: 'Res de pachamanca' };
  if (o === 'carnero') return { bloque: 'carnes', nombre: 'Carnero de pachamanca' };
  return null;
}

function cantidadLinea(linea) {
  const n = Number(linea && linea.cantidad);
  if (Number.isFinite(n) && n > 0) return n;
  return 1;
}

function solesLinea(linea) {
  const s = Number(linea && linea.soles);
  return Number.isFinite(s) ? round2(s) : 0;
}

function repartirSoles(piezas, soles) {
  const lista = piezas || [];
  if (!lista.length) return;
  const totalQ = lista.reduce((s, p) => s + (Number(p.cantidad) || 0), 0) || lista.length;
  let usado = 0;
  lista.forEach((p, i) => {
    if (i === lista.length - 1) {
      p.soles = round2(soles - usado);
      return;
    }
    const parte = round2(soles * ((Number(p.cantidad) || 0) / totalQ));
    p.soles = parte;
    usado = round2(usado + parte);
  });
}

function pieza(base) {
  return {
    bloque: base.bloque,
    nombre: base.nombre,
    cantidad: base.cantidad,
    soles: 0,
    delMixto: base.delMixto || 0,
    cortes: base.cortes || null,
    fuentes: base.fuentes || null,
    notas: base.notas || null,
  };
}

/** Parte una línea vendida en piezas del contador. No incluye guarniciones. */
function piezasDeLinea(ficha, linea) {
  const cant = cantidadLinea(linea);
  const soles = solesLinea(linea);
  const tipo = ficha && ficha.tipo;

  if (tipo === 'pachamanca') {
    const sabores = delGrupo(linea, ficha.grupoSabores);
    const piezas = [];
    for (const s of sabores) {
      const map = saborDe(s.opcion || s.nombre);
      if (!map) continue;
      const qOp = Math.max(1, Number(s.cantidad) || 1);
      piezas.push(pieza({
        ...map,
        cantidad: qOp * cant,
        fuentes: { [ficha.nombre]: qOp * cant },
      }));
    }
    if (!piezas.length) {
      piezas.push(pieza({
        bloque: 'platos',
        nombre: 'Pachamanca sin sabor registrado',
        cantidad: cant,
        fuentes: { [ficha.nombre]: cant },
      }));
    }
    repartirSoles(piezas, soles);
    return piezas;
  }

  if (tipo === 'mixto-lena') {
    const cortes = {};
    for (const c of opcionesParte(linea, ficha)) {
      const op = nombreVisible(c.opcion || c.nombre);
      if (!op) continue;
      cortes[op] = (cortes[op] || 0) + cant;
    }
    const piezas = [
      pieza({
        bloque: 'pollos',
        nombre: '1/4 pollo a la leña',
        cantidad: cant,
        delMixto: cant,
        cortes: Object.keys(cortes).length ? cortes : null,
      }),
      pieza({
        bloque: 'carnes',
        nombre: 'Panceta de chancho leña',
        cantidad: cant,
        delMixto: cant,
      }),
    ];
    repartirSoles(piezas, soles);
    return piezas;
  }

  if (tipo === 'cuarto-lena' || tipo === 'medio-lena' || tipo === 'chancho-lena') {
    const cortes = {};
    const notas = {};
    for (const c of opcionesParte(linea, ficha)) {
      const op = nombreVisible(c.opcion || c.nombre);
      if (!op) continue;
      if (tipo === 'chancho-lena') notas[op] = (notas[op] || 0) + cant;
      else cortes[op] = (cortes[op] || 0) + cant;
    }
    const bloque = tipo === 'chancho-lena' ? 'carnes' : 'pollos';
    const piezas = [pieza({
      bloque,
      nombre: ficha.nombreContador,
      cantidad: cant,
      cortes: Object.keys(cortes).length ? cortes : null,
      notas: Object.keys(notas).length ? notas : null,
    })];
    repartirSoles(piezas, soles);
    return piezas;
  }

  if (tipo === 'mix') {
    const drinks = delGrupo(linea, ficha.grupoMix);
    const piezas = [];
    for (const d of drinks) {
      const op = nombreVisible(d.opcion || d.nombre);
      if (!op) continue;
      const qOp = Math.max(1, Number(d.cantidad) || 1);
      piezas.push(pieza({ bloque: 'platos', nombre: op, cantidad: qOp * cant }));
    }
    if (!piezas.length) {
      piezas.push(pieza({ bloque: 'platos', nombre: ficha.nombre, cantidad: cant, notas: { 'sin bebida': cant } }));
    }
    repartirSoles(piezas, soles);
    return piezas;
  }

  const piezas = [pieza({ bloque: 'platos', nombre: ficha.nombre || (linea && linea.nombre) || 'Plato', cantidad: cant })];
  repartirSoles(piezas, soles);
  return piezas;
}

function asegurarFila(map, piezaRow) {
  const key = `${piezaRow.bloque}|${norm(piezaRow.nombre)}`;
  if (!map.has(key)) {
    map.set(key, {
      bloque: piezaRow.bloque,
      nombre: piezaRow.nombre,
      cantidad: 0,
      soles: 0,
      delMixto: 0,
      cortes: {},
      fuentes: {},
      notas: {},
    });
  }
  const row = map.get(key);
  row.cantidad += Number(piezaRow.cantidad) || 0;
  row.soles = round2(row.soles + (Number(piezaRow.soles) || 0));
  row.delMixto += Number(piezaRow.delMixto) || 0;
  for (const [k, v] of Object.entries(piezaRow.cortes || {})) row.cortes[k] = (row.cortes[k] || 0) + v;
  for (const [k, v] of Object.entries(piezaRow.fuentes || {})) row.fuentes[k] = (row.fuentes[k] || 0) + v;
  for (const [k, v] of Object.entries(piezaRow.notas || {})) row.notas[k] = (row.notas[k] || 0) + v;
  return row;
}

function textoDetalle(row) {
  const bits = [];
  const cortes = Object.entries(row.cortes || {});
  if (cortes.length) bits.push(cortes.map(([k, v]) => `${k} ${v}`).join(', '));
  if (row.delMixto > 0) bits.push(`${row.delMixto} del mixto`);
  const fuentes = Object.entries(row.fuentes || {});
  if (fuentes.length) bits.push(fuentes.map(([k, v]) => `${v} de ${k}`).join(', '));
  const notas = Object.entries(row.notas || {});
  if (notas.length) bits.push(notas.map(([k, v]) => `${k} ${v}`).join(', '));
  return bits.join(' · ');
}

function filasDeMapa(map, bloque, totalSoles) {
  return [...map.values()]
    .filter((r) => r.bloque === bloque && r.cantidad > 0)
    .map((r) => ({
      bloque: r.bloque,
      nombre: r.nombre,
      cantidad: r.cantidad,
      soles: round2(r.soles),
      detalle: textoDetalle(r),
      porcentaje: totalSoles > 0 ? Math.round((r.soles / totalSoles) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es'));
}

function claveGuarnicion(opcion) {
  return compacto(opcion);
}

function etiquetaGuarnicion(prev, opcion) {
  const next = nombreVisible(opcion);
  if (!prev) return next;
  const prevSpace = /\s/.test(prev);
  const nextSpace = /\s/.test(next);
  if (!prevSpace && nextSpace) return next;
  return prev;
}

function sumarGuarniciones(linea, ficha, map) {
  const parte = new Set((ficha && ficha.gruposParte) || []);
  const cant = cantidadLinea(linea);
  const platoNom = (ficha && ficha.nombre) || (linea && linea.nombre) || 'Plato';
  for (const c of complementosDe(linea)) {
    if (parte.has(norm(c.grupo))) continue;
    const op = nombreVisible(c.opcion || c.nombre);
    if (!op) continue;
    const key = claveGuarnicion(op);
    if (!key) continue;
    const q = Math.max(1, Number(c.cantidad) || 1) * cant;
    if (!map.has(key)) {
      map.set(key, { nombre: op, cantidad: 0, grupos: new Set(), platos: new Set() });
    }
    const row = map.get(key);
    row.nombre = etiquetaGuarnicion(row.nombre, op);
    row.cantidad += q;
    const g = nombreVisible(c.grupo);
    if (g) row.grupos.add(g);
    row.platos.add(platoNom);
  }
}

function fichaParaLinea(linea, catalogoPorId) {
  const id = linea && (linea.platoId || (linea.plato && (linea.plato._id || linea.plato)));
  const cat = id != null ? catalogoPorId.get(String(id)) : null;
  if (cat) return fichaDePlato(cat);
  return fichaDePlato({
    nombre: linea && linea.nombre,
    categoria: linea && linea.categoria,
    complementos: linea && linea.complementosCatalogo,
    complementosUnidosAlPlato: linea && linea.complementosUnidosAlPlato,
  });
}

/**
 * @param {Array} lineas líneas vendidas del período
 * @param {Array} catalogo platos del catálogo (ficha)
 */
function armarContadorPlatos(lineas, catalogo) {
  const catalogoPorId = new Map();
  for (const p of catalogo || []) {
    if (p && p._id != null) catalogoPorId.set(String(p._id), p);
  }
  const piezasMap = new Map();
  const guarniMap = new Map();
  let soles = 0;

  for (const linea of lineas || []) {
    if (!linea || linea.eliminado || linea.anulado) continue;
    const ficha = fichaParaLinea(linea, catalogoPorId);
    soles = round2(soles + solesLinea(linea));
    for (const p of piezasDeLinea(ficha, linea)) asegurarFila(piezasMap, p);
    sumarGuarniciones(linea, ficha, guarniMap);
  }

  const pollos = filasDeMapa(piezasMap, 'pollos', soles);
  const carnes = filasDeMapa(piezasMap, 'carnes', soles);
  const platos = filasDeMapa(piezasMap, 'platos', soles);
  const suma = (rows) => rows.reduce((s, r) => s + r.cantidad, 0);
  const guarnicionesRaw = [...guarniMap.values()].sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es'));
  const totalG = guarnicionesRaw.reduce((s, g) => s + g.cantidad, 0);
  const guarniciones = guarnicionesRaw.map((g) => ({
    nombre: g.nombre,
    cantidad: g.cantidad,
    porcentaje: totalG > 0 ? Math.round((g.cantidad / totalG) * 1000) / 10 : 0,
    grupos: [...g.grupos],
    platos: [...g.platos],
  }));

  const graficoPlatos = [...pollos, ...carnes, ...platos]
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10)
    .map((r) => ({ nombre: r.nombre, cantidad: r.cantidad }));
  const graficoGuarniciones = guarniciones.slice(0, 10).map((g) => ({ nombre: g.nombre, cantidad: g.cantidad }));

  return {
    pollos,
    carnes,
    platos,
    resumen: {
      pollos: suma(pollos),
      carnes: suma(carnes),
      platos: suma(platos),
      soles,
      guarniciones: totalG,
    },
    guarniciones,
    graficoPlatos,
    graficoGuarniciones,
  };
}

module.exports = {
  fichaDePlato,
  piezasDeLinea,
  armarContadorPlatos,
  norm,
  compacto,
};
