/**
 * Cupos y cola de asignación automática (platos + guarniciones).
 * Serializa ráfagas de comandas para que los contadores en curso no se pisen.
 */

function topePositivo(valor, fallback) {
    const n = Number(valor);
    if (Number.isFinite(n) && n > 0) return n;
    const f = Number(fallback);
    return Number.isFinite(f) && f > 0 ? f : null;
}

function bumpCargaCache(cache, cocineroId, n = 1) {
    if (!cache || !cocineroId || !Number.isFinite(n) || n <= 0) return;
    const k = String(cocineroId);
    if (cache[k] !== undefined) cache[k] += n;
}

/**
 * Una sola vez: factory 5/10 (platos) o 6/12 (guarniciones) → 20/40.
 * Si el local ya cambió esos números, solo marca el flag y no los pisa.
 */
async function migrarCuposFactoryV3(model, configId, config, spec) {
    if (!config || config.cuposDefaultV3 === true) return config;
    const patch = { cuposDefaultV3: true };
    let cambioValores = false;
    if (config.defaults?.[spec.mismoKey] === spec.mismoOld) {
        patch[`defaults.${spec.mismoKey}`] = spec.mismoNew;
        cambioValores = true;
    }
    if (config.defaults?.[spec.totalKey] === spec.totalOld) {
        patch[`defaults.${spec.totalKey}`] = spec.totalNew;
        cambioValores = true;
    }
    const updated = await model.findOneAndUpdate(
        { _id: configId, cuposDefaultV3: { $ne: true } },
        { $set: patch },
        { new: true }
    );
    if (updated) {
        if (cambioValores) console.log(spec.log);
        return updated;
    }
    return config;
}

let cola = Promise.resolve();

function encolarAsignacionKds(fn) {
    const run = cola.then(() => fn(), () => fn());
    cola = run.then(() => undefined, () => undefined);
    return run;
}

module.exports = {
    topePositivo,
    bumpCargaCache,
    migrarCuposFactoryV3,
    encolarAsignacionKds
};
