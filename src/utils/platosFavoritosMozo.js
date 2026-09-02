const mongoose = require('mongoose');

const MAX_FAVORITOS = 300;

function sanitizePlatosFavoritos(arr) {
  const seen = new Set();
  const out = [];
  for (const x of Array.isArray(arr) ? arr : []) {
    const id = String(x && x._id ? x._id : x);
    if (!mongoose.Types.ObjectId.isValid(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_FAVORITOS) break;
  }
  return out;
}

module.exports = { sanitizePlatosFavoritos, MAX_FAVORITOS };
