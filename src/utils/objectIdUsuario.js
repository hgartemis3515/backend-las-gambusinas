'use strict';

const mongoose = require('mongoose');

/** ObjectId válido o null. Evita CastError al guardar auditoría con usuarioId "admin". */
function objectIdUsuarioOrNull(usuarioId) {
  if (!usuarioId) return null;
  if (usuarioId instanceof mongoose.Types.ObjectId) return usuarioId;
  const s = String(usuarioId._id || usuarioId);
  if (/^[a-fA-F0-9]{24}$/.test(s) && mongoose.Types.ObjectId.isValid(s)) {
    return new mongoose.Types.ObjectId(s);
  }
  return null;
}

module.exports = { objectIdUsuarioOrNull };
