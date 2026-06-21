/**
 * Reglas de bloqueo: mozos no pueden editar/eliminar comandas o platos
 * tomados por cocina cuando mozos.permitirEditarEliminarTomadasPorCocina === false (default).
 */

const configuracionRepository = require('../repository/configuracion.repository');

const tieneCocineroAsignado = (procesandoPor) => {
    const id = procesandoPor?.cocineroId;
    if (id == null) return false;
    const str = String(id).trim();
    return str !== '' && str !== 'null' && str !== 'undefined';
};

const comandaTomadaPorCocina = (comanda) => tieneCocineroAsignado(comanda?.procesandoPor);

const platoTomadoPorCocina = (platoItem) => tieneCocineroAsignado(platoItem?.procesandoPor);

const comandaTienePlatosTomadosPorCocina = (comanda) => {
    if (!comanda?.platos || !Array.isArray(comanda.platos)) return false;
    return comanda.platos.some((p) => !p?.eliminado && platoTomadoPorCocina(p));
};

const obtenerAliasCocinero = (procesandoPor) =>
    procesandoPor?.alias || procesandoPor?.nombre || 'cocina';

/**
 * @param {Object} comanda - Documento comanda (mongoose o lean)
 * @param {Object} options
 * @param {number[]} [options.indicesPlatos] - Índices de platos afectados
 * @param {boolean} [options.forzarAdmin=false]
 * @param {boolean} [options.verificarComandaCompleta=false] - Para eliminar comanda entera
 * @returns {Promise<{ permitido: boolean, codigo?: string, message?: string, tomadoPor?: object }>}
 */
const validarEdicionMozoPermitida = async (comanda, options = {}) => {
    const {
        indicesPlatos = null,
        forzarAdmin = false,
        verificarComandaCompleta = false
    } = options;

    if (forzarAdmin) {
        return { permitido: true };
    }

    const config = await configuracionRepository.obtenerConfiguracion();
    if (config?.mozos?.permitirEditarEliminarTomadasPorCocina === true) {
        return { permitido: true };
    }

    if (!comanda) {
        return { permitido: true };
    }

    if (comandaTomadaPorCocina(comanda)) {
        return {
            permitido: false,
            codigo: 'COMANDA_TOMADA_COCINA',
            message: `No se puede modificar: la comanda está siendo preparada por ${obtenerAliasCocinero(comanda.procesandoPor)}`,
            tomadoPor: comanda.procesandoPor
        };
    }

    const indices = Array.isArray(indicesPlatos)
        ? indicesPlatos.map((i) => parseInt(i, 10)).filter((i) => !Number.isNaN(i))
        : null;

    if (indices && indices.length > 0) {
        for (const index of indices) {
            const plato = comanda.platos?.[index];
            if (plato && !plato.eliminado && platoTomadoPorCocina(plato)) {
                return {
                    permitido: false,
                    codigo: 'COMANDA_TOMADA_COCINA',
                    message: `No se puede modificar: un plato está siendo preparado por ${obtenerAliasCocinero(plato.procesandoPor)}`,
                    tomadoPor: plato.procesandoPor
                };
            }
        }
        return { permitido: true };
    }

    if (verificarComandaCompleta && comandaTienePlatosTomadosPorCocina(comanda)) {
        const platoTomado = comanda.platos.find((p) => !p?.eliminado && platoTomadoPorCocina(p));
        return {
            permitido: false,
            codigo: 'COMANDA_TOMADA_COCINA',
            message: `No se puede modificar: hay platos en preparación por ${obtenerAliasCocinero(platoTomado?.procesandoPor)}`,
            tomadoPor: platoTomado?.procesandoPor
        };
    }

    return { permitido: true };
};

const responderBloqueoCocina = (res, validacion) => {
    return res.status(409).json({
        message: validacion.message,
        codigo: validacion.codigo || 'COMANDA_TOMADA_COCINA',
        tomadoPor: validacion.tomadoPor || null
    });
};

/**
 * Valida PUT /comanda/:id (actualización completa desde app mozos).
 */
const validarActualizacionComandaMozo = async (comanda, newData, forzarAdmin = false) => {
    const checkComanda = await validarEdicionMozoPermitida(comanda, { forzarAdmin });
    if (!checkComanda.permitido) return checkComanda;

    const config = await configuracionRepository.obtenerConfiguracion();
    if (config?.mozos?.permitirEditarEliminarTomadasPorCocina === true || forzarAdmin) {
        return { permitido: true };
    }

    if (!newData?.cantidades && !newData?.platos) {
        return { permitido: true };
    }

    const indices = [];
    const len = comanda.platos?.length || 0;
    for (let i = 0; i < len; i++) {
        const plato = comanda.platos[i];
        if (!plato || plato.eliminado || !platoTomadoPorCocina(plato)) continue;

        if (newData.cantidades && newData.cantidades[i] !== undefined) {
            const nueva = newData.cantidades[i];
            const anterior = comanda.cantidades?.[i] ?? 1;
            if (nueva !== anterior) indices.push(i);
        }
        if (newData.platos) {
            indices.push(i);
        }
    }

    if (indices.length === 0) return { permitido: true };
    return validarEdicionMozoPermitida(comanda, {
        forzarAdmin,
        indicesPlatos: [...new Set(indices)]
    });
};

/**
 * Resuelve índices de platos eliminados en editar-platos (array de objetos con platoId).
 */
const resolverIndicesPlatosEliminados = (comanda, platosEliminados = []) => {
    if (!comanda?.platos || !Array.isArray(platosEliminados)) return [];
    const indices = [];

    platosEliminados.forEach((platoEliminado) => {
        const platoEliminadoId = platoEliminado?.platoId ?? platoEliminado?.plato ?? platoEliminado;
        const idStr = platoEliminadoId != null ? String(platoEliminadoId) : '';

        comanda.platos.forEach((p, index) => {
            if (p.eliminado) return;
            const candidatos = [
                p.platoId,
                p.plato?._id,
                p.plato
            ].filter((v) => v != null).map((v) => String(v));

            if (idStr && candidatos.includes(idStr)) {
                indices.push(index);
            }
        });
    });

    return [...new Set(indices)];
};

module.exports = {
    tieneCocineroAsignado,
    comandaTomadaPorCocina,
    platoTomadoPorCocina,
    comandaTienePlatosTomadosPorCocina,
    validarEdicionMozoPermitida,
    validarActualizacionComandaMozo,
    resolverIndicesPlatosEliminados,
    responderBloqueoCocina
};
