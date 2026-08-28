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

/** 2 truchas con la misma guarnición: al menos tantas unidades como el plato padre. */
function cantidadUnidadesGuarnicion(comp, plateQty) {
    const g = toQty(comp?.cantidad) || 1;
    const p = toQty(plateQty) || 1;
    return Math.max(g, p);
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
        $max: [
            exprCantidadLineaMongo(indexField),
            {
                $ifNull: [
                    {
                        $convert: {
                            input: '$platos.complementosSeleccionados.cantidad',
                            to: 'int',
                            onError: 1,
                            onNull: 1
                        }
                    },
                    1
                ]
            }
        ]
    };
}

module.exports = {
    cantidadUnidadesPlato,
    cantidadUnidadesGuarnicion,
    exprCantidadLineaMongo,
    exprCantidadGuarnicionMongo
};
