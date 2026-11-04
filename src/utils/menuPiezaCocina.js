'use strict';

const { snapshotNombreCocinaPedido, MAX_NOMBRE_COCINA_PEDIDO } = require('./variantePlato');

function norm(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function esPlatoDeMenu(nombre) {
    const n = norm(nombre).replace(/\s+(pec|pie)$/, '');
    if (n.includes('caldo') && n.includes('pollo')) return true;
    if (n.includes('arroz con pollo')) return true;
    if (n.includes('pollo a la olla') || (n.includes('pollo') && n.includes('olla'))) return true;
    return false;
}

function marcaYaPuesta(nombre) {
    const n = norm(nombre);
    return n.endsWith(' pec') || n.endsWith(' pie');
}

function elegirPiezaMenu(pecho, pierna) {
    const hayPecho = Number(pecho) > 0;
    const hayPierna = Number(pierna) > 0;
    if (hayPecho && hayPierna) return Math.random() < 0.5 ? 'pecho' : 'pierna';
    if (hayPierna) return 'pierna';
    return 'pecho';
}

function anexarMarcaMenu(nombre, pieza) {
    const base = String(nombre || '').trim();
    if (!base || marcaYaPuesta(base)) return base;
    return (base + (pieza === 'pierna' ? ' Pie' : ' Pec')).slice(0, MAX_NOMBRE_COCINA_PEDIDO);
}

async function stocksMenu() {
    try {
        const repo = require('../repository/inventario.repository');
        const saldos = await repo.saldosRubroHoy(['menu-pecho', 'menu-pierna', 'menu']);
        let pecho = Number(saldos['menu-pecho']) || 0;
        let pierna = Number(saldos['menu-pierna']) || 0;
        if (pecho <= 0 && pierna <= 0 && (Number(saldos.menu) || 0) > 0) pecho = Number(saldos.menu);
        return { pecho, pierna };
    } catch (error) {
        return { pecho: 0, pierna: 0 };
    }
}

async function marcarLineaMenu(linea, catalogo, cantidad, bolsa) {
    snapshotNombreCocinaPedido(linea, catalogo);
    const comercial = String((catalogo && catalogo.nombre) || (linea && linea.nombre) || '').trim();
    const pedido = String((linea && linea.nombreCocinaPedido) || '').trim();
    const base = pedido || comercial;
    if (!esPlatoDeMenu(base) && !esPlatoDeMenu(comercial)) return;
    if (marcaYaPuesta(base)) return;
    if (!bolsa.listo) {
        const s = await stocksMenu();
        bolsa.pecho = s.pecho;
        bolsa.pierna = s.pierna;
        bolsa.listo = true;
    }
    const qty = Math.max(1, Number(cantidad) || 1);
    const pieza = elegirPiezaMenu(bolsa.pecho, bolsa.pierna);
    if (pieza === 'pierna') bolsa.pierna -= qty;
    else bolsa.pecho -= qty;
    linea.nombreCocinaPedido = anexarMarcaMenu(base, pieza);
}

module.exports = {
    esPlatoDeMenu,
    elegirPiezaMenu,
    anexarMarcaMenu,
    marcarLineaMenu,
    stocksMenu
};
