/**
 * Motor tributario para comprobantes de restaurante (UBL 2.1 / SUNAT).
 *
 * Todo cálculo interno usa enteros: céntimos para importes, milésimas para
 * cantidades y puntos básicos (1 % = 100 bp) para tasas. Los totales del
 * comprobante son la suma exacta de las líneas ya redondeadas.
 *
 * @module facturacion/services/motorTributario
 */

const {
    TIPO_DOCUMENTO,
    AFECTACION_IGV,
    AFECTACIONES_GRATUITAS,
    AFECTACIONES_GRATUITAS_GRAVADAS,
    TIPO_PRECIO,
    LEYENDA,
    TEXTO_LEYENDA_1002,
    CARGO_DESCUENTO,
    MEDIO_PAGO_SUNAT,
    FORMA_PAGO,
} = require('../constants/catalogosSunat');
const { aEscalado, aCentimos, dividirRedondeo, aSoles, prorratear } = require('../utils/dinero');
const { numeroALetras } = require('../utils/numeroALetras');

const BP_100 = 10000;

/**
 * @typedef {Object} ItemEntrada
 * @property {string} [codigo]
 * @property {string} descripcion
 * @property {string} [unidad='NIU']            Catálogo 03 (NIU bienes, ZZ servicios)
 * @property {number|string} cantidad
 * @property {number|string} precioUnitario      Con IGV si `preciosIncluyenIGV`; en cortesías = valor referencial
 * @property {string} [tipoAfectacionIgv='10']   Catálogo 07
 * @property {boolean} [cortesia=false]          Cortesía al 100 % → operación gratuita
 * @property {{porcentaje?: number|string, monto?: number|string}} [descuento] Descuento por ítem (Cat. 53 código 00)
 */

/**
 * @typedef {Object} CargoEntrada
 * @property {'recargo_consumo'|'propina'} tipo
 * @property {number|string} [porcentaje]  Sobre el consumo neto
 * @property {number|string} [monto]
 * @property {string} [motivo]
 */

/**
 * @typedef {Object} FormaPagoEntrada
 * @property {'Contado'|'Credito'} tipo
 * @property {{monto: number|string, fechaVencimiento: string|Date}[]} [cuotas]
 */

/**
 * @typedef {Object} ConfigTributaria
 * @property {number|string} [tasaIgv=18]                 Porcentaje (18, o tasa especial restaurantes)
 * @property {boolean} [preciosIncluyenIGV=true]
 * @property {string} [afectacionCortesia='15']           Afectación gravada gratuita usada por defecto
 * @property {string|Date} [fechaEmision]                 Para validar vencimiento de cuotas
 */

/**
 * @typedef {Object} EntradaCalculo
 * @property {'01'|'03'|'07'} tipoComprobante
 * @property {ItemEntrada[]} items
 * @property {{porcentaje?: number|string, monto?: number|string}} [descuentoGlobal] Cat. 53 código 02, monto con IGV
 * @property {CargoEntrada[]} [cargos]
 * @property {FormaPagoEntrada} [formaPago]
 * @property {{medio: string, monto: number|string}[]} [pagos]
 * @property {ConfigTributaria} [config]
 */

class ErrorTributario extends Error {
    /** @param {string} mensaje @param {string} [codigo] */
    constructor(mensaje, codigo = 'VALIDACION_TRIBUTARIA') {
        super(mensaje);
        this.name = 'ErrorTributario';
        this.codigo = codigo;
        this.statusCode = 422;
    }
}

/** @param {number} cent @param {number} bp @returns {number} */
const quitarIgv = (cent, bp) => dividirRedondeo(cent * BP_100, BP_100 + bp);
/** @param {number} cent @param {number} bp @returns {number} */
const aplicarPct = (cent, bp) => dividirRedondeo(cent * bp, BP_100);

/**
 * Mapea un medio de pago interno al Catálogo 59.
 * @param {string} medio
 * @returns {string}
 */
function mapearMedioPago(medio) {
    const codigo = MEDIO_PAGO_SUNAT[String(medio || '').toLowerCase()];
    if (!codigo) throw new ErrorTributario(`Medio de pago no soportado: ${medio}`, 'MEDIO_PAGO');
    return codigo;
}

/**
 * Calcula una línea en céntimos.
 * @param {ItemEntrada} item
 * @param {number} indice
 * @param {{bp: number, incluyeIgv: boolean, afectacionCortesia: string}} ctx
 */
function calcularLinea(item, indice, ctx) {
    if (!item || !item.descripcion) throw new ErrorTributario(`Ítem ${indice + 1}: descripción requerida`);
    const cantMil = aEscalado(item.cantidad, 3);
    if (cantMil <= 0) throw new ErrorTributario(`Ítem ${indice + 1}: cantidad debe ser > 0`);
    const precioUnitCent = aCentimos(item.precioUnitario);
    if (precioUnitCent < 0) throw new ErrorTributario(`Ítem ${indice + 1}: precio negativo`);

    let afectacion = String(item.tipoAfectacionIgv || AFECTACION_IGV.GRAVADO_ONEROSA);
    if (item.cortesia) {
        if (afectacion === AFECTACION_IGV.GRAVADO_ONEROSA) afectacion = ctx.afectacionCortesia;
        else if (afectacion === AFECTACION_IGV.EXONERADO_ONEROSA) afectacion = AFECTACION_IGV.EXONERADO_GRATUITA;
        else if (afectacion === AFECTACION_IGV.INAFECTO_ONEROSA) afectacion = AFECTACION_IGV.INAFECTO_RETIRO_BONIFICACION;
    }
    const gratuita = AFECTACIONES_GRATUITAS.includes(afectacion);
    const gravada = afectacion === AFECTACION_IGV.GRAVADO_ONEROSA || AFECTACIONES_GRATUITAS_GRAVADAS.includes(afectacion);
    const bpLinea = gravada ? ctx.bp : 0;
    const incluye = ctx.incluyeIgv && gravada;

    // Valor unitario sin IGV en micro-soles (6 decimales) para cac:Price.
    const valorUnitMicro = incluye
        ? dividirRedondeo(precioUnitCent * 10000 * BP_100, BP_100 + bpLinea)
        : precioUnitCent * 10000;

    const brutoCent = dividirRedondeo(precioUnitCent * cantMil, 1000);

    let descItemCent = 0;
    if (item.descuento && !gratuita) {
        if (item.descuento.monto !== undefined) descItemCent = aCentimos(item.descuento.monto);
        else if (item.descuento.porcentaje !== undefined) descItemCent = aplicarPct(brutoCent, aEscalado(item.descuento.porcentaje, 2));
        if (descItemCent < 0 || descItemCent > brutoCent) {
            throw new ErrorTributario(`Ítem ${indice + 1}: descuento fuera de rango`);
        }
    }

    let precioTotal;
    let valorVenta;
    let igv;
    let valorBrutoBase;
    if (incluye) {
        precioTotal = brutoCent - descItemCent;
        valorVenta = quitarIgv(precioTotal, bpLinea);
        igv = precioTotal - valorVenta;
        valorBrutoBase = quitarIgv(brutoCent, bpLinea);
    } else {
        valorBrutoBase = brutoCent;
        valorVenta = brutoCent - descItemCent;
        igv = aplicarPct(valorVenta, bpLinea);
        precioTotal = valorVenta + igv;
    }

    return {
        indice,
        codigo: item.codigo || null,
        descripcion: item.descripcion,
        unidad: item.unidad || 'NIU',
        cantMil,
        tipoAfectacionIgv: afectacion,
        gratuita,
        gravada,
        bpLinea,
        precioUnitCent,
        valorUnitMicro,
        descItemCent,
        descItemBaseCent: descItemCent > 0 ? valorBrutoBase - valorVenta : 0,
        valorBrutoBase,
        valorVenta,
        igv,
        precioTotal,
        cobrado: gratuita ? 0 : precioTotal,
        descGlobalCent: 0,
    };
}

/**
 * Valida y normaliza la forma de pago.
 * @param {string} tipoComprobante
 * @param {FormaPagoEntrada|undefined} formaPago
 * @param {number} totalCent
 * @param {Date} fechaEmision
 */
function calcularFormaPago(tipoComprobante, formaPago, totalCent, fechaEmision) {
    const tipo = formaPago?.tipo || FORMA_PAGO.CONTADO;
    if (![FORMA_PAGO.CONTADO, FORMA_PAGO.CREDITO].includes(tipo)) {
        throw new ErrorTributario(`Forma de pago inválida: ${tipo}`, 'FORMA_PAGO');
    }
    if (tipo === FORMA_PAGO.CONTADO) {
        return { tipo, montoPendiente: 0, cuotas: [] };
    }
    if (tipoComprobante !== TIPO_DOCUMENTO.FACTURA) {
        throw new ErrorTributario('La venta al crédito solo se informa en Facturas (01)', 'FORMA_PAGO');
    }
    const cuotas = formaPago.cuotas || [];
    if (cuotas.length === 0) throw new ErrorTributario('Crédito requiere al menos una cuota', 'FORMA_PAGO');

    const inicioDia = new Date(fechaEmision);
    inicioDia.setHours(0, 0, 0, 0);
    let suma = 0;
    const normalizadas = cuotas.map((c, i) => {
        const monto = aCentimos(c.monto);
        const fecha = new Date(c.fechaVencimiento);
        if (monto <= 0) throw new ErrorTributario(`Cuota ${i + 1}: monto debe ser > 0`, 'FORMA_PAGO');
        if (Number.isNaN(fecha.getTime()) || fecha <= inicioDia) {
            throw new ErrorTributario(`Cuota ${i + 1}: fecha de vencimiento debe ser posterior a la emisión`, 'FORMA_PAGO');
        }
        suma += monto;
        return { id: `Cuota${String(i + 1).padStart(3, '0')}`, monto: aSoles(monto), fechaVencimiento: fecha };
    });
    if (suma !== totalCent) {
        throw new ErrorTributario('La suma de cuotas debe ser igual al importe total pendiente', 'FORMA_PAGO');
    }
    return { tipo, montoPendiente: aSoles(totalCent), cuotas: normalizadas };
}

/**
 * Calcula el comprobante completo.
 * @param {EntradaCalculo} entrada
 * @returns {Object} Comprobante calculado (importes en soles con 2 decimales exactos)
 */
function calcular(entrada) {
    const { tipoComprobante, items, descuentoGlobal, cargos = [], formaPago, pagos, config = {} } = entrada || {};
    if (!Array.isArray(items) || items.length === 0) throw new ErrorTributario('El comprobante requiere ítems');

    const ctx = {
        bp: aEscalado(config.tasaIgv ?? 18, 2),
        incluyeIgv: config.preciosIncluyenIGV !== false,
        afectacionCortesia: config.afectacionCortesia || AFECTACION_IGV.GRAVADO_BONIFICACIONES,
    };
    if (!AFECTACIONES_GRATUITAS_GRAVADAS.includes(ctx.afectacionCortesia)) {
        throw new ErrorTributario('afectacionCortesia debe estar entre 11 y 16');
    }
    const fechaEmision = config.fechaEmision ? new Date(config.fechaEmision) : new Date();

    const lineas = items.map((it, i) => calcularLinea(it, i, ctx));
    const onerosasGravadas = lineas.filter((l) => !l.gratuita && l.gravada);

    // Descuento global (Cat. 53 código 02): solo sobre gravadas onerosas, monto con IGV prorrateado.
    let descGlobalCent = 0;
    let descGlobalBase = 0;
    let descGlobalIgv = 0;
    const baseAntesDescuento = onerosasGravadas.reduce((s, l) => s + l.valorVenta, 0);
    if (descuentoGlobal && (descuentoGlobal.monto !== undefined || descuentoGlobal.porcentaje !== undefined)) {
        if (onerosasGravadas.length === 0) throw new ErrorTributario('Descuento global requiere ítems gravados');
        // Con precios con IGV el monto/porcentaje se aplica sobre el precio; sin IGV, sobre la base.
        const referencia = ctx.incluyeIgv
            ? onerosasGravadas.reduce((s, l) => s + l.precioTotal, 0)
            : baseAntesDescuento;
        const monto = descuentoGlobal.monto !== undefined
            ? aCentimos(descuentoGlobal.monto)
            : aplicarPct(referencia, aEscalado(descuentoGlobal.porcentaje, 2));
        if (monto < 0 || monto > referencia) throw new ErrorTributario('Descuento global fuera de rango');
        if (ctx.incluyeIgv) {
            descGlobalCent = monto;
            descGlobalBase = quitarIgv(monto, ctx.bp);
            descGlobalIgv = monto - descGlobalBase;
        } else {
            descGlobalBase = monto;
            descGlobalIgv = aplicarPct(monto, ctx.bp);
            descGlobalCent = descGlobalBase + descGlobalIgv;
        }
        const partes = prorratear(descGlobalCent, onerosasGravadas.map((l) => l.precioTotal));
        onerosasGravadas.forEach((l, i) => { l.descGlobalCent = partes[i]; });
    }

    const sumar = (filtro, campo) => lineas.filter(filtro).reduce((s, l) => s + l[campo], 0);
    const gravadas = sumar((l) => !l.gratuita && l.gravada, 'valorVenta') - descGlobalBase;
    const igv = sumar((l) => !l.gratuita && l.gravada, 'igv') - descGlobalIgv;
    const exoneradas = sumar((l) => !l.gratuita && l.tipoAfectacionIgv === AFECTACION_IGV.EXONERADO_ONEROSA, 'valorVenta');
    const inafectas = sumar((l) => !l.gratuita && l.tipoAfectacionIgv === AFECTACION_IGV.INAFECTO_ONEROSA, 'valorVenta');
    const gratuitas = sumar((l) => l.gratuita, 'valorVenta');
    const igvGratuitas = sumar((l) => l.gratuita, 'igv');
    const descuentosItem = sumar((l) => !l.gratuita, 'descItemBaseCent');
    const consumoNeto = gravadas + igv + exoneradas + inafectas;

    // Cargos (Cat. 53 código 46): fuera de la base imponible.
    const cargosGlobales = cargos.map((c, i) => {
        if (!['recargo_consumo', 'propina'].includes(c.tipo)) throw new ErrorTributario(`Cargo ${i + 1}: tipo inválido`);
        let monto;
        let factorBp = null;
        if (c.monto !== undefined) monto = aCentimos(c.monto);
        else if (c.porcentaje !== undefined) {
            factorBp = aEscalado(c.porcentaje, 2);
            monto = aplicarPct(consumoNeto, factorBp);
        } else throw new ErrorTributario(`Cargo ${i + 1}: requiere monto o porcentaje`);
        if (monto < 0) throw new ErrorTributario(`Cargo ${i + 1}: monto negativo`);
        return {
            codigo: CARGO_DESCUENTO.RECARGO_CONSUMO_PROPINA,
            tipo: c.tipo,
            motivo: c.motivo || (c.tipo === 'propina' ? 'Propina' : 'Recargo al consumo'),
            afectaBase: false,
            factor: factorBp !== null ? factorBp / BP_100 : null,
            montoBaseCent: consumoNeto,
            montoCent: monto,
        };
    });
    const totalCargos = cargosGlobales.reduce((s, c) => s + c.montoCent, 0);
    const importeTotal = consumoNeto + totalCargos;

    // Invariante: Σ líneas netas + cargos === total.
    const sumaLineasNetas = lineas.reduce((s, l) => s + l.cobrado - l.descGlobalCent, 0);
    if (sumaLineasNetas + totalCargos !== importeTotal) {
        throw new ErrorTributario('Descuadre interno entre líneas y total', 'DESCUADRE');
    }

    const formaPagoCalc = calcularFormaPago(tipoComprobante, formaPago, importeTotal, fechaEmision);

    let mediosPago = [];
    if (Array.isArray(pagos) && pagos.length > 0) {
        let sumaPagos = 0;
        mediosPago = pagos.map((p) => {
            const monto = aCentimos(p.monto);
            sumaPagos += monto;
            return { medio: p.medio, codigoSunat: mapearMedioPago(p.medio), monto: aSoles(monto) };
        });
        if (formaPagoCalc.tipo === FORMA_PAGO.CONTADO && sumaPagos !== importeTotal) {
            throw new ErrorTributario('La suma de pagos no coincide con el importe total', 'PAGOS');
        }
    }

    const leyendas = [{ codigo: LEYENDA.MONTO_EN_LETRAS, valor: numeroALetras(importeTotal) }];
    if (lineas.some((l) => l.gratuita)) {
        leyendas.push({ codigo: LEYENDA.TRANSFERENCIA_GRATUITA, valor: TEXTO_LEYENDA_1002 });
    }

    const items_ = lineas.map((l) => ({
        orden: l.indice + 1,
        codigo: l.codigo,
        descripcion: l.descripcion,
        unidad: l.unidad,
        cantidad: l.cantMil / 1000,
        tipoAfectacionIgv: l.tipoAfectacionIgv,
        gratuita: l.gratuita,
        valorUnitario: l.gratuita ? 0 : l.valorUnitMicro / 1e6,
        precioUnitario: l.gratuita ? 0 : aSoles(l.gravada && !ctx.incluyeIgv
            ? l.precioUnitCent + aplicarPct(l.precioUnitCent, l.bpLinea)
            : l.precioUnitCent),
        tipoPrecio: l.gratuita ? TIPO_PRECIO.VALOR_REFERENCIAL_GRATUITO : TIPO_PRECIO.PRECIO_UNITARIO_CON_IGV,
        valorReferencialUnitario: l.gratuita ? l.valorUnitMicro / 1e6 : null,
        descuento: l.descItemCent > 0
            ? {
                codigo: CARGO_DESCUENTO.DESCUENTO_ITEM_AFECTA_BASE,
                montoBase: aSoles(l.valorBrutoBase),
                monto: aSoles(l.descItemBaseCent),
                factor: Number((l.descItemBaseCent / l.valorBrutoBase).toFixed(5)),
            }
            : null,
        porcentajeIgv: l.bpLinea / 100,
        baseImponible: aSoles(l.valorVenta),
        igv: aSoles(l.igv),
        valorVenta: aSoles(l.valorVenta),
        precioTotal: aSoles(l.cobrado),
        descuentoGlobalProrrateado: aSoles(l.descGlobalCent),
    }));

    return {
        tipoComprobante,
        moneda: 'PEN',
        porcentajeIgv: ctx.bp / 100,
        preciosIncluyenIGV: ctx.incluyeIgv,
        items: items_,
        descuentoGlobal: descGlobalCent > 0
            ? {
                codigo: CARGO_DESCUENTO.DESCUENTO_GLOBAL_AFECTA_BASE,
                factor: Number((descGlobalBase / baseAntesDescuento).toFixed(5)),
                montoBase: aSoles(baseAntesDescuento),
                monto: aSoles(descGlobalBase),
                igv: aSoles(descGlobalIgv),
                montoConIgv: aSoles(descGlobalCent),
            }
            : null,
        cargosGlobales: cargosGlobales.map((c) => ({
            codigo: c.codigo,
            tipo: c.tipo,
            motivo: c.motivo,
            afectaBase: c.afectaBase,
            factor: c.factor,
            montoBase: aSoles(c.montoBaseCent),
            monto: aSoles(c.montoCent),
        })),
        totales: {
            gravadas: aSoles(gravadas),
            exoneradas: aSoles(exoneradas),
            inafectas: aSoles(inafectas),
            gratuitas: aSoles(gratuitas),
            igvGratuitas: aSoles(igvGratuitas),
            igv: aSoles(igv),
            descuentosItem: aSoles(descuentosItem),
            descuentoGlobal: aSoles(descGlobalBase),
            valorVentaLineas: aSoles(gravadas + descGlobalBase + exoneradas + inafectas),
            valorVenta: aSoles(gravadas + exoneradas + inafectas),
            precioVenta: aSoles(consumoNeto),
            cargos: aSoles(totalCargos),
            importeTotal: aSoles(importeTotal),
        },
        totalCentimos: importeTotal,
        leyendas,
        formaPago: formaPagoCalc,
        mediosPago,
    };
}

module.exports = { calcular, mapearMedioPago, ErrorTributario };
