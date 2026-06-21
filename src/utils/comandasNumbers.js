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

module.exports = {
  normalizeObjectId,
  resolverComandasNumbers,
  formatComandasNumbersLabel,
};
