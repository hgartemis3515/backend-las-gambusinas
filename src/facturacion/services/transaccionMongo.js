/**
 * Transacciones multi-documento de la emisión.
 *
 * Mongo standalone (el servicio de Windows sin `--replSet`) rechaza
 * `withTransaction` con "Transaction numbers are only allowed on a replica set
 * member or mongos". En ese caso el cobro sigue con operaciones sueltas:
 * el correlativo avanza con `$inc` atómico y el índice único evita duplicados.
 * Un fallo después del `$inc` puede dejar un hueco de numeración.
 *
 * @module facturacion/services/transaccionMongo
 */

const mongoose = require('mongoose');

let cacheSoporta = null;
let avisoStandalone = false;

/** @param {Error & {errmsg?: string}} err */
function errorSinReplicaSet(err) {
    const msg = `${err?.message || ''} ${err?.errmsg || ''}`;
    return /Transaction numbers are only allowed on a replica set member or mongos/i.test(msg);
}

async function soportaTransacciones() {
    if (cacheSoporta !== null) return cacheSoporta;
    try {
        const db = mongoose.connection?.db;
        if (!db) {
            cacheSoporta = false;
            return false;
        }
        const hello = await db.admin().command({ hello: 1 });
        cacheSoporta = Boolean(hello?.setName) || hello?.msg === 'isdbgrid';
    } catch {
        cacheSoporta = false;
    }
    if (!cacheSoporta) avisarStandalone();
    return cacheSoporta;
}

function avisarStandalone() {
    if (avisoStandalone || process.env.NODE_ENV === 'test') return;
    avisoStandalone = true;
    console.warn('[facturacion] MongoDB no es un replica set. Los comprobantes se emiten sin transacción. Para numeración atómica: mongod --replSet rs0 y DBLOCAL con ?replicaSet=rs0');
}

/**
 * @template T
 * @param {(session: import('mongoose').ClientSession|null) => Promise<T>} fn
 * @param {{ iniciarSesion?: () => Promise<import('mongoose').ClientSession> }} [opciones]
 * Sesión inyectada (tests) siempre usa transacción. Sin ella, se detecta el replica set.
 * @returns {Promise<T>}
 */
async function ejecutarEnTransaccion(fn, { iniciarSesion } = {}) {
    if (typeof iniciarSesion === 'function') {
        return correrConSesion(fn, iniciarSesion);
    }
    if (!(await soportaTransacciones())) {
        return fn(null);
    }
    try {
        return await correrConSesion(fn, () => mongoose.startSession());
    } catch (err) {
        if (!errorSinReplicaSet(err)) throw err;
        cacheSoporta = false;
        avisarStandalone();
        return fn(null);
    }
}

/**
 * @template T
 * @param {(session: import('mongoose').ClientSession) => Promise<T>} fn
 * @param {() => Promise<import('mongoose').ClientSession>} iniciarSesion
 */
async function correrConSesion(fn, iniciarSesion) {
    const session = await iniciarSesion();
    try {
        let valor;
        await session.withTransaction(async () => {
            valor = await fn(session);
        });
        return valor;
    } finally {
        if (session && typeof session.endSession === 'function') {
            await session.endSession();
        }
    }
}

module.exports = { ejecutarEnTransaccion, soportaTransacciones, errorSinReplicaSet };
