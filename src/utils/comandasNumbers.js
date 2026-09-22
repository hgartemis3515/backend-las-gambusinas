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
function formatComandasNumbersLabel(comandasNumbers) {
  const nums = resolverComandasNumbers({ comandasNumbers });
  if (nums.length === 0) return '';
  return nums.map((n) => `#${n}`).join('+');
}

/**
 * 1ª revisión: a; 2ª: B; 3ª: C … Z; luego AA.
 * @param {number} n
 * @returns {string}
 */
function letraRevisionTicket(n) {
  const k = Math.floor(Number(n) || 0);
  if (k < 1) return '';
  if (k === 1) return 'a';
  let x = k;
  let s = '';
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
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
  const nums = [...byN.keys()].sort((a, b) => a - b);
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
  const all = [...new Set([...nums, ...revByN.keys()])]
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (!all.length) return formatLetreroTicket(docs);
  return all.map((n) => `#${n}${letraRevisionTicket(revByN.get(n) || 0)}`).join('+');
}

module.exports = {
  normalizeObjectId,
  resolverComandasNumbers,
  formatComandasNumbersLabel,
  letraRevisionTicket,
  formatLetreroTicket,
  formatLetreroDesdeNumeros,
};
