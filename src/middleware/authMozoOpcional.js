'use strict';

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./adminAuth');

/**
 * Decodifica el JWT de mozos/cocina/dashboard si viene.
 * Sin token, o con token inválido, la petición sigue (compatibilidad).
 * Nunca confía en el rol enviado en el body.
 */
function authMozoOpcional(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
    return next();
  }
  try {
    const decoded = jwt.verify(String(authHeader).substring(7), JWT_SECRET);
    req.usuario = {
      _id: decoded.id || decoded._id || null,
      name: decoded.name || null,
      rol: decoded.rol || null,
    };
  } catch {
    req.usuario = null;
  }
  return next();
}

module.exports = { authMozoOpcional };
