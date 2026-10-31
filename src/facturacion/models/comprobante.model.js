/**
 * Comprobante de pago electrónico (Factura 01, Boleta 03, Nota de Crédito 07) — UBL 2.1.
 * Un comprobante emitido nunca se elimina: se anula con NC o comunicación de baja.
 * @module facturacion/models/comprobante
 */

const mongoose = require('mongoose');
const {
    TIPO_DOCUMENTO,
    TIPO_DOC_IDENTIDAD,
    AFECTACION_IGV,
    TIPO_PRECIO,
    LEYENDA,
    CARGO_DESCUENTO,
    MEDIO_PAGO_SUNAT,
    FORMA_PAGO,
    ESTADO_COMPROBANTE,
    MOTIVO_NOTA_CREDITO,
} = require('../constants/catalogosSunat');

const { Schema } = mongoose;

const esDosDecimales = {
    validator: (v) => v === null || v === undefined || Math.abs(v * 100 - Math.round(v * 100)) < 1e-6,
    message: (p) => `${p.path} debe tener como máximo 2 decimales`,
};

/** @param {boolean} [requerido=true] */
const monto = (requerido = true) => ({ type: Number, required: requerido, min: 0, default: requerido ? undefined : 0, validate: esDosDecimales });

const descuentoItemSchema = new Schema({
    codigo: { type: String, enum: [CARGO_DESCUENTO.DESCUENTO_ITEM_AFECTA_BASE], required: true },
    factor: { type: Number, min: 0, max: 1, required: true },
    montoBase: monto(),
    monto: monto(),
}, { _id: false });

const itemSchema = new Schema({
    orden: { type: Number, required: true, min: 1 },
    codigo: { type: String, default: null },
    codigoProductoSunat: { type: String, default: null },
    descripcion: { type: String, required: true, trim: true, maxlength: 500 },
    unidad: { type: String, required: true, default: 'NIU' },
    cantidad: { type: Number, required: true, min: 0.001 },
    tipoAfectacionIgv: { type: String, required: true, enum: Object.values(AFECTACION_IGV) },
    gratuita: { type: Boolean, default: false },
    valorUnitario: { type: Number, required: true, min: 0 },
    precioUnitario: monto(),
    tipoPrecio: { type: String, enum: Object.values(TIPO_PRECIO), required: true },
    valorReferencialUnitario: { type: Number, default: null, min: 0 },
    descuento: { type: descuentoItemSchema, default: null },
    porcentajeIgv: { type: Number, required: true, min: 0, max: 100 },
    baseImponible: monto(),
    igv: monto(),
    valorVenta: monto(),
    precioTotal: monto(),
    descuentoGlobalProrrateado: monto(false),
    platoRef: { type: Schema.Types.ObjectId, ref: 'platos', default: null },
}, { _id: false });

const cargoSchema = new Schema({
    codigo: { type: String, enum: [CARGO_DESCUENTO.RECARGO_CONSUMO_PROPINA], required: true },
    tipo: { type: String, enum: ['recargo_consumo', 'propina'], required: true },
    motivo: { type: String, required: true },
    afectaBase: { type: Boolean, default: false },
    factor: { type: Number, default: null, min: 0 },
    montoBase: monto(),
    monto: monto(),
}, { _id: false });

const descuentoGlobalSchema = new Schema({
    codigo: { type: String, enum: [CARGO_DESCUENTO.DESCUENTO_GLOBAL_AFECTA_BASE], required: true },
    factor: { type: Number, min: 0, max: 1, required: true },
    montoBase: monto(),
    monto: monto(),
    igv: monto(),
    montoConIgv: monto(),
    motivo: { type: String, default: null },
    autorizadoPor: { type: Schema.Types.ObjectId, ref: 'mozos', default: null },
}, { _id: false });

const totalesSchema = new Schema({
    gravadas: monto(),
    exoneradas: monto(),
    inafectas: monto(),
    gratuitas: monto(),
    igvGratuitas: monto(),
    igv: monto(),
    descuentosItem: monto(),
    descuentoGlobal: monto(),
    valorVentaLineas: monto(),
    valorVenta: monto(),
    precioVenta: monto(),
    cargos: monto(),
    importeTotal: monto(),
}, { _id: false });

const cuotaSchema = new Schema({
    id: { type: String, required: true, match: /^Cuota\d{3}$/ },
    monto: monto(),
    fechaVencimiento: { type: Date, required: true },
}, { _id: false });

const formaPagoSchema = new Schema({
    tipo: { type: String, enum: Object.values(FORMA_PAGO), required: true, default: FORMA_PAGO.CONTADO },
    montoPendiente: monto(false),
    cuotas: { type: [cuotaSchema], default: [] },
}, { _id: false });

const medioPagoSchema = new Schema({
    medio: { type: String, enum: Object.keys(MEDIO_PAGO_SUNAT), required: true },
    codigoSunat: { type: String, enum: [...new Set(Object.values(MEDIO_PAGO_SUNAT))], required: true },
    monto: monto(),
    transaccion: { type: Schema.Types.ObjectId, ref: 'TransaccionPago', default: null },
}, { _id: false });

const receptorSchema = new Schema({
    tipoDoc: { type: String, enum: Object.values(TIPO_DOC_IDENTIDAD), required: true },
    numDoc: { type: String, required: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    direccion: { type: String, default: '' },
    email: { type: String, default: null, lowercase: true, trim: true },
    celular: { type: String, default: null },
    validacionPadron: { type: String, enum: ['ok', 'pendiente', 'no_aplica'], default: 'no_aplica' },
}, { _id: false });

const emisorSchema = new Schema({
    ruc: { type: String, required: true, match: /^\d{11}$/ },
    razonSocial: { type: String, required: true },
    nombreComercial: { type: String, default: '' },
    direccion: { type: String, default: '' },
    telefono: { type: String, default: '' },
    email: { type: String, default: '' },
    ubigeo: { type: String, default: '' },
    codigoEstablecimiento: { type: String, default: '0000', match: /^\d{4}$/ },
}, { _id: false });

const referenciaSchema = new Schema({
    tipo: { type: String, enum: [TIPO_DOCUMENTO.FACTURA, TIPO_DOCUMENTO.BOLETA], required: true },
    serie: { type: String, required: true },
    numero: { type: String, required: true },
    fechaEmision: { type: Date, required: true },
    motivoCodigo: { type: String, enum: Object.values(MOTIVO_NOTA_CREDITO), required: true },
    motivoTexto: { type: String, required: true },
    comprobante: { type: Schema.Types.ObjectId, ref: 'Comprobante', required: true },
}, { _id: false });

const auditoriaSchema = new Schema({
    accion: { type: String, required: true },
    usuario: { type: String, default: 'sistema' },
    fecha: { type: Date, default: Date.now },
    detalle: { type: Schema.Types.Mixed, default: null },
}, { _id: false });

const comprobanteSchema = new Schema({
    ruc: { type: String, required: true, match: /^\d{11}$/, immutable: true },
    tipo: { type: String, required: true, enum: [TIPO_DOCUMENTO.FACTURA, TIPO_DOCUMENTO.BOLETA, TIPO_DOCUMENTO.NOTA_CREDITO], immutable: true },
    serie: { type: String, required: true, match: /^[FB][A-Z0-9]{3}$/, immutable: true },
    numero: { type: String, required: true, match: /^\d{8}$/, immutable: true },
    idCompleto: { type: String, required: true, immutable: true },
    sucursal: { type: String, default: 'principal' },
    terminal: { type: String, default: null },
    fechaEmision: { type: Date, required: true, immutable: true },
    tipoOperacion: { type: String, default: '0101' },
    moneda: { type: String, enum: ['PEN', 'USD'], default: 'PEN' },
    porcentajeIgv: { type: Number, required: true, min: 0, max: 100 },
    preciosIncluyenIGV: { type: Boolean, required: true },

    emisor: { type: emisorSchema, required: true },
    receptor: { type: receptorSchema, required: true },
    items: {
        type: [itemSchema],
        validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: 'Debe tener al menos un ítem' },
        immutable: true,
    },
    descuentoGlobal: { type: descuentoGlobalSchema, default: null },
    cargosGlobales: { type: [cargoSchema], default: [] },
    totales: { type: totalesSchema, required: true, immutable: true },
    leyendas: [{
        _id: false,
        codigo: { type: String, enum: Object.values(LEYENDA), required: true },
        valor: { type: String, required: true },
    }],
    formaPago: { type: formaPagoSchema, required: true },
    mediosPago: { type: [medioPagoSchema], default: [] },
    referencia: { type: referenciaSchema, default: null },

    origen: {
        pedido: { type: Schema.Types.ObjectId, ref: 'Pedido', default: null },
        boucher: { type: Schema.Types.ObjectId, ref: 'Boucher', default: null },
        comandas: [{ type: Schema.Types.ObjectId, ref: 'Comanda' }],
        mesa: { type: Schema.Types.ObjectId, ref: 'mesas', default: null },
        numMesa: { type: Number, default: null },
        mozo: { type: Schema.Types.ObjectId, ref: 'mozos', default: null },
        /** Ticket de cocina (comanda o pago adelantado). Solo lo escribe Cobro POS al emitir. */
        ticket: { type: Schema.Types.ObjectId, default: null },
        ticketTipo: { type: String, enum: ['comanda', 'pago_parcial', 'adelantado', null], default: null },
    },
    cajero: { type: String, default: null },

    estado: { type: String, enum: Object.values(ESTADO_COMPROBANTE), default: ESTADO_COMPROBANTE.EMITIDO_LOCAL, index: true },
    hash: { type: String, default: null },
    numeroImpresiones: { type: Number, default: 0, min: 0 },
    xml: {
        nombre: { type: String, default: null },
        ruta: { type: String, default: null },
    },
    cdr: {
        codigo: { type: String, default: null },
        descripcion: { type: String, default: null },
        observaciones: { type: [String], default: [] },
        ruta: { type: String, default: null },
        fecha: { type: Date, default: null },
    },
    envio: {
        proveedor: { type: String, default: null },
        intentos: { type: Number, default: 0, min: 0 },
        ultimoIntento: { type: Date, default: null },
        ultimoError: { type: String, default: null },
        fechaLimite: { type: Date, required: true },
        ticket: { type: String, default: null },
        jobId: { type: String, default: null },
    },
    /** Nota libre. En un canje, la factura nueva cita la boleta anulada. */
    observacion: { type: String, default: null, maxlength: 500 },
    /** Canje boleta → factura: la boleta apunta a su NC y a la factura nueva. */
    canje: {
        nc: { type: Schema.Types.ObjectId, ref: 'Comprobante', default: null },
        factura: { type: Schema.Types.ObjectId, ref: 'Comprobante', default: null },
        boleta: { type: Schema.Types.ObjectId, ref: 'Comprobante', default: null },
        fecha: { type: Date, default: null },
    },
    auditoria: { type: [auditoriaSchema], default: [] },
}, { timestamps: true, collection: 'comprobantes' });

comprobanteSchema.index({ ruc: 1, tipo: 1, serie: 1, numero: 1 }, { unique: true });
comprobanteSchema.index({ estado: 1, 'envio.fechaLimite': 1 });
comprobanteSchema.index({ 'origen.pedido': 1 });
comprobanteSchema.index({ 'origen.boucher': 1 });
comprobanteSchema.index({ 'origen.ticket': 1, estado: 1 });
comprobanteSchema.index({ fechaEmision: -1 });
comprobanteSchema.index({ ruc: 1, fechaEmision: -1 }, { name: 'idx_comprobante_ruc_fecha' });
comprobanteSchema.index({ cajero: 1, fechaEmision: -1 }, { name: 'idx_comprobante_cajero_fecha' });
comprobanteSchema.index({ estado: 1, fechaEmision: -1 }, { name: 'idx_comprobante_estado_fecha' });

const errorBorrado = () => Object.assign(
    new Error('Los comprobantes electrónicos no se eliminan: emita Nota de Crédito o Comunicación de Baja'),
    { statusCode: 403, codigo: 'COMPROBANTE_NO_ELIMINABLE' }
);

comprobanteSchema.pre('deleteOne', { document: true, query: true }, function bloquearDeleteOne(next) {
    next(errorBorrado());
});
comprobanteSchema.pre(['deleteMany', 'findOneAndDelete', 'findOneAndReplace', 'replaceOne'], function bloquearBorrado(next) {
    next(errorBorrado());
});

/**
 * Agrega un registro de auditoría (no persiste; llamar a save()).
 * @param {string} accion
 * @param {string} [usuario]
 * @param {*} [detalle]
 */
comprobanteSchema.methods.auditar = function auditar(accion, usuario = 'sistema', detalle = null) {
    this.auditoria.push({ accion, usuario, detalle, fecha: new Date() });
};

module.exports = mongoose.models.Comprobante || mongoose.model('Comprobante', comprobanteSchema);
