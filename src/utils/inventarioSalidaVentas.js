'use strict';

const { matchComandasEstadisticas } = require('./estadisticasComandas');
const { boundsDiaOperativo } = require('./diaOperativoRestaurante');
const { armarContadorPlatos, fichaDePlato } = require('./contadorPlatosReporte');
const { claveDe } = require('./inventarioRubros');
const { semilla, consumoDeFila, leerGuardados } = require('./inventarioMapas');
const logger = require('./logger');

/**
 * Fila del contador de reportes → rubro de inventario.
 * Factor 1: una unidad vendida es una unidad de salida.
 * El medio pollo a la leña cuenta 1 hasta que el negocio diga si son 2 cuartos.
 * Chancho a la leña y el BBQ son rubros distintos.
 */
const MAPA_SALIDA = {
    '1/4 pollo a la lena': { rubro: 'pollo-lena', factor: 1 },
    '1/2 pollo a la lena baby': { rubro: 'pollo-baby', factor: 0.5 },
    'panceta de chancho lena': { rubro: 'trozo-panceta', factor: 3 },
    'chancho a la lena': { rubro: 'trozo-panceta', factor: 4 },
    'chancho a la lena bbq': { rubro: 'trozo-panceta', factor: 6 },
    'pollo de pachamanca': { rubro: 'pachamanca-pollo', factor: 1 }, // sabor Pollo: siempre Pollo pachamanca pierna
    'cerdo de pachamanca': { rubro: 'pachamanca-chancho', factor: 1 },
    'cerdo pachamanca': { rubro: 'pachamanca-chancho', factor: 1 },
    'res de pachamanca': { rubro: 'pachamanca-res', factor: 1 },
    'carnero de pachamanca': { rubro: 'pachamanca-cordero', factor: 1 }
};

function norm(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function esGaseosa(n) {
    return /gaseosa|inca kola|inkakola|coca[- ]?cola|sprite|fanta|guarana/.test(n);
}

function esLicor(n) {
    return /\b(vino|vinos|cerveza|pisco|ron|whisky|whiskey|vodka|chilcano|tequila|sangria|licor|licores|gin)\b/.test(n) && !n.includes('vinagre');
}

function esAgua(n) {
    return /\bagua\b/.test(n);
}

function slugBebida(nombre, prefijo) {
    const n = norm(nombre);
    const s = n.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'bebida';
    return prefijo + '-' + s;
}

function claveBebida(nombre) {
    const n = norm(nombre);
    if (esGaseosa(n)) return slugBebida(nombre, 'gaseosa');
    if (esLicor(n)) return slugBebida(nombre, 'licor');
    if (esAgua(n)) return slugBebida(nombre, 'agua');
    return '';
}

function tipoBebidaPlato(plato) {
    const n = norm(plato && plato.nombre);
    const cat = norm([plato && plato.categoria].concat((plato && plato.categorias) || []).join(' '));
    const grupo = norm(plato && plato.grupoSos);
    if (esGaseosa(n) || grupo === 'gaseosas' || cat.includes('gaseosa')) return 'gaseosas';
    if (!n.includes('vinagre') && (esLicor(n) || grupo === 'alcohol' || cat.includes('vino') || cat.includes('licor'))) return 'licores';
    if (esAgua(n)) return 'bebidas';
    return '';
}

function indiceBebidas(catalogo) {
    const map = {};
    (catalogo || []).forEach((p) => {
        const tipo = tipoBebidaPlato(p);
        if (!tipo || !p.nombre) return;
        const prefijo = tipo === 'gaseosas' ? 'gaseosa' : (tipo === 'bebidas' ? 'agua' : 'licor');
        map[norm(p.nombre)] = claveBebida(p.nombre) || slugBebida(p.nombre, prefijo);
    });
    return map;
}

/** Nombre de la fila de un producto sin definición fija: el de la carta o el de su clave. */
function nombreDeRubro(rubro, catalogo) {
    const def = claveDe(rubro);
    if (def) return def.nombre;
    const plato = (catalogo || []).find((p) => p && p.nombre && claveBebida(p.nombre) === rubro);
    if (plato) return plato.nombre;
    const legible = String(rubro || '').replace(/^(gaseosa|licor|agua)-/, '').replace(/-/g, ' ').trim();
    return legible ? legible.replace(/(^| )([a-zñ])/g, (m, a, b) => a + b.toUpperCase()) : String(rubro || '');
}

/**
 * Guarnición elegida por el mozo → producto del inventario.
 * Ensalada, frijol y zarza no tienen fila.
 */
function rubroTamal(n) {
    if (!n || !n.includes('tamal')) return '';
    if (n.includes('pollo')) return 'tamal-pollo';
    if (n.includes('chancho') || n.includes('cerdo')) return 'tamal-chancho';
    return '';
}

function esNombreSoloArroz(nombre) {
    const n = norm(nombre);
    return n === 'arroz' || n === 'arroz blanco';
}

function llevaArrozBlanco(n) {
    if (!n || n.includes('chaufa') || n.includes('marisco') || n.includes('arroz con pollo') || n.includes('beata')) return false;
    if (n.includes('arroz verde') || n.includes('arroz con pato') || n.includes('arroz de pato')) return false;
    if (n.includes('arroz blanco')) return true;
    return /\barroz\b/.test(n);
}

function nombreConArroz(nombre) {
    const s = String(nombre || '').trim();
    if (!s || esNombreSoloArroz(s)) return s;
    if (/\bcon arroz\s*$/i.test(s)) return s;
    return s + ' Con arroz';
}

function rubroDeGuarnicion(nombre) {
    const n = norm(nombre);
    if (!n || n.includes('ensalada') || n.includes('zarza') || n.includes('frijol') || n.includes('frejol')) return null;
    if (n.includes('yuca')) return { rubro: 'yuca', factor: 1 };
    if (n.includes('papa')) return { rubro: 'papas', factor: 1 };
    if (n.includes('tamal')) {
        const rubro = rubroTamal(n);
        return rubro ? { rubro, factor: 1 } : null;
    }
    if (n.includes('arroz') && n.includes('verde')) return { rubro: 'arroz-verde', factor: 1 };
    if (n.includes('arroz') && n.includes('pato')) return { rubro: 'arroz-verde', factor: 1 };
    if (n.includes('arroz') && n.includes('beata')) return { rubro: 'arroz-beata', factor: 1 };
    if (n.includes('marisco') || n.includes('chaufa')) return null;
    if (n === 'arroz' || n.startsWith('arroz ')) return { rubro: 'arroz-blanco', factor: 1 };
    return null;
}

const ALIAS_RUBRO_RELACION = {
    'chicharron de chancho crudo': 'chicharron-chancho',
    'trozo de panceta': 'trozo-panceta',
    'filete de pollo': 'filete',
    'filete pollo crudo': 'filete',
    'pechuga de pollo': 'pechuga-pollo',
    'pierna de pollo': 'pierna-pollo',
    'carnero crudo': 'seco-cordero',
    'arroz verde': 'arroz-verde',
    'arroz pato': 'arroz-verde',
    'arroz con pato': 'arroz-verde',
    'arroz beata': 'arroz-beata',
    'frugos 1.5lt': 'frugos-1-5l',
    'seco de res': 'carne-guiso',
    'carne guiso': 'carne-guiso',
    'lomo fino': 'lomo-fino',
    'carne bistec': 'bisteck',
    'bistec': 'bisteck',
    'bisteck': 'bisteck'
};

function claveDeRubroRelacion(rubro) {
    const n = norm(rubro);
    if (!n) return '';
    if (!claveDeRubroRelacion.indice) {
        const indice = Object.assign({}, ALIAS_RUBRO_RELACION);
        const { clavesGuardables } = require('./inventarioRubros');
        clavesGuardables().forEach((def) => {
            const nombre = norm(def && def.nombre);
            if (nombre && !indice[nombre]) indice[nombre] = def.clave;
        });
        claveDeRubroRelacion.indice = indice;
    }
    return claveDeRubroRelacion.indice[n] || '';
}

/** Un vínculo que nombra una sola presa. Si nombra pecho y pierna a la vez, no es un corte. */
function ladoRelacion(rel) {
    const c = norm(rel && rel.complemento);
    if (!c) return '';
    const pierna = c.includes('pierna');
    const pecho = c.includes('pecho') || c.includes('pechuga');
    if (pierna && pecho) return '';
    if (pierna) return 'pierna';
    if (pecho) return 'pecho';
    return '';
}

function filaEligeCorte(fila, lado) {
    const cortes = (fila && fila.cortes) || {};
    const keys = Object.keys(cortes).filter((k) => Number(cortes[k]) > 0);
    const texto = norm([fila && fila.nombre, fila && fila.detalle].concat(keys).filter(Boolean).join(' '));
    if (lado === 'pierna') return texto.includes('pierna');
    return texto.includes('pecho') || texto.includes('pechuga');
}

/**
 * Cada producto vinculado al plato se resta.
 * Si la venta ya lo traía, la cantidad del vínculo reemplaza el factor fijo.
 * Si no estaba, se suma. La humita sigue por su cuenta, para no contarla dos veces.
 * Un vínculo de pecho no se suma cuando la venta fue de pierna, ni al revés.
 */
function aplicarFactoresRelacion(nombre, lista, relaciones, fila) {
    const base = Array.isArray(lista) ? lista : [];
    if (!nombre || !relaciones || !relaciones.length) return base;
    const n = norm(nombre);
    const factorPorRubro = {};
    relaciones.forEach((rel) => {
        if (!rel || norm(rel.plato) !== n) return;
        if (rel.cantidad === '—' || rel.cantidad === '-') return;
        const cant = Number(rel.cantidad);
        if (!(cant > 0)) return;
        const lado = ladoRelacion(rel);
        if (lado && !filaEligeCorte(fila, lado)) return;
        const clave = claveDeRubroRelacion(rel.rubro);
        if (!clave || clave === 'humita') return;
        factorPorRubro[clave] = cant;
    });
    const claves = Object.keys(factorPorRubro);
    if (!claves.length) return base;
    const platoMilanesaJunior = norm(nombre).includes('milanesa') && norm(nombre).includes('junior');
    const out = base.map((item) => {
        if (!item || item.unidades != null) return item;
        if (platoMilanesaJunior && item.rubro === 'milanesa' && Number(item.factor) === 0.5) return item;
        const cant = factorPorRubro[item.rubro];
        if (!(cant > 0) || Number(item.factor) === cant) return item;
        return Object.assign({}, item, { factor: cant });
    });
    const ya = {};
    out.forEach((item) => {
        if (item && item.rubro) ya[item.rubro] = true;
    });
    const mismoFilete = (clave) => clave === 'filete' || clave === 'filete-pollo' || clave === 'filete-junior';
    const yaGastaFilete = Object.keys(ya).some(mismoFilete) || !!ya.milanesa;
    claves.forEach((clave) => {
        if (ya[clave]) return;
        if (mismoFilete(clave) && yaGastaFilete) return;
        if (platoMilanesaJunior && mismoFilete(clave)) return;
        out.push({ rubro: clave, factor: factorPorRubro[clave] });
    });
    return out;
}

function filasDelContador(contador) {
    if (!contador) return [];
    const bebidas = (contador.guarniciones || [])
        .filter((g) => g && claveBebida(g.nombre))
        .map((g) => ({ nombre: g.nombre, cantidad: g.cantidad }));
    const guarniciones = [];
    (contador.guarniciones || []).forEach((g) => {
        if (!g || claveBebida(g.nombre) || !rubroDeGuarnicion(g.nombre)) return;
        const dest = rubroDeGuarnicion(g.nombre);
        if (dest.rubro === 'arroz-blanco' && esNombreSoloArroz(g.nombre)) {
            const por = g.porPlato || {};
            const platos = Object.keys(por);
            if (!platos.length) {
                guarniciones.push({ nombre: 'Con arroz', cantidad: g.cantidad, esGuarnicion: true, soloArroz: true, platoOrigen: '' });
                return;
            }
            platos.forEach((plato) => {
                guarniciones.push({
                    nombre: nombreConArroz(plato),
                    cantidad: por[plato],
                    esGuarnicion: true,
                    soloArroz: true,
                    platoOrigen: plato
                });
            });
            return;
        }
        guarniciones.push({ nombre: g.nombre, cantidad: g.cantidad, esGuarnicion: true });
    });
    return []
        .concat(contador.pollos || [])
        .concat(contador.carnes || [])
        .concat(contador.platos || [])
        .concat(bebidas)
        .concat(guarniciones);
}

function partirSalida(filas, comanda, mapasVenta, meta) {
    const porRubro = {};
    const detalle = {};
    const etiqueta = String(comanda || '');
    const sumar = (rubro, nombre, cantidad, platos, factor) => {
        if (!rubro || !nombre || !cantidad) return;
        if (!detalle[rubro]) detalle[rubro] = {};
        const key = etiqueta + '\0' + nombre;
        if (!detalle[rubro][key]) {
            detalle[rubro][key] = {
                nombre,
                cantidad: 0,
                platos: 0,
                factor: Number(factor) > 0 ? Number(factor) : 1,
                comanda: etiqueta,
                comandaId: meta && meta.comandaId ? String(meta.comandaId) : '',
                hora: meta && meta.hora ? meta.hora : null
            };
        }
        detalle[rubro][key].cantidad += cantidad;
        detalle[rubro][key].platos += Number(platos) || 0;
    };
    for (const fila of filas || []) {
        const conGuarnicionArroz = new Set((filas || []).filter((f) => f && f.soloArroz && f.platoOrigen).map((f) => norm(f.platoOrigen)));
        if (fila && fila.soloArroz && !fila.platoOrigen) {
            const ya = (filas || []).some((f) => f && !f.soloArroz && !f.esGuarnicion && !f.guarnicionOpcional && llevaArrozBlanco(norm(f.nombre)));
            if (ya) continue;
        }
        let mapas = aplicarFactoresRelacion(
            fila && fila.nombre,
            rubrosDeFila(fila, mapasVenta, meta && meta.bebidas),
            meta && meta.relaciones,
            fila
        );
        // La yuca opcional ya tiene su propia fila cuando se eligió en la comanda.
        if (fila && fila.guarnicionOpcional && !fila.esGuarnicion) {
            mapas = mapas.filter((m) => m && m.rubro !== 'yuca');
        }
        if (fila && !fila.soloArroz && conGuarnicionArroz.has(norm(fila.nombre))) {
            mapas = mapas.filter((m) => m && m.rubro !== 'arroz-blanco');
        }
        if (mapas.some((m) => m && (m.rubro === 'arroz-pollo' || m.rubro === 'pollo-olla' || m.rubro === 'caldo-pollo'))) {
            mapas = mapas.filter((m) => m && m.rubro !== 'octavo-pollo');
        }
        const nombreFila = norm(fila && fila.nombre);
        if (nombreFila.includes('filete') && nombreFila.includes('junior') && mapas.some((m) => m && (m.rubro === 'filete-junior' || m.rubro === 'filete_junior'))) {
            mapas = mapas.filter((m) => m && m.rubro !== 'filete' && m.rubro !== 'filete-pollo');
        }
        mapas = soloPiezaDeChanchoLena(mapas, fila && fila.nombre);
        const cantidad = Number(fila && fila.cantidad) || 0;
        if (!mapas.length || cantidad <= 0) continue;
        const fuentes = fila && fila.fuentes && typeof fila.fuentes === 'object' ? fila.fuentes : null;
        const nombres = fuentes ? Object.keys(fuentes) : [];
        mapas.forEach((mapa, idx) => {
            const n = mapa.unidades != null ? Number(mapa.unidades) : cantidad * (Number(mapa.factor) || 1);
            const factorFuente = mapa.unidades != null ? (cantidad > 0 ? n / cantidad : 0) : (Number(mapa.factor) || 1);
            porRubro[mapa.rubro] = (porRubro[mapa.rubro] || 0) + n;
            if (idx === 0 && nombres.length) {
                nombres.forEach((nombre) => {
                    const platos = Number(fuentes[nombre]) || 0;
                    const visible = mapa.rubro === 'arroz-blanco' ? nombreConArroz(nombre) : nombre;
                    sumar(mapa.rubro, visible, platos * factorFuente, platos, factorFuente);
                });
            } else {
                const factor = Number(mapa.factor) > 0 ? Number(mapa.factor) : 1;
                const platos = Number(mapa.factor) > 0 ? cantidad : n;
                const visible = mapa.rubro === 'arroz-blanco' ? nombreConArroz(fila.nombre) : fila.nombre;
                sumar(mapa.rubro, visible, n, platos, factor);
            }
        });
    }
    const listas = {};
    Object.keys(detalle).forEach((rubro) => {
        listas[rubro] = Object.keys(detalle[rubro]).map((key) => detalle[rubro][key]);
    });
    return { porRubro, detalle: listas };
}

function ladoCorteLeña(nombre) {
    const n = norm(nombre);
    if (n === 'pec' || n === 'pecho' || n.includes('pechug') || n.includes('pecho')) return 'pecho';
    if (n === 'pie' || n === 'pierna' || n.includes('pierna')) return 'pierna';
    return '';
}

/**
 * El contador lista el pollo del mixto aparte del 1/4.
 * La panceta sale en su propia fila, así que aquí solo se mueve la presa.
 */
function partirMixtoContador(fila, n) {
    const cantidad = Number(fila && fila.cantidad) || 0;
    if (cantidad <= 0) return null;
    if (n === 'mixto a la lena pecho') return [{ rubro: 'pollo-lena', unidades: cantidad }];
    if (n === 'mixto a la lena pierna') return [{ rubro: 'pierna-lena', unidades: cantidad }];
    if (n === 'mixto a la lena') return [{ rubro: 'pollo-lena', unidades: cantidad }];
    return null;
}

/** Parte el 1/4 y el mix según la presa. Sin presa, sigue el mapa fijo. */
function partirLeñaPorCorte(fila) {
    const n = norm(fila && fila.nombre);
    const mixtoContador = partirMixtoContador(fila, n);
    if (mixtoContador) return mixtoContador;
    const esMix = (n.includes('mix') || n.includes('mixto')) && n.includes('lena');
    const esCuarto = n === '1/4 pollo a la lena' || n.includes('1/4 pollo') || n.includes('cuarto de pollo') || n.includes('cuarto pollo');
    if (!esMix && !esCuarto) return null;
    const cortes = (fila && fila.cortes) || {};
    const keys = Object.keys(cortes);
    if (!keys.length) return null;
    let pecho = 0;
    let pierna = 0;
    let resto = 0;
    keys.forEach((k) => {
        const q = Number(cortes[k]) || 0;
        if (q <= 0) return;
        const lado = ladoCorteLeña(k);
        if (lado === 'pecho') pecho += q;
        else if (lado === 'pierna') pierna += q;
        else resto += q;
    });
    if (!pecho && !pierna && !resto) return null;
    const out = [];
    if (pecho) out.push({ rubro: 'pollo-lena', unidades: pecho });
    // La presa pierna del 1/4 y del mix sale de Pierna a la leña. El cocido lo resuelve la cascada.
    if (pierna) out.push({ rubro: 'pierna-lena', unidades: pierna });
    if (resto) out.push({ rubro: 'pollo-lena', unidades: resto });
    if (esMix) {
        const piezas = pecho + pierna + resto;
        out.push({ rubro: 'trozo-panceta', unidades: piezas * 3 });
    }
    return out;
}

function rubroOctavoDe(n) {
    if (n.includes('caldo') && n.includes('pollo')) return 'caldo-pollo';
    if (n.includes('arroz con pollo')) return 'arroz-pollo';
    if (n.includes('pollo a la olla') || (n.includes('pollo') && /\bolla\b/.test(n))) return 'pollo-olla';
    return '';
}

function rubrosDeFila(fila, mapas, bebidas) {
    if (fila && fila.soloArroz) return [{ rubro: 'arroz-blanco', factor: 1 }];
    if (fila && fila.esGuarnicion) {
        const g = rubroDeGuarnicion(fila.nombre);
        return g ? [{ rubro: g.rubro, factor: g.factor || 1 }] : [];
    }
    const partido = partirLeñaPorCorte(fila);
    if (partido) return partido;
    const nombre = fila && fila.nombre;
    const n = norm(nombre);
    if (n.includes('baby') && n.includes('pollo') && n.includes('lena')) {
        return [{ rubro: 'pollo-baby', factor: 0.5 }];
    }
    const directo = MAPA_SALIDA[n];
    if (directo) return [directo];
    const lista = [];
    const add = (rubro, factor, unidades) => {
        const item = { rubro: rubro };
        if (unidades != null) item.unidades = unidades;
        else item.factor = factor || 1;
        lista.push(item);
    };
    const delMapa = consumoDeFila(fila || { nombre: nombre }, mapas || semilla());
    if (delMapa.length) {
        delMapa.forEach((item) => {
            if (item.unidades != null) add(item.rubro, null, item.unidades);
            else add(item.rubro, item.factor);
        });
    } else if (n.includes('filete junior')) add('filete-junior', 0.5);
    else if (n.includes('filete de pollo')) add('filete-pollo');
    else if (n.includes('mix') && n.includes('lena')) { add('trozo-panceta', 3); add('pollo-lena', 1); }
    else if (n.includes('chancho') && n.includes('lena') && n.includes('bbq')) add('trozo-panceta', 6);
    else if (n.includes('chancho') && n.includes('lena')) add('trozo-panceta', 4);
    else if (n.includes('chaufa') && n.includes('chancho')) add('trozo-panceta', 1);
    else if (n.includes('desayuno criollo')) add('chicharron-chancho', 0.5);
    else if (n.includes('fuente') && n.includes('chicharron') && n.includes('chancho')) add('chicharron-chancho', 2);
    else if ((n.includes('1/2') || n.includes('medio')) && n.includes('chicharron') && n.includes('chancho')) add('chicharron-chancho', 0.5);
    else if (n.includes('chicharron') && n.includes('chancho')) add('chicharron-chancho', 1);
    else if ((n.includes('ceviche') || n.includes('chicharron')) && n.includes('pota')) add('pieza-pota', 1);
    else if (n.includes('duo marino')) add('pieza-pescado', 2);
    else if (!n.includes('trucha') && (n.includes('pescado frito') || (n.includes('jalea') && n.includes('pescado')) || (n.includes('chicharron') && n.includes('pescado')) || (n.includes('ceviche') && n.includes('pescado')) || n === 'ceviche')) add('pieza-pescado', 1);
    else if ((n.includes('1/2') || n.includes('medio')) && n.includes('cuy')) add('cuy', 0.5);
    else if (n.includes('cuy')) add('cuy', 1);
    else if (!n.includes('baby') && (n.includes('1/4 pollo') || n.includes('cuarto de pollo') || n.includes('pollo a la lena'))) add('pollo-lena');
    else if (n.includes('chicharron de pollo') && n.includes('bbq')) add('chi-pollo-bbq');
    else if (n.includes('acevichada') && n.includes('pollo')) add('chi-pollo-acevichada');
    else if (n.includes('chicharron') && n.includes('pollo')) add('chicharron-pollo');
    else if (n.includes('pachamanca') && n.includes('pollo')) add('pachamanca-pollo');
    else if (n.includes('milanesa')) add('milanesa');
    else if (n.includes('chaufa') && n.includes('pollo')) add('chaufa-pollo');
    else if (n.includes('saltado') && n.includes('pollo')) add('salt-pollo');
    else if (n.includes('pan con pollo') || (n.includes('sandwich') && n.includes('pollo'))) add('sandwiches');
    else if (n.includes('pollada')) add('pollada');
    else if (rubroTamal(n)) add(rubroTamal(n));
    else if (bebidas && bebidas[n]) add(bebidas[n]);
    else if (claveBebida(nombre)) add(claveBebida(nombre));
    const propio = rubroPropioDeNombre(n);
    if (propio) {
        for (let i = 0; i < lista.length; i++) {
            if (lista[i].rubro === 'filete') lista[i] = Object.assign({}, lista[i], { rubro: propio });
        }
    }
    if ((n.includes('salchipapa') || n.includes('hotdog') || n.includes('hot dog')) && !lista.some((x) => x.rubro === 'hotdog')) add('hotdog');
    const humitas = factorHumita(n);
    if (humitas && !lista.some((x) => x.rubro === 'humita')) add('humita', humitas);
    const opcional = !!(fila && fila.guarnicionOpcional);
    if (!opcional && consumeYuca(n) && !lista.some((x) => x.rubro === 'yuca')) add('yuca');
    if (consumeInca300(n) && !lista.some((x) => x.rubro === 'gaseosa-inca-kola-300ml')) add('gaseosa-inca-kola-300ml');
    // Seco de carnero: la venta cae en su propia fila. El cocido se gasta; no sale de Carnero crudo.
    if (consumeCarneroCrudo(n) && !lista.some((x) => x.rubro === 'seco-cordero' || x.rubro === 'carnero')) add('seco-cordero');
    if (n.includes('frugos') && !lista.some((x) => x.rubro === 'frugos-1-5l')) add('frugos-1-5l');
    const pizza = rubroPizza(n);
    if (pizza && !lista.some((x) => x.rubro === pizza)) add(pizza);
    if (esPlatoBistec(n) && !lista.some((x) => x.rubro === 'bisteck')) add('bisteck');
    if ((n === 'lomo fino' || n.startsWith('lomo fino ')) && !lista.some((x) => x.rubro === 'lomo-fino')) add('lomo-fino');
    if ((n === 'seco de res' || n.startsWith('seco de res ')) && !lista.some((x) => x.rubro === 'carne-guiso')) add('carne-guiso');
    if ((n === 'delicia' || n.includes('delicias')) && !lista.some((x) => x.rubro === 'delicias')) add('delicias');
    if (/\bhelados?\b/.test(n) && !lista.some((x) => x.rubro === 'helados')) add('helados');
    if (!opcional && (n.includes('papa frita') || n.includes('papas fritas')) && !lista.some((x) => x.rubro === 'papas')) add('papas');
    if (n.includes('arroz verde') || n.includes('arroz con pato') || n.includes('arroz de pato')) {
        if (!lista.some((x) => x.rubro === 'arroz-verde')) add('arroz-verde');
    } else if (n.includes('arroz beata') || (n.includes('beata') && n.includes('arroz'))) {
        if (!lista.some((x) => x.rubro === 'arroz-beata')) add('arroz-beata');
    } else if ((n.includes('arroz blanco') || (!opcional && llevaArrozBlanco(n))) && !lista.some((x) => x.rubro === 'arroz-blanco')) {
        add('arroz-blanco');
    }
    const octavo = rubroOctavoDe(n);
    if (octavo && !lista.some((x) => x.rubro === octavo)) add(octavo);
    if (n.includes('milanesa') && n.includes('junior')) {
        let hay = false;
        lista.forEach((item) => {
            if (!item || item.rubro !== 'milanesa') return;
            hay = true;
            if (item.unidades != null) item.unidades = 0.5 * (Number(fila && fila.cantidad) || 1);
            else item.factor = 0.5;
        });
        if (!hay) lista.unshift({ rubro: 'milanesa', factor: 0.5 });
    }
    return lista;
}

/** El plato Bistec o Bisteck. El saltado y el chaufa de bistec no entran aquí. */
function esPlatoBistec(n) {
    return n === 'bistec' || n === 'bisteck' || n.startsWith('bistec ') || n.startsWith('bisteck ');
}

/** El plato Humita. Un sabor suelto (Pollo de pachamanca) no cuenta: la humita sale del plato. */
function esPlatoHumita(n) {
    return n === 'humita' || n.startsWith('humita ');
}

/** El plato comercial (1, 2, 3 o 4 sabores, olla, cordero). No el sabor ni la fila sintética sin sabor. */
function esPlatoPachamancaNombre(n) {
    if (!n.startsWith('pachamanca')) return false;
    if (n.includes('sin sabor')) return false;
    return true;
}

/** 1 sabor = 1, 2 = 2, 3 = 3, 4 = 4. Sin número en el nombre, una. */
function saboresPachamanca(n) {
    const m = String(n || '').match(/pachamanca\s+(\d+)\s+sabor/);
    const k = m ? Number(m[1]) : 0;
    return k >= 1 ? k : 0;
}

function factorHumita(n) {
    if (esPlatoHumita(n)) return 1;
    if (!esPlatoPachamancaNombre(n)) return 0;
    return saboresPachamanca(n) || 1;
}

/** Una yuca por plato. El dúo marino y el ceviche de pota no entran. */
function consumeYuca(n) {
    if (n.includes('duo') && n.includes('marino')) return false;
    if (n.includes('ceviche') && n.includes('pota')) return false;
    if (n.includes('chicharron') && n.includes('pota')) return true;
    if (n.includes('chicharron') && n.includes('pescado')) return true;
    if (n.includes('jalea') && n.includes('pescado')) return true;
    if (n.includes('fuente') && n.includes('pollo') && !n.includes('chancho')) return true;
    if (n.includes('chicharron') && n.includes('pollo')) return true;
    if (n.includes('chicharron') && n.includes('trucha')) return true;
    if (n.includes('duo') && n.includes('truch')) return true;
    return false;
}

function consumeInca300(n) {
    if (n.includes('pollada')) return true;
    if (n.includes('milanesa') && n.includes('junior')) return true;
    if (n.includes('filete') && n.includes('junior')) return true;
    if (n.includes('arroz con pollo')) return true;
    if (n.includes('seco') && n.includes('res')) return true;
    if (n.includes('pollo') && n.includes('olla')) return true;
    return false;
}

function consumeCarneroCrudo(n) {
    return n.includes('seco') && (n.includes('carnero') || n.includes('cordero'));
}

function rubroPizza(n) {
    if (!n.includes('pizza')) return '';
    if (/30\s*x\s*30/.test(n)) return 'pizza-30x30';
    if (/20\s*x\s*20/.test(n)) return 'pizza-20x20';
    if (n.includes('grande')) return 'pizza-30x30';
    return '';
}

/**
 * Humitas según los sabores del plato, no según la pieza.
 * El contador parte la pachamanca en sabores; la cantidad sale de la línea original.
 */
function unidadesHumitaPachamanca(lineas, catalogo) {
    const porId = new Map();
    (catalogo || []).forEach((p) => {
        if (p && p._id != null) porId.set(String(p._id), p);
    });
    const detalle = [];
    let total = 0;
    (lineas || []).forEach((linea) => {
        if (!linea || linea.eliminado || linea.anulado) return;
        const id = linea.platoId || (linea.plato && (linea.plato._id || linea.plato));
        const cat = id != null ? porId.get(String(id)) : null;
        const ficha = fichaDePlato(cat || {
            nombre: linea.nombre,
            categoria: linea.categoria,
            complementos: linea.complementosCatalogo,
            complementosUnidosAlPlato: linea.complementosUnidosAlPlato
        });
        if (!ficha || ficha.tipo !== 'pachamanca') return;
        const cant = Number(linea.cantidad) > 0 ? Number(linea.cantidad) : 1;
        const factor = factorHumita(norm(ficha.nombre || linea.nombre)) || 1;
        const uso = cant * factor;
        total += uso;
        detalle.push({
            nombre: ficha.nombre || linea.nombre || 'Pachamanca',
            cantidad: uso,
            platos: cant,
            factor: factor
        });
    });
    return { total, detalle };
}

function rubroPropioDeNombre(n) {
    if (n.includes('fuente') || n.includes('filete de pollo') || n.includes('filete junior')) return '';
    if (n.includes('saltado') && n.includes('pollo')) return 'salt-pollo';
    if (n.includes('chaufa') && n.includes('pollo')) return 'chaufa-pollo';
    if (n.includes('milanesa junior')) return 'milanesa-junior';
    if (n.includes('milanesa')) return 'milanesa';
    if (n.includes('chicharron') && n.includes('pollo') && n.includes('bbq')) return 'chi-pollo-bbq';
    if (n.includes('acevichad') && n.includes('pollo')) return 'chi-pollo-acevichada';
    if (n.includes('chicharron') && n.includes('pollo')) return 'chicharron-pollo';
    return '';
}

/**
 * Chancho a la leña y el BBQ salen de Pieza de panceta (4 y 6).
 * No tienen fila propia: un vínculo que suma chancho-lena o chancho-lena-bbq
 * dejaba un crudo −1 y la emergencia, aunque la pieza sí tenía stock.
 */
function soloPiezaDeChanchoLena(mapas, nombre) {
    const n = norm(nombre);
    if (!n.includes('chancho') || !n.includes('lena') || n.includes('panceta')) return mapas;
    const limpio = (mapas || []).filter((m) => m && m.rubro !== 'chancho-lena' && m.rubro !== 'chancho-lena-bbq');
    // La fila «Con arroz» solo lleva el arroz. Si aquí se suma la pieza, el mismo plato se cuenta dos veces.
    if (/\bcon arroz$/.test(n)) return limpio;
    const bbq = n.includes('bbq');
    const lena = !bbq && !n.includes('mix');
    if (!bbq && !lena) return mapas;
    if (!limpio.some((m) => m && m.rubro === 'trozo-panceta')) {
        limpio.push({ rubro: 'trozo-panceta', factor: bbq ? 6 : 4 });
    }
    return limpio;
}

function rubrosDeNombre(nombre, mapas) {
    return rubrosDeFila({ nombre: nombre }, mapas);
}

function aplicarMapa(filas, mapas, bebidas) {
    return partirSalida(filas, '', mapas, { bebidas: bebidas }).porRubro;
}

function lineasDeComanda(comanda) {
    const lineas = [];
    (comanda.platos || []).forEach((p, i) => {
        if (!p || p.eliminado || p.anulado) return;
        const ref = p.plato && typeof p.plato === 'object' ? p.plato : null;
        const cant = Number(p.cantidad) > 0 ? Number(p.cantidad) : (Number(comanda.cantidades?.[i]) || 1);
        lineas.push({
            platoId: ref ? ref._id : p.plato,
            nombre: p.nombre || ref?.nombre || 'Sin nombre',
            cantidad: cant,
            soles: Number(p.subtotal) || 0,
            complementosCatalogo: ref?.complementos,
            complementos: p.complementosSeleccionados || []
        });
    });
    return lineas;
}

const CAMPOS_PLATO = 'nombre nombreCocina categoria categorias grupoSos complementos complementosUnidosAlPlato';
const CAMPOS_COMANDA = 'platos.plato platos.nombre platos.cantidad platos.subtotal platos.eliminado platos.anulado platos.complementosSeleccionados cantidades createdAt numeroComandaDia';

let cacheHistoriaVentas = null;

function invalidarCacheVentas() {
    cacheHistoriaVentas = null;
}

async function ventasEntre(desde, hasta) {
    if (desde > hasta) return [];
    const Comanda = require('../database/models/comanda.model');
    const Plato = require('../database/models/plato.model');
    const [comandas, catalogo] = await Promise.all([
        Comanda.find(matchComandasEstadisticas(desde, hasta)).select(CAMPOS_COMANDA).lean(),
        Plato.find({ isActive: { $ne: false } }).select(CAMPOS_PLATO).lean()
    ]);
    const porId = new Map();
    (catalogo || []).forEach((p) => { if (p && p._id != null) porId.set(String(p._id), p); });
    const faltan = [];
    const vistos = new Set();
    (comandas || []).forEach((c) => {
        (c.platos || []).forEach((p) => {
            if (!p || p.plato == null || typeof p.plato === 'object') return;
            const id = String(p.plato);
            if (porId.has(id) || vistos.has(id)) return;
            vistos.add(id);
            faltan.push(p.plato);
        });
    });
    if (faltan.length) {
        const extra = await Plato.find({ _id: { $in: faltan } }).select(CAMPOS_PLATO).lean();
        (extra || []).forEach((p) => {
            if (!p || p._id == null) return;
            porId.set(String(p._id), p);
            catalogo.push(p);
        });
    }
    (comandas || []).forEach((c) => {
        (c.platos || []).forEach((p) => {
            if (!p || p.plato == null || typeof p.plato === 'object') return;
            const ref = porId.get(String(p.plato));
            if (ref) p.plato = ref;
        });
    });
    const ventas = [];
        let mapasVenta = semilla();
        try {
            mapasVenta = await leerGuardados();
        } catch (errorMapa) {
            logger.warn('Inventario usa los mapas de semilla', { error: errorMapa.message });
        }
        const bebidas = indiceBebidas(catalogo);
        let relaciones = [];
        try {
            const Modelo = require('../database/models/inventarioMapa.model');
            const docRel = await Modelo.findOne({ clave: 'relaciones' }).select('relaciones').lean();
            relaciones = docRel && Array.isArray(docRel.relaciones) ? docRel.relaciones : [];
        } catch (errorRel) {
            logger.warn('Inventario usa los factores fijos de platos', { error: errorRel.message });
        }
        for (const comanda of comandas || []) {
            const lineas = lineasDeComanda(comanda);
            if (!comanda || !comanda.createdAt || !lineas.length) continue;
            const nro = comanda.numeroComandaDia;
            const etiqueta = nro != null && nro !== '' ? ('Comanda ' + nro) : 'Sin número';
            const partido = partirSalida(
                filasDelContador(armarContadorPlatos(lineas, catalogo)),
                etiqueta,
                mapasVenta,
                { comandaId: comanda._id, hora: comanda.createdAt, bebidas: bebidas, relaciones: relaciones }
            );
            const humita = unidadesHumitaPachamanca(lineas, catalogo);
            if (humita.total > 0) {
                partido.porRubro.humita = (partido.porRubro.humita || 0) + humita.total;
                const extra = humita.detalle.map((d) => ({
                    nombre: d.nombre,
                    cantidad: d.cantidad,
                    platos: d.platos,
                    factor: 1,
                    comanda: etiqueta,
                    comandaId: comanda._id ? String(comanda._id) : '',
                    hora: comanda.createdAt
                }));
                partido.detalle.humita = (partido.detalle.humita || []).concat(extra);
            }
            Object.keys(partido.porRubro).forEach((rubro) => {
                const cantidad = partido.porRubro[rubro];
                if (!cantidad) return;
                ventas.push({
                    rubro,
                    nombre: nombreDeRubro(rubro, catalogo),
                    cantidad,
                    fecha: comanda.createdAt,
                    motivo: 'Venta (reportes)',
                    detalle: partido.detalle[rubro] || []
                });
            });
        }
    return ventas;
}

async function firmaHistoriaVentas(desde, inicio) {
    const Comanda = require('../database/models/comanda.model');
    const fin = new Date(inicio.getTime() - 1);
    const [marca, bajas] = await Promise.all([
        Comanda.findOne(matchComandasEstadisticas(desde, fin)).sort({ updatedAt: -1 }).select('updatedAt').lean(),
        Comanda.countDocuments({
            createdAt: { $gte: desde, $lt: inicio },
            $or: [
                { eliminada: true },
                { fechaEliminacion: { $ne: null } },
                { status: { $in: ['cancelado', 'cancelada'] } }
            ]
        })
    ]);
    const marcaMs = marca && marca.updatedAt ? new Date(marca.updatedAt).getTime() : 0;
    return marcaMs + ':' + bajas;
}

/**
 * Egresos de venta hasta `hasta`, partidos por día operativo.
 * No se guardan: el kardex los suma y, si la comanda se anula, desaparecen.
 * Lo anterior a hoy se reutiliza; el día de hoy se vuelve a leer.
 */
async function egresosVentaHasta(hasta) {
    try {
        const Corte = require('../database/models/inventarioCorte.model');
        const corte = await Corte.findOne({ clave: 'inventario' }).lean();
        const desde = corte && corte.desde ? new Date(corte.desde) : new Date(0);
        if (desde > hasta) return { movs: [], ventas: [] };
        const inicio = boundsDiaOperativo(new Date()).inicio;
        if (!(desde < inicio && hasta >= inicio)) {
            return { movs: [], ventas: await ventasEntre(desde, hasta) };
        }
        const finHistoria = new Date(inicio.getTime() - 1);
        const clave = desde.getTime() + ':' + inicio.getTime();
        const firmaPromise = firmaHistoriaVentas(desde, inicio);
        const hoyPromise = ventasEntre(inicio, hasta);
        let guardado = cacheHistoriaVentas && cacheHistoriaVentas.clave === clave ? cacheHistoriaVentas : null;
        if (!guardado) {
            const promesa = ventasEntre(desde, finHistoria);
            guardado = { clave, firma: '', promesa };
            cacheHistoriaVentas = guardado;
            promesa.then((ventas) => {
                if (cacheHistoriaVentas === guardado) guardado.ventas = ventas;
            }).catch(() => {
                if (cacheHistoriaVentas === guardado) cacheHistoriaVentas = null;
            });
        }
        const firma = await firmaPromise;
        if (guardado.firma && guardado.firma !== firma) {
            const promesa = ventasEntre(desde, finHistoria);
            guardado = { clave, firma, promesa };
            cacheHistoriaVentas = guardado;
            promesa.then((ventas) => {
                if (cacheHistoriaVentas === guardado) guardado.ventas = ventas;
            }).catch(() => {
                if (cacheHistoriaVentas === guardado) cacheHistoriaVentas = null;
            });
        } else if (!guardado.firma) {
            guardado.firma = firma;
        }
        const [anteriores, hoy] = await Promise.all([
            guardado.ventas || guardado.promesa,
            hoyPromise
        ]);
        return { movs: [], ventas: (anteriores || []).concat(hoy) };
    } catch (error) {
        logger.warn('No se pudo cruzar ventas de reportes con inventario', { error: error.message });
        return { movs: [], ventas: [] };
    }
}

module.exports = {
    MAPA_SALIDA,
    norm,
    aplicarMapa,
    rubroDeGuarnicion,
    rubrosDeNombre,
    aplicarFactoresRelacion,
    partirSalida,
    filasDelContador,
    indiceBebidas,
    nombreDeRubro,
    unidadesHumitaPachamanca,
    egresosVentaHasta,
    invalidarCacheVentas
};
