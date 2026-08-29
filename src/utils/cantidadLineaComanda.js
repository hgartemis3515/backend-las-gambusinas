/**
 * Unidades de una línea de comanda. Misma fuente que Ver Cocina Completo:
 * `comanda.cantidades[platoIndex]` (fallback `plato.cantidad`).
 */
function toQty(n) {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function cantidadUnidadesPlato(comanda, platoIndex, plato) {
    if (
        platoIndex >= 0 &&
        Array.isArray(comanda?.cantidades) &&
        comanda.cantidades[platoIndex] != null
    ) {
        const n = toQty(comanda.cantidades[platoIndex]);
        if (n > 0) return n;
    }
    const fallback = toQty(plato?.cantidad);
    return fallback > 0 ? fallback : 1;
}

/** 2 pan por plato × 3 platos = 6 pan. */
function cantidadUnidadesGuarnicion(comp, plateQty) {
    const g = toQty(comp?.cantidad) || 1;
    const p = toQty(plateQty) || 1;
    return g * p;
}

function exprCantidadLineaMongo(indexField = '$platoIndex', platoCantField = '$platos.cantidad') {
    return {
        $let: {
            vars: {
                qArr: {
                    $convert: {
                        input: { $arrayElemAt: ['$cantidades', indexField] },
                        to: 'double',
                        onError: 0,
                        onNull: 0
                    }
                },
                qPlato: {
                    $convert: {
                        input: platoCantField,
                        to: 'double',
                        onError: 0,
                        onNull: 0
                    }
                }
            },
            in: {
                $toInt: {
                    $floor: {
                        $cond: [
                            { $gt: ['$$qArr', 0] },
                            '$$qArr',
                            { $cond: [{ $gt: ['$$qPlato', 0] }, '$$qPlato', 1] }
                        ]
                    }
                }
            }
        }
    };
}

function exprCantidadGuarnicionMongo(indexField = '$platoIndex') {
    return {
        $toInt: {
            $multiply: [
                {
                    $let: {
                        vars: {
                            g: {
                                $convert: {
                                    input: '$platos.complementosSeleccionados.cantidad',
                                    to: 'double',
                                    onError: 1,
                                    onNull: 1
                                }
                            }
                        },
                        in: {
                            $cond: [
                                { $gt: ['$$g', 0] },
                                { $floor: '$$g' },
                                1
                            ]
                        }
                    }
                },
                exprCantidadLineaMongo(indexField)
            ]
        }
    };
}

module.exports = {
    cantidadUnidadesPlato,
    cantidadUnidadesGuarnicion,
    exprCantidadLineaMongo,
    exprCantidadGuarnicionMongo
};
