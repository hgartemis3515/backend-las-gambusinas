/**
 * Utilidades para numeración agrupada de comandas (#81+#82).
 */

/**
 * Normaliza un ObjectId / referencia a string hex de 24 chars.
 * @param {*} val
 * @returns {string|null}
 */
function normalizeObjectId(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'object') {
    if (val.$oid) return String(val.$oid);
    if (val._id != null) return normalizeObjectId(val._id);
    if (typeof val.toString === 'function') {
      const s = val.toString();
      if (/^[a-f0-9]{24}$/i.test(s)) return s;
    }
  }
  const s = String(val).trim();
  return /^[a-f0-9]{24}$/i.test(s) ? s : (s || null);
}

/**
 * Une comandasNumbers explícitos + comandaNumber en platos (snapshot de tickets).
 * @param {object} opts
 * @param {Array<number|string>} [opts.comandasNumbers]
 * @param {Array<{comandaNumber?: number|string}>} [opts.platos]
 * @returns {number[]}
 */
function resolverComandasNumbers({ comandasNumbers = [], platos = [] } = {}) {
  const set = new Set();
  for (const n of comandasNumbers || []) {
    if (n == null || n === '') continue;
    const num = Number(n);
    if (!Number.isNaN(num)) set.add(num);
  }
  for (const p of platos || []) {
    if (p?.comandaNumber == null || p.comandaNumber === '') continue;
    const num = Number(p.comandaNumber);
    if (!Number.isNaN(num)) set.add(num);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Etiqueta visible: #12 o #12+#13
 * @param {Array<number|string>} comandasNumbers
 * @returns {string}
 */
/** Última comanda (mayor número) primero; el resto de mayor a menor. */
function ordenarNumerosLetrero(nums) {
  const list = [...nums].filter((n) => Number.isFinite(n));
  if (list.length <= 1) return list;
  const max = Math.max(...list);
  return [max, ...list.filter((n) => n !== max).sort((a, b) => b - a)];
}

function formatComandasNumbersLabel(comandasNumbers) {
  const nums = ordenarNumerosLetrero(resolverComandasNumbers({ comandasNumbers }));
  if (nums.length === 0) return '';
  return nums.map((n) => `#${n}`).join('+');
}

/**
 * 1ª revisión: b; 2ª: c; 3ª: d … z; luego aa.
 * @param {number} n
 * @returns {string}
 */
function letraRevisionTicket(n) {
  const k = Math.floor(Number(n) || 0);
  if (k < 1) return '';
  let x = k + 1;
  let s = '';
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(97 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function numeroVisibleComanda(c) {
  if (!c) return null;
  const dia = c.numeroComandaDia;
  if (dia != null && dia !== '' && Number.isFinite(Number(dia))) return Number(dia);
  if (c.comandaNumber != null && c.comandaNumber !== '') return Number(c.comandaNumber);
  return null;
}

/**
 * Letrero de ticket: #10+#11a, #10B, etc.
 * @param {Array<{numeroComandaDia?:*, comandaNumber?:*, revisionTicket?:*}>} comandas
 */
function formatLetreroTicket(comandas) {
  const parts = (Array.isArray(comandas) ? comandas : [])
    .map((c) => ({
      n: numeroVisibleComanda(c),
      rev: Math.max(0, Math.floor(Number(c?.revisionTicket) || 0)),
    }))
    .filter((x) => x.n != null && Number.isFinite(x.n));
  const byN = new Map();
  for (const p of parts) {
    const prev = byN.get(p.n);
    if (!prev || p.rev > prev) byN.set(p.n, p.rev);
  }
  const nums = ordenarNumerosLetrero([...byN.keys()]);
  if (!nums.length) return '';
  return nums.map((n) => `#${n}${letraRevisionTicket(byN.get(n))}`).join('+');
}

/** Une números del grupo con las letras de las comandas que sí están cargadas. */
function formatLetreroDesdeNumeros(comandasNumbers, comandas = []) {
  const nums = resolverComandasNumbers({ comandasNumbers });
  const docs = Array.isArray(comandas) ? comandas : [];
  const revByN = new Map();
  for (const c of docs) {
    const n = numeroVisibleComanda(c);
    if (n == null || !Number.isFinite(n)) continue;
    revByN.set(n, Math.max(revByN.get(n) || 0, Math.floor(Number(c.revisionTicket) || 0)));
  }
  const all = ordenarNumerosLetrero([...new Set([...nums, ...revByN.keys()])]
    .filter((n) => Number.isFinite(n)));
  if (!all.length) return formatLetreroTicket(docs);
  return all.map((n) => `#${n}${letraRevisionTicket(revByN.get(n) || 0)}`).join('+');
}

function ticketAnulacionPayload(comanda, extras = {}) {
  const moment = require('moment-timezone');
  const cuando = extras.hora || comanda?.fechaEliminacion || new Date();
  return {
    letrero: formatLetreroTicket([comanda]) || '#—',
    usuario: extras.usuario || '—',
    hora: moment(cuando).tz('America/Lima').format('DD/MM/YYYY HH:mm'),
    motivo: extras.motivo || comanda?.motivoEliminacion || '',
  };
}

module.exports = {
  normalizeObjectId,
  resolverComandasNumbers,
  formatComandasNumbersLabel,
  letraRevisionTicket,
  formatLetreroTicket,
  formatLetreroDesdeNumeros,
  ticketAnulacionPayload,
};
