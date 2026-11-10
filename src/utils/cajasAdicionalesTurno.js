'use strict';

/**
 * Tramos de caja del día operativo.
 * Día = 04:00 → primer cierre.
 * Cada caja adicional = desde que se habilita hasta que se cierra (abierta: hasta ahora).
 * Noche = el resto del día después del primer cierre, sin los tramos de cajas adicionales.
 */

function ms(d) {
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function restarIntervalos(ventana, cubiertos) {
  const ini = ms(ventana.inicio);
  const fin = ms(ventana.fin);
  if (!(fin > ini)) return [];
  const merged = [];
  const pts = (cubiertos || [])
    .map((c) => ({ a: Math.max(ini, ms(c.inicio)), b: Math.min(fin, ms(c.fin)) }))
    .filter((c) => c.b > c.a)
    .sort((x, y) => x.a - y.a);
  for (const c of pts) {
    const last = merged[merged.length - 1];
    if (!last || c.a > last.b) merged.push({ a: c.a, b: c.b });
    else last.b = Math.max(last.b, c.b);
  }
  const gaps = [];
  let cursor = ini;
  for (const c of merged) {
    if (c.a > cursor) gaps.push({ inicio: new Date(cursor), fin: new Date(c.a) });
    cursor = Math.max(cursor, c.b);
  }
  if (cursor < fin) gaps.push({ inicio: new Date(cursor), fin: new Date(fin) });
  return gaps;
}

/**
 * Ventanas que el próximo cierre debe tomar.
 * Con una caja adicional abierta, solo esa caja (como el Día).
 * Si no, los huecos del día que ningún cierre vigente cubre.
 */
function tramosPendientes({ inicioDia, now, cierres, cajaAbierta }) {
  const fin = new Date(now);
  if (cajaAbierta && cajaAbierta.habilitadaAt) {
    const inicio = new Date(cajaAbierta.habilitadaAt);
    if (ms(inicio) < ms(fin)) return [{ inicio, fin }];
  }
  const cubiertos = (cierres || [])
    .filter((c) => c && c.estado !== 'revertido' && c.periodoInicio && c.periodoFin)
    .map((c) => ({ inicio: new Date(c.periodoInicio), fin: new Date(c.periodoFin) }));
  const gaps = restarIntervalos({ inicio: inicioDia, fin }, cubiertos);
  return gaps;
}

function iso(d) {
  return new Date(d).toISOString();
}

/**
 * Chips de período. Vacío si todavía no hubo cierre de Día.
 * Orden: DIA, CAJA2, CAJA3…, NOCHE.
 */
function segmentosDia({ inicioDia, finDia, primerCierreAt, cajas, now }) {
  if (!primerCierreAt) return [];
  const corte = new Date(primerCierreAt);
  const ordenadas = [...(cajas || [])].sort((a, b) => Number(a.numero) - Number(b.numero));
  const segs = [{
    id: 'dia',
    label: 'DIA',
    desde: iso(inicioDia),
    hasta: iso(corte),
    abierto: false,
  }];
  const excluir = [];
  for (const c of ordenadas) {
    if (!c || !c.habilitadaAt || !c.numero) continue;
    const abierto = c.estado === 'abierta' && !c.cerradaAt;
    const hasta = abierto ? now : c.cerradaAt;
    if (!hasta) continue;
    const desdeIso = iso(c.habilitadaAt);
    const hastaIso = iso(hasta);
    segs.push({
      id: 'caja-' + c.numero,
      label: 'CAJA' + c.numero,
      numero: Number(c.numero),
      desde: desdeIso,
      hasta: hastaIso,
      abierto,
    });
    excluir.push({ desde: desdeIso, hasta: hastaIso, abierto });
  }
  const hayAbierta = ordenadas.some((c) => c && c.estado === 'abierta' && !c.cerradaAt);
  segs.push({
    id: 'noche',
    label: 'NOCHE',
    desde: iso(corte),
    hasta: iso(finDia),
    abierto: !hayAbierta,
    excluir,
  });
  return segs;
}

function periodoActivo({ hayCierre, cajaAbierta }) {
  if (!hayCierre) return 'hoy';
  if (cajaAbierta && cajaAbierta.numero) return 'caja-' + cajaAbierta.numero;
  return 'noche';
}

function siguienteNumero(cajas) {
  const max = (cajas || []).reduce((m, c) => Math.max(m, Number(c.numero) || 0), 1);
  return max + 1;
}

module.exports = {
  restarIntervalos,
  tramosPendientes,
  segmentosDia,
  periodoActivo,
  siguienteNumero,
};
