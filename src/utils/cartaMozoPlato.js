'use strict';

/** Campos que el buscador de mozos necesita para Sumar / G / V / Uso G. */
const CARTA_MOZO_SELECT = [
    '_id',
    'id',
    'codigo',
    'codigoMozo',
    'nombre',
    'nombresSincronizados',
    'precio',
    'stock',
    'categoria',
    'categorias',
    'tipo',
    'tipos',
    'isActive',
    'orden',
    'complementos',
    'complementosAfectanPrecio',
    'complementosUnidosAlPlato',
    'platoPrincipal',
    'platoEditable',
    'requiereNumeroSerie',
    'updatedAt'
].join(' ');

function idCarta(p) {
    if (!p) return '';
    if (p._id != null) return String(p._id);
    if (p.id != null) return String(p.id);
    return '';
}

function toCartaMozo(doc) {
    if (!doc) return null;
    const p = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    if (!p || (p._id == null && p.id == null)) return null;
    return {
        _id: p._id,
        id: p.id,
        codigo: p.codigo || '',
        codigoMozo: p.codigoMozo || '',
        nombre: p.nombre,
        nombresSincronizados: Array.isArray(p.nombresSincronizados) ? p.nombresSincronizados : [],
        precio: p.precio,
        stock: p.stock,
        categoria: p.categoria,
        categorias: Array.isArray(p.categorias) ? p.categorias : undefined,
        tipo: p.tipo,
        tipos: Array.isArray(p.tipos) ? p.tipos : undefined,
        isActive: p.isActive !== false,
        orden: Number.isFinite(Number(p.orden)) ? Number(p.orden) : 0,
        complementos: Array.isArray(p.complementos) ? p.complementos : [],
        complementosAfectanPrecio: p.complementosAfectanPrecio !== false,
        complementosUnidosAlPlato: p.complementosUnidosAlPlato === true,
        platoPrincipal: p.platoPrincipal || null,
        platoEditable: p.platoEditable === true,
        requiereNumeroSerie: p.requiereNumeroSerie === true,
        updatedAt: p.updatedAt || null
    };
}

module.exports = {
    CARTA_MOZO_SELECT,
    idCarta,
    toCartaMozo
};
