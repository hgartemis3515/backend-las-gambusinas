const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { armarLibro } = require('../src/utils/inventarioLibro');
const { perfilRubro, esStockGeneral, normalizarVenta, semillaCocido } = require('../src/utils/inventarioCascadaVenta');
const { boundsDiaOperativo } = require('../src/utils/diaOperativoRestaurante');
const { partirSalida } = require('../src/utils/inventarioSalidaVentas');
const InventarioRelaciones = require('../public/assets/js/inventarioRelaciones');

const html = fs.readFileSync(path.join(__dirname, '../public/inventario.html'), 'utf8');
const factoryCode = html.slice(html.indexOf('function inventarioApp()'), html.lastIndexOf('</script>'));

function crearApp(store = {}, window = {}) {
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const fabrica = vm.runInNewContext('(' + factoryCode.trim() + ')', {
        window, localStorage, sessionStorage: localStorage, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0
    });
    const app = fabrica();
    app.$nextTick = (f) => f && f();
    app.$watch = () => {};
    app.$refs = {};
    app.sonarVenta = () => {};
    app.animarContadorVenta = () => {};
    app.restaurarEjemploDespiece(true);
    app.vaciarNumeros();
    app.aplicarOpcionesCocido([]);
    return app;
}

const hora = (h) => '2026-11-11T' + h + ':00-05:00';
const horaAyer = (h) => '2026-11-10T' + h + ':00-05:00';
const mov = (rubro, clase, cantidad, fecha, motivo, tipoProducto = 'crudo') => ({ rubro, clase, cantidad, fecha, tipoProducto, motivo: motivo || 'Ingreso crudo' });

function pintar(app, movimientos, ventas, ymd = '2026-11-11') {
    const b = boundsDiaOperativo(ymd);
    const libro = armarLibro({ movimientos, ventas: ventas || [], desde: b.inicio, hasta: b.fin });
    app.ventasPeriodo = libro.ventas;
    app.movimientosPeriodo = movimientos;
    app.aplicarKardex(libro.filas, movimientos, libro.ventas);
    return libro;
}

test.each([[10, 0, 10], [0, 10, 10], [1, 10, 4]])('cocinar conserva el origen de las cantidades (%i de apertura, %i de ingreso)', (apertura, ingreso, cocina) => {
    const app = crearApp();
    const rubro = 'pachamanca-chancho';
    const row = app.filaReal('cerdo_pachamanca');
    expect(app.claveDeFila[row.id]).toBe(rubro);
    const salieronDeApertura = Math.min(cocina, apertura);
    const salieronDeIngreso = cocina - salieronDeApertura;
    pintar(app, [
        mov(rubro, 'ingreso', apertura, horaAyer('17:00')),
        mov(rubro, 'ingreso', ingreso, hora('08:00')),
        mov(rubro, 'ingreso', -cocina, hora('09:00'), 'Pasa a cocido Cerdo pachamanca'),
        mov(rubro, 'ingreso', cocina, hora('09:00'), 'Pasa de crudo Cerdo pachamanca', 'cocido')
    ]);
    expect(row).toMatchObject({
        saldoAnterior: apertura - salieronDeApertura, saldoAnteriorCocido: salieronDeApertura,
        ingreso: ingreso - salieronDeIngreso, ingresoCocido: salieronDeIngreso
    });
    for (const tipo of ['crudo', 'cocido']) {
        const suma = app.cifraGrupo(row, 'saldoAnterior', tipo) + app.cifraIngresoTabla(row, 'ingreso', tipo);
        expect(app.cifraIngresoTabla(row, 'ingresoTotal', tipo)).toBe(suma);
        expect(app.stockCuadro(row.id, tipo)).toBe(suma);
    }
});

test('la lupa de Macerado permite revertir una salida antigua sin metadatos de pase', async () => {
    const app = crearApp({}, { confirm: () => true });
    const row = app.filaReal('pollo_pachamanca');
    const salida = { ...mov('pachamanca-pollo', 'ingreso', -4, hora('16:03'), 'Pasa a cocido Pollo pachamanca pierna'), _id: '507f1f77bcf86cd799439011' };
    app.movimientosPeriodo = [salida, mov('pachamanca-pollo', 'ingreso', 10, hora('16:03'))];
    app.api = jest.fn(async () => {});
    app.cargarKardex = jest.fn(async () => {});
    app.abrirOrigenIngreso(row, 'crudo');
    const linea = app.origenIngreso.lineas.find((l) => l.salida);
    expect(linea).toMatchObject({ paseId: salida._id, paseDestino: 'cocido', paseCantidad: 4 });
    await app.revertirPaseIngreso(linea);
    expect(app.api).toHaveBeenCalledWith('/inventario/pases/revertir', { method: 'POST', body: JSON.stringify({ id: salida._id }) });
});

test('la lupa revierte un pase concreto y recarga el saldo y la lista', async () => {
    const app = crearApp({}, { confirm: () => true });
    const rubro = 'pachamanca-pollo';
    const ingreso = mov(rubro, 'ingreso', 10, hora('08:00'));
    const base = [mov(rubro, 'ingreso', 1, horaAyer('17:00')), ingreso];
    const pase = (id, cantidad, fecha) => ({ ...mov(rubro, 'ingreso', cantidad, fecha, 'Pasa de crudo Pollo pachamanca pierna', 'cocido'), _id: id, paseTipo: true });
    const primero = pase('pase-apertura', 1, hora('09:00'));
    const elegido = pase('pase-ingreso', 3, hora('10:00'));
    const documentos = [...base, primero, elegido];
    const paraLupa = (m, revertido) => ({ ...m, paseId: m._id, paseDestino: m.tipoProducto, paseCantidad: m.cantidad, paseRevertido: revertido });
    pintar(app, documentos);
    app.movimientosPeriodo = [ingreso, paraLupa(primero, false), paraLupa(elegido, false)];
    const row = app.filaReal('pollo_pachamanca');
    const total = app.cifraIngresoTabla(row, 'ingresoTotal', 'crudo');
    expect(total).toBe(7);
    expect(app.cifraGrupo(row, 'saldoAnterior', 'crudo')).toBe(0);
    expect(app.cifraIngresoTabla(row, 'ingreso', 'crudo')).toBe(7);
    app.abrirOrigenIngreso(row, 'cocido');
    expect(app.origenIngreso.lineas.map((l) => l.paseId)).toEqual(['pase-ingreso', 'pase-apertura']);
    app.api = jest.fn(async () => {
        documentos.push({ ...mov(rubro, 'ingreso', 3, hora('11:00'), 'Pasa de cocido Pollo pachamanca pierna'), paseTipo: true, reviertePase: elegido._id });
    });
    app.cargarKardex = async () => {
        pintar(app, documentos);
        const reversion = documentos.at(-1);
        app.movimientosPeriodo = [ingreso, paraLupa(primero, false), paraLupa(elegido, true),
            { ...paraLupa(elegido, true), tipoProducto: 'crudo', cantidad: -3, motivo: 'Pasa a cocido Pollo pachamanca pierna' },
            reversion, { ...reversion, tipoProducto: 'cocido', cantidad: -3, motivo: 'Pasa a crudo Pollo pachamanca pierna' }];
    };
    await app.revertirPaseIngreso(app.origenIngreso.lineas[0]);
    expect(app.api).toHaveBeenCalledWith('/inventario/pases/revertir', { method: 'POST', body: '{"id":"pase-ingreso"}' });
    expect(app.origenIngreso.lineas).toMatchObject([{ paseId: 'pase-apertura' }]);
    expect(row).toMatchObject({ saldoAnterior: 0, saldoAnteriorCocido: 1, ingreso: 10, ingresoCocido: 0 });
    app.abrirOrigenIngreso(row, 'crudo');
    expect(app.origenIngreso.lineas).toMatchObject([{ clase: 'ingreso', cantidad: 10 }]);
    expect(app.movimientosPeriodo.some((m) => m.reviertePase === elegido._id)).toBe(true);
});

test.each([
    ['pechuga', 'pecho_pachamanca', ''],
    ['pierna', 'pollo_pachamanca', ''],
    ['octavo_pollo', 'arroz_con_pollo', ' · pecho']
])('la lupa de %s muestra el pase a su plato y solo la cocción que quedó', (id, idPlato, marca) => {
    const app = crearApp();
    const row = app.filaReal(id);
    const plato = app.filaReal(idPlato);
    const rubro = app.claveDeFila[idPlato];
    const movs = [
        mov(app.claveDeFila[id], 'ingreso', -2, hora('09:20'), 'Pasa a ' + plato.nombre + marca),
        mov(rubro, 'ingreso', 2, hora('09:20'), 'Sale de ' + row.nombre + marca)
    ];
    const pase = (tipo, cantidad, horaPase, corte = marca) => {
        const desde = tipo === 'cocido' ? 'crudo' : 'cocido';
        movs.push(mov(rubro, 'ingreso', cantidad, horaPase, 'Pasa de ' + desde + ' ' + plato.nombre + corte, tipo));
        movs.push(mov(rubro, 'ingreso', -cantidad, horaPase, 'Pasa a ' + tipo + ' ' + plato.nombre + corte, desde));
    };
    const mostrar = () => {
        app.movimientosPeriodo = movs.slice();
        app.abrirOrigenIngreso(row, 'crudo');
        return app.origenIngreso.lineas.filter((l) => l.coccion);
    };
    const texto = plato.nombre + (marca ? ' (pecho)' : '') + ' pasó de crudo a cocido';
    pase('cocido', 2, hora('09:25'));
    if (marca) pase('cocido', 3, hora('09:26'), ' · pierna');
    const coccion = mostrar().find((l) => l.texto === texto);
    expect(coccion).toMatchObject({ cantidad: 2 });
    if (id === 'pierna') {
        expect(app.origenIngreso.lineas).toContainEqual(expect.objectContaining({ salida: true, cantidad: -2 }));
    } else {
        expect(coccion.recorrido).toMatchObject([{ cantidad: 2 }, { texto, cantidad: 2 }]);
        expect(app.origenIngreso.lineas.some((l) => l.salida)).toBe(false);
    }
    expect(app.origenIngreso.total).toBe(0);
    pase('crudo', 1, hora('09:30'));
    expect(mostrar().find((l) => l.texto === texto)).toMatchObject({ cantidad: 1 });
    pase('crudo', 1, hora('09:35'));
    expect(mostrar().map((l) => l.cantidad)).toEqual(marca ? [3] : []);
    expect(app.origenIngreso.lineas).toContainEqual(expect.objectContaining({ salida: true, cantidad: -2 }));
});

test('la lupa del grupo conserva otros pases cuando uno se revierte por su identificador', () => {
    const app = crearApp();
    const pecho = app.filaReal('pechuga');
    const plato = app.filaReal('pecho_pachamanca');
    const rubro = app.claveDeFila[plato.id];
    app.movimientosPeriodo = [
        { ...mov(rubro, 'ingreso', 2, hora('09:20'), 'Pasa de crudo ' + plato.nombre, 'cocido'),
            paseId: 'primero', paseDestino: 'cocido', paseRevertido: true },
        { ...mov(rubro, 'ingreso', 2, hora('09:25'), 'Pasa de cocido ' + plato.nombre), reviertePase: 'primero' },
        { ...mov(rubro, 'ingreso', 1, hora('09:30'), 'Ingreso cocido', 'cocido'), paseId: 'historico', paseDestino: 'cocido' }
    ];
    app.abrirOrigenIngreso(pecho, 'crudo');
    expect(app.origenIngreso.lineas).toMatchObject([{ coccion: true, cantidad: 1 }]);
});

test('la lupa de Pecho resume el resultado y deja los pasos relacionados en orden de transformación', () => {
    const app = crearApp();
    const pecho = app.filaReal('pechuga');
    const plato = app.filaReal('pecho_pachamanca');
    const origen = app.claveDeFila[pecho.id];
    const destino = app.claveDeFila[plato.id];
    const movs = [
        mov(origen, 'ingreso', 2, hora('09:19'), 'Sale de Pollo fresco'),
        mov(origen, 'ingreso', -2, hora('09:20'), 'Pasa a Filete de pollo'),
        mov(origen, 'ingreso', 2, hora('09:21'), 'Pasa a Filete de pollo'),
        mov(origen, 'ingreso', -2, hora('09:22'), 'Pasa a ' + plato.nombre),
        mov(destino, 'ingreso', 2, hora('09:22'), 'Sale de ' + pecho.nombre),
        mov(destino, 'ingreso', 1, hora('09:23'), 'Pasa de crudo ' + plato.nombre, 'cocido'),
        mov(destino, 'ingreso', 1, hora('09:24'), 'Pasa de cocido ' + plato.nombre, 'crudo'),
        mov(destino, 'ingreso', 2, hora('09:25'), 'Pasa de crudo ' + plato.nombre, 'cocido')
    ];
    const abrir = () => {
        app.movimientosPeriodo = movs.slice().reverse();
        app.abrirOrigenIngreso(pecho, 'crudo');
        return app.origenIngreso.lineas;
    };
    const linea = abrir();
    expect(linea).toMatchObject([{ cantidad: 2, coccion: true, texto: 'Pecho pachamanca pasó de crudo a cocido' }]);
    expect(linea[0].recorrido).toMatchObject([
        { cantidad: 2, entrada: true, texto: 'Se transformó desde Pollo fresco' },
        { cantidad: 2, texto: expect.stringContaining('Pecho pachamanca') },
        { cantidad: 2, texto: 'Pecho pachamanca pasó de crudo a cocido' }
    ]);
    movs.push(mov(destino, 'ingreso', 1, hora('09:26'), 'Pasa de cocido ' + plato.nombre, 'crudo'));
    const parte = abrir();
    expect(parte.find((l) => l.coccion)).toMatchObject({ cantidad: 1 });
    expect(parte.find((l) => l.coccion).recorrido.map((p) => p.cantidad)).toEqual([1, 1, 1]);
    expect(parte.find((l) => !l.coccion)).toMatchObject({ cantidad: expect.any(Number), texto: expect.stringContaining('Pecho pachamanca') });
});

test('la lupa de Octavo conserva el origen de cada corte y no descuenta el cocido de otro corte', () => {
    const app = crearApp();
    const octavo = app.filaReal('octavo_pollo');
    const caldo = app.filaReal('caldo_pollo');
    const rubro = app.claveDeFila[octavo.id];
    const destino = app.claveDeFila[caldo.id];
    app.movimientosPeriodo = [
        mov(app.claveDeFila.pechuga, 'ingreso', -1, hora('08:00'), 'Pasa a ' + octavo.nombre),
        mov(rubro, 'ingreso', 2, hora('08:00'), 'Sale de Pecho de Pollo'),
        mov(app.claveDeFila.pierna, 'ingreso', -1, hora('08:01'), 'Pasa a ' + octavo.nombre),
        mov(rubro, 'ingreso', 2, hora('08:01'), 'Sale de Pierna de Pollo'),
        mov(rubro, 'ingreso', -2, hora('08:02'), 'Pasa a ' + caldo.nombre + ' · pecho'),
        mov(destino, 'ingreso', 2, hora('08:02'), 'Sale de ' + octavo.nombre + ' · pecho'),
        mov(rubro, 'ingreso', -2, hora('08:03'), 'Pasa a ' + caldo.nombre + ' · pierna'),
        mov(destino, 'ingreso', 2, hora('08:03'), 'Sale de ' + octavo.nombre + ' · pierna'),
        mov(destino, 'ingreso', 2, hora('08:04'), 'Pasa de crudo ' + caldo.nombre + ' · pecho', 'cocido'),
        mov(destino, 'ingreso', 2, hora('08:05'), 'Pasa de crudo ' + caldo.nombre + ' · pierna', 'cocido'),
        mov(destino, 'ingreso', 1, hora('08:06'), 'Pasa de cocido ' + caldo.nombre + ' · pierna')
    ].reverse();
    app.abrirOrigenIngreso(octavo, 'crudo');
    const pasoPecho = app.origenIngreso.lineas.find((l) => l.coccion && l.texto.includes('(pecho)'));
    const pasoPierna = app.origenIngreso.lineas.find((l) => l.coccion && l.texto.includes('(pierna)'));
    expect(pasoPecho).toMatchObject({ cantidad: 2, recorrido: [
        { texto: 'Se transformó desde Pecho de Pollo', cantidad: 2 },
        { cantidad: 2 },
        { cantidad: 2 }
    ] });
    expect(pasoPierna).toMatchObject({ cantidad: 1, recorrido: [
        { texto: 'Se transformó desde Pierna de Pollo', cantidad: 1 },
        { cantidad: 1 },
        { cantidad: 1 }
    ] });
});

test('la lupa deja separado un pase sin la entrada registrada en el destino', () => {
    const app = crearApp();
    const pecho = app.filaReal('pechuga');
    const plato = app.filaReal('pecho_pachamanca');
    const rubro = app.claveDeFila[pecho.id];
    app.movimientosPeriodo = [
        mov(rubro, 'ingreso', 2, hora('09:19'), 'Sale de Pollo fresco'),
        mov(rubro, 'ingreso', -2, hora('09:20'), 'Pasa a ' + plato.nombre),
        mov(app.claveDeFila[plato.id], 'ingreso', 2, hora('09:21'), 'Pasa de crudo ' + plato.nombre, 'cocido')
    ];
    app.abrirOrigenIngreso(pecho, 'crudo');
    expect(app.origenIngreso.lineas).toHaveLength(3);
    expect(app.origenIngreso.lineas.every((l) => !l.recorrido)).toBe(true);
    expect(app.origenIngreso.lineas.map((l) => app.cantidadOrigenIngreso(l))).toEqual(['2', '2', '+2']);
});

test('el recorrido de Pecho respeta que una pieza se transforma en dos octavos', () => {
    const app = crearApp();
    const pecho = app.filaReal('pechuga');
    const octavo = app.filaReal('octavo_pollo');
    const caldo = app.filaReal('caldo_pollo');
    const clavePecho = app.claveDeFila[pecho.id];
    const claveOctavo = app.claveDeFila[octavo.id];
    const claveCaldo = app.claveDeFila[caldo.id];
    app.movimientosPeriodo = [
        mov(clavePecho, 'ingreso', 2, hora('08:00'), 'Sale de Pollo fresco'),
        mov(clavePecho, 'ingreso', -1, hora('08:01'), 'Pasa a ' + octavo.nombre),
        mov(claveOctavo, 'ingreso', 2, hora('08:01'), 'Sale de Pecho de Pollo'),
        mov(claveOctavo, 'ingreso', -2, hora('08:02'), 'Pasa a ' + caldo.nombre + ' · pecho'),
        mov(claveCaldo, 'ingreso', 2, hora('08:02'), 'Sale de ' + octavo.nombre + ' · pecho'),
        mov(claveCaldo, 'ingreso', 2, hora('08:03'), 'Pasa de crudo ' + caldo.nombre + ' · pecho', 'cocido')
    ];
    app.abrirOrigenIngreso(pecho, 'crudo');
    expect(app.origenIngreso.lineas).toHaveLength(2);
    expect(app.origenIngreso.lineas.find((l) => l.entrada)).toMatchObject({ cantidad: 1 });
    const coccion = app.origenIngreso.lineas.find((l) => l.coccion);
    expect(coccion.cantidad).toBe(2);
    expect(coccion.recorrido.map((l) => l.cantidad)).toEqual([1, 2, 2, 2]);
});

test('el recorrido de Octavo enlaza una separación de Beata y conserva el ingreso directo a Personal aparte', () => {
    const app = crearApp();
    const octavo = app.filaReal('octavo_pollo');
    const rubro = app.claveDeFila[octavo.id];
    app.movimientosPeriodo = [
        mov(rubro, 'ingreso', 4, hora('08:00'), 'Sale de Pecho de Pollo'),
        mov(rubro, 'regulacion', -2, hora('08:01'), 'Separado · Beata · pecho'),
        mov(rubro, 'ingreso', 1, hora('08:02'), 'Ingreso independiente crudo · Sector Personal · pecho'),
        mov(rubro, 'regulacion', -1, hora('08:02'), 'Separado · Personal · pecho')
    ];
    app.abrirOrigenIngreso(octavo, 'crudo');
    const { lineas } = app.origenIngreso;
    expect(lineas.find((l) => l.entrada)).toMatchObject({ texto: 'Se transformó desde Pecho de Pollo', cantidad: 2 });
    expect(lineas.find((l) => l.sector === 'Personal')).toMatchObject({ clase: 'ingreso', cantidad: 1 });
    const beata = lineas.find((l) => l.recorrido);
    expect(beata).toMatchObject({ texto: 'Se transformó 2 octavos de pecho a Beata', cantidad: 2 });
    expect(beata.recorrido.map((l) => l.cantidad)).toEqual([2, 2]);
});

test('la tabla abre en Personalizado y conserva los órdenes guardados antes de arrastrar', () => {
    const app = crearApp({ 'inventario-orden-personal': '["pierna","pechuga"]' });
    expect(app.ordenHoja).toBe('personalizado');
    app.cargarOrdenPersonal();
    expect(app.idsOrdenHoja('g-pollo/pollo_fresco').slice(0, 2)).toEqual(['pierna', 'pechuga']);
});

test('arrastrar un grupo frente a una fila suelta conserva sus miembros y su posición al recargar', () => {
    const store = {};
    const app = crearApp(store);
    const filasArroz = app.bloquesHoja().find((b) => b.key === 'g-arroz').filas.map((f) => f.row.id);
    expect(filasArroz).toContain('arroz_blanco');
    expect(app.moverOrdenHoja('hoja', 'bloque:g-arroz', 'bloque:s-papas', true)).toBe(true);
    const recargada = crearApp(store);
    recargada.cargarOrdenPersonal();
    const bloques = recargada.bloquesHoja();
    const posicion = bloques.findIndex((b) => b.key === 's-papas');
    expect(bloques[posicion + 1].key).toBe('g-arroz');
    expect(bloques[posicion + 1].filas.map((f) => f.row.id)).toEqual(filasArroz);
});

test('reordenar Pierna conserva Pollada y permite mover solo entre filas del mismo nivel', () => {
    const app = crearApp();
    const movimientos = [mov('pierna-pollo', 'ingreso', 8, horaAyer('09:00')), mov('pollada', 'ingreso', 4, hora('09:00'))];
    const ventas = [{ rubro: 'pollada', nombre: 'Pollada', cantidad: 2, fecha: hora('13:00'), detalle: [] }];
    pintar(app, movimientos, ventas);
    const datos = () => JSON.stringify([app.rows, app.arbolPollo, app.movimientosPeriodo, app.ventasPeriodo]);
    const antes = datos();
    const pierna = app.filaReal('pierna');
    app.api = jest.fn();

    expect(app.moverOrdenHoja('g-pollo/pollo_fresco', 'pierna', 'pechuga', false)).toBe(true);
    expect(app.idsOrdenHoja('g-pollo/pollo_fresco').slice(0, 2)).toEqual(['pierna', 'pechuga']);
    expect(app.miembrosGrupo(pierna).map((row) => row.id)).toContain('pollada');
    expect(app.moverOrdenHoja('g-pollo/pollo_fresco', 'pierna', 'arroz_blanco', true)).toBe(false);
    expect(app.quedaGrupo(pierna)).toBe(10);
    expect(app.ventaGrupo(pierna)).toBe(2);
    expect(datos()).toBe(antes);
    expect(app.api).not.toHaveBeenCalled();
});

test('la hoja y el servidor usan la misma regla de cocido en todas las filas', () => {
    const app = crearApp();
    const opciones = [{ clave: 'sandwiches', tieneCocido: true, reservaClave: 'pechuga-pollo' }, { clave: 'milanesa', tieneCocido: true, reservaClave: 'filete' }];
    app.aplicarOpcionesCocido(opciones);
    app.rows.forEach((row) => {
        const clave = app.claveDeFila[row.id];
        if (!clave) return;
        const op = opciones.find((o) => o.clave === clave);
        expect([clave, perfilRubro(clave, op)]).toEqual([clave, { tieneCocido: !!row.tieneCocido, soloCocido: !!row.soloCocido }]);
        expect([clave, esStockGeneral(clave)]).toEqual([clave, app.esVentaStockGeneral(clave)]);
        expect(semillaCocido(clave).tieneCocido).toBe(app.opcionCocidoDe(clave).tieneCocido);
    });
});

test('la hoja normaliza las ventas igual que el servidor', () => {
    const app = crearApp();
    [
        { rubro: 'filete-pollo', cantidad: 2, tipoProducto: 'crudo', nombre: 'Filete' },
        { rubro: 'filete-junior', cantidad: 1, tipoProducto: 'crudo', nombre: 'Filete junior', sinSaldo: true },
        { rubro: 'arroz-blanco', cantidad: 3, tipoProducto: 'crudo', nombre: 'Arroz' },
        { rubro: 'milanesa-junior', cantidad: 1, tipoProducto: 'crudo', nombre: 'Milanesa junior' },
        { rubro: 'filete', cantidad: 1, tipoProducto: 'crudo', nombre: 'Milanesa junior', detalle: [{ nombre: 'Milanesa junior', platos: 1 }] }
    ].forEach((v) => {
        expect(JSON.parse(JSON.stringify(app.ventaKardexNormalizada(v)))).toEqual(normalizarVenta(v));
    });
});

test('«Hoy» es el día operativo también después de medianoche', () => {
    const app = crearApp();
    expect(app.ymdOperativo(new Date('2026-11-18T02:30:00-05:00'))).toBe('2026-11-17');
    expect(app.ymdOperativo('2026-11-18T05:30:00-05:00')).toBe('2026-11-18');
    app.ymdOperativo = () => '2026-11-17';
    expect(app.fechaHoy()).toBe('2026-11-17');
    expect(app.rangoDe('hoy')).toEqual({ desde: '2026-11-17', hasta: '2026-11-17' });
    expect(app.rangoDe('ayer')).toEqual({ desde: '2026-11-16', hasta: '2026-11-16' });
});

test('cada fila cuadra sola y el grupo va aparte', () => {
    const app = crearApp();
    const movs = [
        mov('pierna-pollo', 'ingreso', 10, horaAyer('10:00')),
        mov('pollada', 'ingreso', 4, horaAyer('10:00')),
        mov('pierna-pollo', 'ingreso', 5, hora('10:00')),
        mov('pierna-pollo', 'ingreso', -3, hora('11:00'), 'Pasa a Pollada'),
        mov('pollada', 'ingreso', 3, hora('11:00'), 'Sale de Pierna de Pollo')
    ];
    pintar(app, movs, [{ rubro: 'pollada', nombre: 'Pollada', cantidad: 2, fecha: hora('13:00'), detalle: [] }]);
    const pierna = app.filaReal('pierna');
    expect(app.saldoAnteriorColumna(pierna)).toBe(10);
    expect(app.valorTipo(pierna, 'ingreso', 'crudo')).toBe(5);
    expect(app.ingresoTotalColumna(pierna)).toBe(12);
    expect(app.saldoRealColumna(pierna)).toBe(12);
    expect(app.stockCuadro('pierna', 'crudo')).toBe(12);
    expect(app.tieneGrupo(pierna)).toBe(true);
    expect(app.saldoAnteriorGrupo(pierna)).toBe(14);
    expect(app.ingresoTotalGrupo(pierna)).toBe(19);
    expect(app.quedaGrupo(pierna)).toBe(17);
    expect(app.ventaColumna(pierna)).toBe(0);
    expect(app.ventaGrupo(pierna)).toBe(2);
});

test('un día sin datos deja la fila en 0 en vez de repetir el período anterior', () => {
    const app = crearApp();
    pintar(app, [mov('cuy', 'ingreso', 5, hora('10:00'))]);
    expect(app.saldoRealColumna(app.filaReal('cuy'))).toBe(5);
    app.claveDeFila.cuy = 'cuy-sin-datos';
    app.aplicarKardex([], [], []);
    expect(app.saldoRealColumna(app.filaReal('cuy'))).toBe(0);
});

test('Pierna no junta el cocido de pachamanca dentro del crudo', () => {
    const app = crearApp();
    pintar(app, [
        mov('pachamanca-pollo', 'ingreso', 30, horaAyer('09:00'), 'Ingreso inicial', 'crudo'),
        mov('pachamanca-pollo', 'ingreso', 33, horaAyer('09:00'), 'Ingreso inicial', 'cocido')
    ]);
    const pierna = app.filaReal('pierna');
    const pacha = app.filaReal('pollo_pachamanca');
    expect(pacha).toMatchObject({ saldoAnterior: 30, saldoAnteriorCocido: 33, tieneCocido: true });
    expect(pierna.tieneCocido).toBeFalsy();
    const fila = app.documentoImpresionHoja().match(/<tr class="fila[^"]*">(?:(?!<\/tr>).)*>Pierna de Pollo<(?:(?!<\/tr>).)*<\/tr>/)[0];
    expect(fila).not.toMatch(/Cocido/);
    expect(fila).toMatch(/<span class="v">63<\/span>/);
});

test('el grupo de Pierna cuenta el pase a Pollada una sola vez', () => {
    const app = crearApp();
    pintar(app, [
        mov('pachamanca-pollo', 'ingreso', 53, horaAyer('09:00')),
        mov('pierna-lena', 'ingreso', 32, horaAyer('09:00')),
        mov('pollada', 'ingreso', 12, horaAyer('09:00')),
        mov('pierna-pollo', 'ingreso', 40, hora('09:00'), 'Ingreso independiente crudo'),
        mov('pierna-pollo', 'ingreso', -40, hora('10:00'), 'Pasa a Pollada'),
        mov('pollada', 'ingreso', 40, hora('10:00'), 'Sale de Pierna de Pollo')
    ]);
    const pierna = app.filaReal('pierna');
    const pollada = app.filaReal('pollada');
    expect(app.cifraGrupo(pierna, 'saldoAnterior')).toBe(97);
    expect(app.cifraIngresoTabla(pierna, 'ingreso')).toBe(40);
    expect(app.ingresoTotalColumna(pierna)).toBe(0);
    expect(app.cifraIngresoTabla(pierna, 'ingresoTotal')).toBe(137);
    expect(app.cifraIngresoTabla(pierna, 'ingresoTotal', 'crudo')).toBe(137);
    expect(app.cifraIngresoTabla(pollada, 'ingresoTotal')).toBe(52);
    expect(app.stockCuadro('pierna', 'crudo')).toBe(0);
    expect(app.stockCuadro('pollada', 'crudo')).toBe(52);
    app.abrirOrigenIngreso(pierna, 'crudo');
    expect(app.origenIngreso).toMatchObject({ total: 40, anotado: 40, transformado: 0 });
    expect(app.origenIngreso.lineas).toContainEqual(expect.objectContaining({ salida: true, texto: 'Pasa a Pollada', cantidad: -40 }));
    app.abrirDesgloseGrupo(pierna, 'ingresoTotal');
    expect(app.desgloseGrupo.total).toBe(137);
    expect(app.desgloseGrupo.filas[0]).toMatchObject({ id: 'pierna', total: 0 });
    const filaImpresa = app.documentoImpresionHoja().match(/<tr class="fila[^"]*">(?:(?!<\/tr>).)*>Pierna de Pollo<(?:(?!<\/tr>).)*<\/tr>/)[0];
    expect([...filaImpresa.matchAll(/<span class="v">(\d+)<\/span>/g)]
        .map((m) => m[1])).toEqual(['97', '40', '137']);
});

test.each([
    ['pechuga', 'pollo_lena', 'pecho'],
    ['pierna', 'pierna_lena', 'pierna']
])('%s queda en cero al pasar a Octavo y su grupo conserva los 30 crudos y 21 cocidos a la leña', (id, idLena, corte) => {
    const app = crearApp();
    const origen = app.filaReal(id);
    const lena = app.filaReal(idLena);
    const octavo = app.filaReal('octavo_pollo');
    pintar(app, [
        mov(app.claveDeFila[id], 'ingreso', 30, hora('09:00'), 'Ingreso independiente crudo'),
        mov(app.claveDeFila[idLena], 'ingreso', 30, hora('09:00'), 'Ingreso independiente crudo'),
        mov(app.claveDeFila[idLena], 'ingreso', 21, hora('09:00'), 'Ingreso independiente cocido', 'cocido'),
        mov(app.claveDeFila[id], 'ingreso', -30, hora('10:00'), 'Pasa a Octavo de pollo'),
        mov(app.claveDeFila[octavo.id], 'ingreso', 60, hora('10:00'), 'Sale de ' + origen.nombre + ' · ' + corte)
    ]);
    expect(app.ingresoTotalColumna(origen)).toBe(0);
    expect(app.cifraIngresoTabla(origen, 'ingresoTotal')).toBe(51);
    expect(app.cifraIngresoTabla(origen, 'ingresoTotal', 'crudo')).toBe(30);
    expect(app.cifraIngresoTabla(origen, 'ingresoTotal', 'cocido')).toBe(21);
    expect(app.cifraIngresoTabla(octavo, 'ingresoTotal')).toBe(60);
    app.abrirDesgloseGrupo(origen, 'ingresoTotal');
    expect(app.desgloseGrupo.total).toBe(51);
    expect(app.desgloseGrupo.filas.find((f) => f.id === id)).toMatchObject({ total: 0 });
    expect(app.desgloseGrupo.filas.find((f) => f.id === lena.id)).toMatchObject({ crudo: 30, cocido: 21, total: 51 });
});

test('Pecho devuelve al origen únicamente lo revertido y conserva las ventas como salida posterior', () => {
    const app = crearApp();
    const pecho = app.filaReal('pechuga');
    const lena = app.filaReal('pollo_lena');
    const clavePecho = app.claveDeFila[pecho.id];
    const claveLena = app.claveDeFila[lena.id];
    const movimientos = [
        mov(clavePecho, 'ingreso', 30, hora('09:00'), 'Ingreso independiente crudo'),
        mov(clavePecho, 'ingreso', -30, hora('10:00'), 'Pasa a Pecho a la Leña'),
        mov(claveLena, 'ingreso', 30, hora('10:00'), 'Sale de Pecho de Pollo')
    ];
    pintar(app, movimientos);
    expect(app.ingresoTotalColumna(pecho)).toBe(0);
    expect(app.cifraIngresoTabla(pecho, 'ingresoTotal')).toBe(30);
    expect(app.cifraIngresoTabla(lena, 'ingresoTotal', 'crudo')).toBe(30);
    app.abrirOrigenIngreso(pecho, 'crudo');
    expect(app.origenIngreso.lineas).toContainEqual(expect.objectContaining({ salida: true, cantidad: -30 }));

    movimientos.push(
        mov(clavePecho, 'ingreso', 6, hora('11:00'), 'Pasa a Pecho a la Leña'),
        mov(claveLena, 'ingreso', -6, hora('11:00'), 'Sale de Pecho de Pollo'),
        mov(clavePecho, 'egreso', 2, hora('12:00'), 'Venta manual')
    );
    pintar(app, movimientos);
    expect(app.ingresoTotalColumna(pecho)).toBe(6);
    expect(app.cifraIngresoTabla(pecho, 'ingresoTotal')).toBe(30);
    expect(app.cifraIngresoTabla(lena, 'ingresoTotal', 'crudo')).toBe(24);
    expect(app.construirProcedimientoSaldoReal(pecho)).toMatchObject({
        ingresoTotal: 6, transformacion: 24, ventas: 2, quedaSaldoReal: 4, cuadra: true
    });
});

test('la conversión de arroz descuenta kilos del origen y conserva las porciones en su destino', () => {
    const app = crearApp();
    const arroz = app.filaReal('arroz');
    const blanco = app.filaReal('arroz_blanco');
    const crudo = app.claveDeFila[arroz.id];
    const cocido = app.claveDeFila[blanco.id];
    pintar(app, [
        mov(crudo, 'ingreso', 2, horaAyer('09:00')),
        mov(crudo, 'ingreso', -0.625, hora('11:00'), 'Pasa a Arroz blanco'),
        mov(cocido, 'ingreso', 5, hora('11:00'), 'Sale de Arroz crudo', 'cocido')
    ]);
    expect(app.cifraIngresoTabla(arroz, 'ingresoTotal')).toBe(1.375);
    expect(app.cifraIngresoTabla(blanco, 'ingresoTotal')).toBe(5);
    expect(app.construirProcedimientoSaldoReal(arroz)).toMatchObject({ ingresoTotal: 1.375, quedaSaldoReal: 1.375, cuadra: true });
});

test('la impresión respeta las columnas, los indicadores y las filas ocultas de la configuración', () => {
    const app = crearApp();
    pintar(app, [mov('pierna-pollo', 'ingreso', 40, hora('09:00'))]);
    const apertura = ['Producto', 'Saldo anterior', 'Ingreso'];
    const ingresoVenta = ['Ingreso total', 'Venta comandas'];
    const queda = 'Queda (saldo real)';
    const revisar = (esperadas, anchos) => {
        const impreso = app.documentoImpresionHoja();
        const titulos = impreso.match(/<tr class="sub">(.*?)<\/tr>/)[1];
        expect([...titulos.matchAll(/<th>(.*?)<\/th>/g)].map((m) => m[1])).toEqual(esperadas);
        const bandas = impreso.match(/<tr class="sup">(.*?)<\/tr>/)[1];
        expect([...bandas.matchAll(/colspan="(\d+)"/g)].map((m) => Number(m[1]))).toEqual(anchos);
        expect(impreso.match(/<col /g)).toHaveLength(esperadas.length);
        const grupos = [...impreso.matchAll(/<tr class="grupo"><td colspan="(\d+)"/g)];
        expect(grupos.length).toBeGreaterThan(0);
        grupos.forEach((m) => expect(Number(m[1])).toBe(esperadas.length));
        const filas = [...impreso.matchAll(/<tr class="fila[^"]*">(.*?)<\/tr>/g)];
        expect(filas.length).toBeGreaterThan(0);
        filas.forEach((m) => expect(m[1].match(/<td /g)).toHaveLength(esperadas.length));
        return impreso;
    };

    const ocultas = revisar([...apertura, ...ingresoVenta, queda], [2, 2, 1, 1]);
    expect(ocultas).not.toContain('Transformación');
    expect(ocultas).not.toContain('↑+40');
    expect(ocultas).not.toMatch(/>(Pollo|Pato) fresco</i);

    app.setOcultarSaldoYConteo(false);
    app.setOcultarEstado(false);
    app.setOcultarMasMenosIngreso(false);
    app.setOcultarPolloFresco(false);
    app.cargarVistaTablaLocal();
    const mixtas = revisar([...apertura, ...ingresoVenta, 'Saldo', 'Conteo', queda, 'Estado'], [2, 2, 1, 4]);
    expect(mixtas).toContain('↑+40');
    expect(mixtas).toMatch(/>Pollo fresco</i);
    expect(mixtas).not.toMatch(/>Pato fresco</i);

    app.setOcultarCorreccion(false);
    app.setOcultarTransformacion(false);
    app.setOcultarDiferencia(false);
    revisar([...apertura, 'Corrección', ...ingresoVenta, 'Transformación', 'Saldo', 'Conteo', queda, 'Diferencia', 'Estado'], [2, 3, 2, 5]);
});

test('la impresión incluye el stock propio y los platos con stock debajo de su grupo', () => {
    const app = crearApp();
    app.aplicarOpcionesCocido([{ clave: 'pollada', tieneCocido: true }]);
    pintar(app, [
        mov('pierna-pollo', 'ingreso', 3, hora('09:00')),
        mov('pollada', 'ingreso', 7, hora('09:00')),
        mov('pollada', 'ingreso', 2, hora('09:00'), 'Ingreso independiente cocido', 'cocido'),
        mov('pachamanca-pollo', 'ingreso', 4, hora('09:00'))
    ]);
    app.tableGroups.find((g) => g.id === 'pollo').open = false;
    const pierna = app.filaReal('pierna');
    expect(app.quedaGrupo(pierna)).toBe(16);
    const impreso = app.documentoImpresionHoja();
    const detalle = impreso.match(/<tr class="fila[^\"]*">(?:(?!<\/tr>).)*>Pierna de Pollo<(?:(?!<\/tr>).)*<\/tr>(<tr class="detalle-stock">.*?<\/tr>)/)[1];
    expect(detalle).toContain('Pierna de Pollo (propia)');
    expect(detalle).toMatch(/Pollada<.*?Crudo 7<.*?Cocido 2</);
    expect(detalle).toMatch(/Pollo pachamanca pierna<.*?Macerado 4</i);
    expect(detalle).not.toMatch(/Pierna a la Leña|Cocido 0|Crudo 0/i);
});

test('el reporte cuenta el producto final con su tipo y corte, y descarta pases deshechos', () => {
    const app = crearApp();
    const reporte = [
        mov('octavo-pollo', 'ingreso', 146, hora('04:00'), 'Saldo anterior · pierna'),
        mov('octavo-pollo', 'ingreso', 30, hora('04:00'), 'Ajuste apertura · Editar stock · pecho'),
        mov('octavo-pollo', 'ingreso', -2, hora('08:00'), 'Pasa a Caldo de pollo'),
        mov('caldo-pollo', 'ingreso', 2, hora('08:00'), 'Pasa a Caldo de pollo · pierna'),
        mov('pierna-pollo', 'ingreso', 40, hora('09:00'), 'Ingreso independiente crudo'),
        mov('pierna-pollo', 'ingreso', -40, hora('09:30'), 'Pasa a Pollada'),
        mov('pollada', 'ingreso', 40, hora('09:30'), 'Sale de Pierna de Pollo'),
        mov('pechuga-pollo', 'ingreso', 5, hora('10:00'), 'Ingreso independiente crudo'),
        mov('pechuga-pollo', 'ingreso', -3, hora('10:30'), 'Pasa a Octavo de pollo'),
        mov('octavo-pollo', 'ingreso', 6, hora('10:30'), 'Sale de Pecho de Pollo'),
        mov('pierna-pollo', 'ingreso', -2, hora('11:00'), 'Pasa a Octavo de pollo'),
        mov('octavo-pollo', 'ingreso', 4, hora('11:00'), 'Viene de Pierna de Pollo · pierna'),
        mov('octavo-pollo', 'ingreso', -4, hora('11:30'), 'Pasa a Arroz con pollo · pecho'),
        mov('arroz-pollo', 'ingreso', 4, hora('11:30'), 'Sale de Octavo de pollo · pecho'),
        mov('arroz-pollo', 'ingreso', -2, hora('12:00'), 'Pasa a cocido Arroz con pollo · pecho'),
        mov('arroz-pollo', 'ingreso', 2, hora('12:00'), 'Pasa de crudo Arroz con pollo · pecho', 'cocido'),
        mov('pechuga-pollo', 'ingreso', -1, hora('13:00'), 'Pasa a Sandwich'),
        mov('sandwiches', 'ingreso', 1, hora('13:00'), 'Sale de Pecho de Pollo', 'cocido'),
        mov('pechuga-pollo', 'ingreso', -1, hora('14:00'), 'Pasa a Pecho a la Leña'),
        mov('pollo-lena', 'ingreso', 1, hora('14:00'), 'Sale de Pecho de Pollo'),
        mov('pechuga-pollo', 'ingreso', 1, hora('14:01'), 'Pasa a Pecho a la Leña'),
        mov('pollo-lena', 'ingreso', -1, hora('14:01'), 'Sale de Pecho de Pollo'),
        mov('pollada', 'ingreso', 1, hora('15:00'), 'Ingreso independiente cocido', 'cocido'),
        mov('pollada', 'ingreso', -1, hora('15:01'), 'Ingreso independiente cocido', 'cocido')
    ];
    app.reporteDiaVista = app.vistaReporteHoja({}, reporte.reverse());
    const filas = app.filasReporteIngreso();
    const pierna = filas.find((f) => f.clave === 'pierna-pollo');
    expect(pierna.ingreso).toBe(40);
    expect(pierna.lineas).toMatchObject([{ nombre: 'Pollada', tipo: 'Crudo', detalle: 'Desde Pierna de Pollo', cantidad: 40 }]);
    const pecho = filas.find((f) => f.clave === 'pechuga-pollo');
    expect(pecho.ingreso).toBe(2);
    expect(pecho.lineas).toMatchObject([{ clave: 'pechuga-pollo', cantidad: 1 }, { clave: 'sandwiches', tipo: 'Cocido', cantidad: 1 }]);
    const octavo = filas.find((f) => f.clave === 'octavo-pollo');
    expect(octavo.ingreso).toBe(12);
    expect(octavo.lineas).toEqual(expect.arrayContaining([
        expect.objectContaining({ clave: 'arroz-pollo', tipo: 'Crudo', corte: 'Pecho', detalle: 'Desde Octavo de pollo', cantidad: 2 }),
        expect.objectContaining({ clave: 'arroz-pollo', tipo: 'Cocido', corte: 'Pecho', detalle: 'Desde crudo', cantidad: 2 }),
        expect.objectContaining({ clave: 'caldo-pollo', corte: 'Pierna', detalle: 'Desde Octavo de pollo', cantidad: 2 }),
        expect.objectContaining({ clave: 'octavo-pollo', corte: 'Pecho', detalle: 'Desde Pecho de Pollo', cantidad: 2 }),
        expect.objectContaining({ clave: 'octavo-pollo', corte: 'Pierna', detalle: 'Desde Pierna de Pollo', cantidad: 4 })
    ]));
    expect(app.totalReporteIngreso()).toBe(54);
    expect(filas.map((f) => f.clave)).toHaveLength(3);
});

test('un pase o un ingreso revertido no entra al reporte ni a la lupa', () => {
    const app = crearApp();
    const pato = app.claveDeFila.pechuga_pato;
    const baby = app.claveDeFila.pollo_baby;
    const pecho = app.claveDeFila.pechuga;
    const pacha = app.claveDeFila.pecho_pachamanca;
    const sandwich = app.claveDeFila.sandwich;
    const ida = (rubro, nombre, n, fecha) => [
        mov(rubro, 'ingreso', n, fecha, 'Pasa de crudo ' + nombre, 'cocido'),
        mov(rubro, 'ingreso', -n, fecha, 'Pasa a cocido ' + nombre)
    ];
    const vuelta = (rubro, nombre, n, fecha) => [
        mov(rubro, 'ingreso', n, fecha, 'Pasa de cocido ' + nombre),
        mov(rubro, 'ingreso', -n, fecha, 'Pasa a crudo ' + nombre, 'cocido')
    ];
    const movimientos = [
        mov(pato, 'ingreso', 2, hora('08:00'), 'Sale de Pato fresco'),
        mov(pato, 'ingreso', -2, hora('08:05'), 'Sale de Pato fresco'),
        ...ida(pato, 'Pecho de Pato', 1, hora('08:10')),
        ...vuelta(pato, 'Pecho de Pato', 1, hora('08:11')),
        mov(baby, 'ingreso', 10, hora('09:00'), 'Ingreso crudo'),
        mov(baby, 'ingreso', -10, hora('09:01'), 'Ingreso crudo'),
        ...ida(baby, 'Pollo Baby', 1, hora('09:02')),
        ...vuelta(baby, 'Pollo Baby', 1, hora('09:03')),
        mov(pecho, 'ingreso', -2, hora('10:00'), 'Pasa a Pecho pachamanca'),
        mov(pacha, 'ingreso', 2, hora('10:00'), 'Sale de Pecho de Pollo'),
        ...ida(pacha, 'Pecho pachamanca', 2, hora('10:01')),
        ...vuelta(pacha, 'Pecho pachamanca', 2, hora('10:02')),
        mov(pecho, 'ingreso', 2, hora('10:03'), 'Pasa a Pecho pachamanca'),
        mov(pacha, 'ingreso', -2, hora('10:03'), 'Sale de Pecho de Pollo'),
        mov(pecho, 'ingreso', 5, hora('11:00'), 'Ingreso independiente crudo'),
        mov(pecho, 'ingreso', -5, hora('11:01'), 'Pasa a Sandwich'),
        mov(sandwich, 'ingreso', 5, hora('11:01'), 'Sale de Pecho de Pollo', 'cocido'),
        mov(pecho, 'ingreso', 3, hora('11:02'), 'Pasa a Sandwich'),
        mov(sandwich, 'ingreso', -3, hora('11:02'), 'Sale de Pecho de Pollo', 'cocido'),
        mov(pecho, 'ingreso', -5, hora('11:03'), 'Ingreso independiente crudo'),
        mov(pecho, 'ingreso', 2, hora('11:04'), 'Ingreso independiente crudo'),
        ...ida(sandwich, 'Sandwich', 2, hora('11:11')),
        ...vuelta(sandwich, 'Sandwich', 2, hora('11:12')),
        mov(sandwich, 'ingreso', 2, hora('11:20'), 'Ingreso independiente cocido', 'cocido'),
        mov('pollada', 'ingreso', 4, hora('12:00'), 'Sale de Pierna de Pollo'),
        ...ida('pollada', 'Pollada', 3, hora('12:10')),
        ...vuelta('pollada', 'Pollada', 1, hora('12:11'))
    ];
    app.reporteDiaVista = app.vistaReporteHoja({}, movimientos.slice().reverse());
    const filas = app.filasReporteIngreso();
    expect(filas.find((f) => f.clave === pato)).toBeUndefined();
    expect(filas.find((f) => f.clave === baby)).toBeUndefined();
    const grupo = filas.find((f) => f.clave === pecho);
    expect(grupo.ingreso).toBe(4);
    expect(grupo.lineas).toEqual(expect.arrayContaining([
        expect.objectContaining({ clave: sandwich, tipo: 'Cocido', detalle: 'Desde Pecho de Pollo', cantidad: 2 }),
        expect.objectContaining({ clave: sandwich, tipo: 'Cocido', detalle: 'Ingreso directo', cantidad: 2 })
    ]));
    expect(grupo.lineas.some((l) => l.clave === pecho)).toBe(false);
    expect(grupo.lineas.some((l) => l.clave === pacha || /Desde cocido/.test(l.detalle))).toBe(false);
    const pollada = filas.flatMap((f) => f.lineas).filter((l) => l.clave === 'pollada');
    expect(pollada.reduce((a, l) => a + l.cantidad, 0)).toBe(4);
    expect(pollada).toEqual(expect.arrayContaining([
        expect.objectContaining({ tipo: 'Crudo', detalle: 'Desde Pierna de Pollo', cantidad: 2 }),
        expect.objectContaining({ tipo: 'Cocido', detalle: 'Desde crudo', cantidad: 2 })
    ]));

    app.movimientosPeriodo = movimientos;
    app.abrirOrigenIngreso(app.filaReal('pechuga_pato'), 'crudo');
    expect(app.origenIngreso.lineas).toEqual([]);
    app.abrirOrigenIngreso(app.filaReal('pollo_baby'), 'crudo');
    expect(app.origenIngreso.lineas).toEqual([]);
    app.abrirOrigenIngreso(app.filaReal('pecho_pachamanca'), 'crudo');
    expect(app.origenIngreso.lineas).toEqual([]);
    app.aplicarOpcionesCocido([{ clave: 'pollada', tieneCocido: true }]);
    app.abrirOrigenIngreso(app.filaReal('pollada'), 'cocido');
    expect(app.origenIngreso.lineas).toEqual([
        expect.objectContaining({ cantidad: 2, texto: expect.stringMatching(/Pasa de crudo/) })
    ]);
});

test('un pase de tira de panceta a pieza queda fuera de Ingreso y aparece una vez en el detalle y el reporte', () => {
    const app = crearApp();
    const movimientos = [
        mov('tira-panceta', 'ingreso', 6, hora('08:00'), 'Sale de Panceta', 'cocido'),
        mov('tira-panceta', 'ingreso', -4, hora('09:00'), 'Pasa a trozos', 'cocido'),
        mov('trozo-panceta', 'ingreso', 4, hora('09:00'), 'Sale de Tira de panceta', 'cocido')
    ];
    pintar(app, movimientos);
    const tira = app.filaReal('tira_panceta');
    const pieza = app.filaReal('trozo_panceta');
    expect(app.cifraIngresoTabla(tira, 'ingreso')).toBe(0);
    expect(app.cifraIngresoTabla(pieza, 'ingreso')).toBe(0);
    expect(app.stockCuadro(pieza.id, 'cocido')).toBe(4);
    expect(app.origenIngresoDe(tira, 'cocido', true).lineas).toEqual(expect.arrayContaining([
        expect.objectContaining({ clase: 'transformacion', salida: true, cantidad: -4 })
    ]));
    expect(app.origenIngresoDe(pieza).lineas).toMatchObject([{ clase: 'transformacion', cantidad: 4 }]);
    app.reporteDiaVista = app.vistaReporteHoja({}, movimientos.slice().reverse());
    expect(app.totalReporteIngreso()).toBe(6);
});

test('el reporte resta el origen de un pase antiguo de crudo a cocido', () => {
    const app = crearApp();
    app.reporteDiaVista = app.vistaReporteHoja({}, [
        mov('pollada', 'ingreso', 4, hora('08:00'), 'Sale de Pierna de Pollo'),
        mov('pollada', 'ingreso', -4, hora('09:00'), 'Cocido desde crudo Pollada'),
        mov('pollada', 'ingreso', 4, hora('09:00'), 'Ingreso cocido', 'cocido')
    ]);
    expect(app.totalReporteIngreso()).toBe(4);
    expect(app.filasReporteIngreso().flatMap((f) => f.lineas)).toMatchObject([
        { clave: 'pollada', tipo: 'Cocido', cantidad: 4 }
    ]);
});

test('Queda y su detalle muestran el mismo faltante de una venta manual', () => {
    const app = crearApp();
    pintar(app, [mov('cuy', 'egreso', 1, hora('08:00'), 'Venta manual')]);
    const cuy = app.filaReal('cuy');
    expect(app.textoQuedaCelda(cuy)).toBe('No hay stock (1)');
    app.abrirModalProcedimientoSaldoReal(cuy);
    expect(app.saldoRealInfo.faltantes).toMatchObject([{ cantidad: 1 }]);
});

test('Queda de pecho, pierna y octavo dice qué producto no tiene stock', () => {
    const app = crearApp();
    pintar(app, [
        mov('arroz-pollo', 'egreso', 1, hora('08:00'), 'Venta manual'),
        mov('pollo-lena', 'egreso', 2, hora('09:00'), 'Venta manual'),
        mov('pollada', 'egreso', 3, hora('10:00'), 'Venta manual')
    ]);
    for (const [id, nombre, cantidad] of [
        ['octavo_pollo', 'Arroz con pollo', 1],
        ['pechuga', 'Pecho a la Leña', 2],
        ['pierna', 'Pollada', 3]
    ]) {
        const row = app.filaReal(id);
        app.abrirDesgloseGrupo(row, 'queda');
        const enGrupo = app.desgloseGrupo.faltantes.find((f) => f.nombre.startsWith(nombre));
        expect(enGrupo).toMatchObject({ cantidad });
        expect(app.textoFaltanteStock(enGrupo)).toBe('No hay stock (' + enGrupo.nombre + '). Falta ingresar ' + cantidad + '.');
        app.abrirModalProcedimientoSaldoReal(row);
        const enProc = app.saldoRealInfo.faltantes.find((f) => f.nombre.startsWith(nombre));
        expect(app.textoFaltanteStock(enProc)).toBe('No hay stock (' + enProc.nombre + '). Falta ingresar ' + cantidad + '.');
    }
});

test.each([
    [0, 9, 'No hay stock (9)'],
    [4, 9, 'No hay stock (5)'],
    [9, 9, 'No hay stock'],
    [10, 9, 1]
])('Queda con %i Delicias disponibles y %i vendidas muestra %s', (stock, cantidad, esperado) => {
    const app = crearApp();
    const movimientos = stock ? [mov('delicias', 'ingreso', stock, hora('08:00'))] : [];
    const ventas = [{ rubro: 'delicias', cantidad, fecha: hora('13:00'), nombre: 'Delicias', detalle: [] }];
    pintar(app, movimientos, ventas);
    expect(app.textoQuedaCelda(app.filaReal('delicias'))).toBe(esperado);
});

test('el reporte de venta agrupa platos y abre las comandas con el mismo total y el stock utilizado', () => {
    const app = crearApp();
    const v = (rubro, origen, nombre, cantidad, tipoProducto, sinSaldo = false) => ({
        rubro, origen, nombre, cantidad, tipoProducto, sinSaldo,
        detalle: [{ nombre, cantidad, platos: cantidad, comanda: 'Comanda 1', comandaId: '1', hora: hora('13:00') }]
    });
    const ventas = [
        v('pollada', 'pollada', 'Pollada con arroz', 2, 'cocido'),
        v('pierna-pollo', 'pollada', 'Pollada con arroz', 1.5, 'crudo'),
        v('pollada', 'pollada', 'Pollada con arroz', 1.5, 'cocido', true),
        v('pierna-lena', 'pierna-lena', 'Cuarto a la leña', 1, 'cocido'),
        v('arroz-pollo', 'arroz-pollo', 'Arroz con pollo', 3, 'cocido')
    ];
    const movimientos = [
        mov('pollada', 'ingreso', 2, hora('08:00'), 'Ingreso directo', 'cocido'),
        { ...mov('pollada', 'egreso', 1, hora('14:00'), 'Venta manual · Personal', 'cocido'), _id: 'manual', nombre: 'Pollada' }
    ];
    app.reporteDiaVista = app.vistaReporteHoja({ ventas }, movimientos);
    const pierna = app.filasReporteVenta().find((f) => f.clave === 'pierna-pollo');
    expect(pierna.venta).toBe(5.5);
    expect(pierna.lineas).toEqual(expect.arrayContaining([
        expect.objectContaining({ plato: 'Pollada con arroz', tipo: 'Crudo', detalle: 'Comandas · Stock de Pierna de Pollo', cantidad: 1.5 }),
        expect.objectContaining({ plato: 'Pollada con arroz', tipo: 'Cocido', detalle: 'Comandas · Stock de Pollada', cantidad: 2 }),
        expect.objectContaining({ nombre: 'Pollada', detalle: 'Descarga manual · Personal', cantidad: 1 })
    ]));
    app.abrirVenta(pierna, app.reporteDiaVista);
    expect(app.ventaInfo.total).toBe(5.5);
    expect(app.ventaInfo.lineas.find((l) => l.nombre === 'Pollada con arroz')).toMatchObject({ cantidad: 3.5, comandaId: '1' });
    expect(app.totalReporteVenta()).toBe(8.5);

    app.alternarReporteOculta(app.filasReporteEditar().find((f) => f.clave === 'pollada'));
    expect(app.totalReporteIngreso()).toBe(0);
    expect(app.totalReporteVenta()).toBe(4);
    const filtrada = app.filasReporteVenta().find((f) => f.clave === 'pierna-pollo');
    expect(app.detalleVenta(filtrada, app.reporteDiaVista).total).toBe(1);
});

test('Venta Comandas de pierna muestra las siete ventas del modal sin descontarlas dos veces', () => {
    const app = crearApp();
    const ventas = [
        { rubro: 'pollada', nombre: 'Pollada', cantidad: 4, fecha: hora('12:00') },
        { rubro: 'pierna-lena', nombre: 'Pierna a la leña', cantidad: 3, fecha: hora('13:00') },
        { rubro: 'pollo-lena', nombre: 'Pecho a la leña', cantidad: 5, fecha: hora('13:00') }
    ];
    pintar(app, [mov('pierna-pollo', 'ingreso', 10, hora('09:00'))], ventas);
    const pierna = app.filaReal('pierna');
    expect(app.ventaColumna(pierna)).toBe(0);
    expect(app.ventaComandasCocido(pierna)).toBe(7);
    expect(app.stockCuadro('pierna', 'crudo')).toBe(10);
    expect(app.ventaInfo).toBeNull();
    app.abrirVentaFila(pierna);
    expect(app.ventaInfo.total).toBe(7);
    expect(app.ventaInfo.propia).toBe(0);
    pintar(app, []);
    expect(app.ventaComandasCocido(pierna)).toBe(0);
});

test('Venta Comandas de Pecho incluye todos los débitos de Pecho a la leña', () => {
    const app = crearApp();
    const mixtoPecho = 'Mixto a la leña Pecho';
    const cuarto = '1/4 pollo a la leña';
    const { porRubro, detalle } = partirSalida([
        { nombre: mixtoPecho, cantidad: 3 },
        { nombre: 'Mixto a la leña Pierna', cantidad: 4 },
        { nombre: cuarto, cantidad: 3, cortes: { Pec: 2, Pie: 1 } }
    ], 'Comanda 20', null, { comandaId: 'c20' });
    pintar(app, [
        mov('pechuga-pollo', 'ingreso', 10, hora('09:00')),
        mov('pollo-lena', 'ingreso', 12, hora('09:00'), 'Ingreso cocido', 'cocido'),
        mov('pierna-lena', 'ingreso', 12, hora('09:00'), 'Ingreso cocido', 'cocido')
    ], [
        ...Object.entries(porRubro).map(([rubro, cantidad]) => ({ rubro, cantidad, detalle: detalle[rubro], fecha: hora('12:00') })),
        { rubro: 'pollo-lena', nombre: 'Pecho a la Leña', cantidad: 1, fecha: hora('13:00') }
    ]);
    const pecho = app.filaReal('pechuga');
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(10);
    expect(app.stockCuadro('pollo_lena', 'cocido')).toBe(6);
    expect(app.stockCuadro('pierna_lena', 'cocido')).toBe(7);
    expect(app.ventaComandasCocido(pecho)).toBe(6);
    app.abrirVentaFila(pecho);
    expect(app.ventaInfo).toMatchObject({ total: 6, propia: 0 });
    expect(app.ventaInfo.lineas).toHaveLength(3);
    expect(app.ventaInfo.lineas.map(({ nombre, cantidad }) => ({ nombre, cantidad }))).toEqual(expect.arrayContaining([
        { nombre: 'Pecho a la Leña', cantidad: 1 },
        { nombre: cuarto, cantidad: 2 },
        { nombre: mixtoPecho, cantidad: 3 }
    ]));
});

test('Pecho muestra Pan con Pollo en ventas y permite editar su consumo de Sandwich cocido', async () => {
    const plato = 'Pan con Pollo';
    const app = crearApp({}, { InventarioRelaciones });
    let guardado = { manuales: [
        { id: 2, rubro: 'Sandwich', plato, cantidad: 1, complemento: 'Pecho de Pollo' },
        { id: 3, rubro: 'Pecho de Pollo', plato: 'Sandwich', cantidad: 1, complemento: 'En Inventario Tabla' }
    ], quitadas: [] };
    app.playUiSound = () => {};
    app.api = jest.fn(async (url, req) => {
        if (url === '/platos') return [{ id: 1, nombre: plato }, { id: 2, nombre: plato }];
        if (req?.method === 'PUT') guardado = JSON.parse(req.body);
        return guardado;
    });
    await app.cargarRelacionesGuardadas();
    await app.cargarPlatos();
    app.seleccionarProductoRelacion('pechuga');
    const rel = app.relacionesDeProductoActual().filter((r) => [plato, 'Sandwich'].includes(r.plato));
    expect(rel).toEqual([expect.objectContaining({ plato, rubro: 'Sandwich', cantidad: 1 })]);
    app.cambiarConsumoRelacionInline(rel[0].id, 0.5);
    expect(guardado.manuales).toContainEqual(expect.objectContaining({ plato, rubro: 'Sandwich', cantidad: 0.5 }));
    await app.cargarRelacionesGuardadas();
    await app.cargarPlatos();
    const pecho = app.filaReal('pechuga');
    app.ventaManualFila = pecho;
    app.ventaManualPlatos = 4;
    app.ventaManualPlatoKey = app.platosVentaManual(pecho).find((p) => p.nombre === plato).key;
    expect(app.partesVentaManualPlato()).toEqual([expect.objectContaining({ rubro: 'sandwiches', tipo: 'cocido', cantidad: 2 })]);

    const { porRubro, detalle } = partirSalida([{ nombre: plato, cantidad: 4 }], 'Comanda 18', null, { relaciones: guardado.manuales });
    expect(porRubro).toEqual({ sandwiches: 2 });
    pintar(app, [
        mov('pechuga-pollo', 'ingreso', 10, hora('09:00')),
        mov('sandwiches', 'ingreso', 6, hora('09:00'), 'Ingreso independiente cocido', 'cocido')
    ], [{ rubro: 'sandwiches', nombre: 'Sandwiches', cantidad: porRubro.sandwiches, detalle: detalle.sandwiches, fecha: hora('12:00') }]);
    expect(app.ventaComandasCocido(pecho)).toBe(2);
    app.abrirVentaFila(pecho);
    expect(app.ventaInfo).toMatchObject({ total: 2, propia: 0, lineas: [expect.objectContaining({ nombre: plato, platos: 4, cantidad: 2, comanda: 'Comanda 18' })] });
    expect(app.stockCuadro('pechuga', 'crudo')).toBe(10);
    expect(app.stockCuadro('sandwich', 'cocido')).toBe(4);
});

test('Venta Comandas usa el total de la lupa para Octavo, sus platos y productos individuales', () => {
    const app = crearApp();
    const movimientos = [
        mov('octavo-pollo', 'ingreso', 10, hora('09:00')),
        mov('octavo-pollo', 'egreso', 2, hora('13:00'), 'Venta manual · Eventos · pierna')
    ];
    const ventas = [
        { rubro: 'arroz-pollo', nombre: 'Arroz con pollo', cantidad: 4, fecha: hora('12:00') },
        { rubro: 'pollo-olla', nombre: 'Pollo a la olla', cantidad: 3, fecha: hora('12:00') },
        { rubro: 'cuy', nombre: 'Cuy', cantidad: 5, fecha: hora('12:00') }
    ];
    pintar(app, movimientos, ventas);
    expect(app.ventaColumna(app.filaReal('octavo_pollo'))).toBe(2);
    for (const [id, total] of [['octavo_pollo', 9], ['arroz_con_pollo', 4], ['cuy', 5]]) {
        const fila = app.filaReal(id);
        expect(app.ventaComandasCocido(fila)).toBe(total);
        app.abrirVentaFila(fila);
        expect(app.ventaInfo.total).toBe(total);
    }
    expect(app.stockCuadro('octavo_pollo', 'crudo')).toBe(8);
    // Mismas ventas, pero cambia una descarga del período.
    pintar(app, movimientos.concat(mov('octavo-pollo', 'egreso', 1, hora('14:00'), 'Venta manual · Eventos · pecho')), ventas);
    expect(app.ventaComandasCocido(app.filaReal('octavo_pollo'))).toBe(10);
});

test('el modal de ventas muestra un plato una vez, con de dónde salió', () => {
    const app = crearApp();
    const movs = [
        mov('pollada', 'ingreso', 1, hora('09:00'), 'Ingreso cocido', 'cocido'),
        mov('pollada', 'ingreso', 5, hora('09:00'))
    ];
    const detalle = [{ nombre: 'Pollada', cantidad: 2, platos: 2, factor: 1, comanda: 'Comanda 42', comandaId: 'c42', hora: hora('12:00') }];
    pintar(app, movs, [{ rubro: 'pollada', nombre: 'Pollada', cantidad: 2, fecha: hora('12:00'), detalle }]);
    const row = app.filaReal('pollada');
    app.abrirVentaFila(row);
    expect(app.ventaInfo.lineas).toHaveLength(1);
    expect(app.ventaInfo.lineas[0]).toMatchObject({ nombre: 'Pollada', cantidad: 2, platos: 2 });
    expect(app.ventaInfo.lineas[0].usos.map((u) => u.cantidad)).toEqual([1, 1]);
    expect(app.ventaInfo.total).toBe(app.ventaColumna(row));
    expect(app.resumenVenta()).toMatchObject({ total: 2, comandas: 1, platos: 1 });
});

test('un plato que gasta dos productos cuenta una vez como plato', () => {
    const app = crearApp();
    const d = (cantidad) => [{ nombre: 'Chancho a la leña', cantidad, platos: 1, factor: cantidad, comanda: 'Comanda 7', comandaId: 'c7' }];
    pintar(app, [mov('trozo-panceta', 'ingreso', 5, hora('09:00'), 'Ingreso cocido', 'cocido')], [
        { rubro: 'trozo-panceta', nombre: 'Pieza de panceta', cantidad: 1, fecha: hora('12:00'), detalle: d(1) },
        { rubro: 'chancho-lena', nombre: 'Chancho a la leña', cantidad: 1, fecha: hora('12:00'), detalle: d(1) }
    ]);
    app.abrirVentaFila(app.filaReal('trozo_panceta'));
    expect(app.ventaInfo.lineas).toHaveLength(1);
    expect(app.ventaInfo.lineas[0]).toMatchObject({ platos: 1, cantidad: 1, propia: 1 });
    expect(app.ventaInfo.propia).toBe(app.ventaColumna(app.filaReal('trozo_panceta')));
    expect(app.ventaInfo.total).toBe(1);
    expect(app.ventaInfo.nota).toBe('');
});

test('Chaufa de chancho conserva sus comandas en Panceta y su fila no vuelve con datos anteriores', () => {
    const app = crearApp({}, { InventarioRelaciones });
    app.asegurarFila('arroz-chaufa-chancho', 'Arroz Chaufa Chancho', 'panceta');
    expect(app.filaPorClave('arroz-chaufa-chancho')).toBeFalsy();
    const detalle = (id, n) => [{ nombre: 'Arroz Chaufa Chancho', cantidad: n, platos: n, factor: 1, comandaId: id, comanda: id }];
    const ventas = ['c1', 'c2'].flatMap((id, i) => [
        { rubro: 'trozo-panceta', cantidad: i + 1, fecha: hora('12:00'), detalle: detalle(id, i + 1) },
        { rubro: 'chaufa-chancho', cantidad: i + 1, fecha: hora('12:00'), detalle: detalle(id, i + 1) }
    ]);
    const libro = pintar(app, [
        mov('trozo-panceta', 'ingreso', 10, hora('09:00'), 'Ingreso cocido', 'cocido'),
        mov('chaufa-chancho', 'ingreso', 2, horaAyer('11:00'))
    ], ventas);
    expect(libro.filas.some((f) => f.rubro === 'chaufa-chancho')).toBe(false);
    expect(libro.ventas.map((v) => v.rubro)).toEqual(['trozo-panceta', 'trozo-panceta']);
    expect(app.filaReal('chaufa_chancho')).toBeNull();
    expect(app.stockCuadro('trozo_panceta', 'cocido')).toBe(7);
    expect(app.platosDeTrozoPanceta()).toContainEqual(expect.objectContaining({ nombre: 'Arroz Chaufa Chancho', cantidad: 1 }));
    app.ventasPeriodo = ventas;
    app.abrirVentaFila(app.filaReal('trozo_panceta'));
    expect(app.ventaInfo.lineas).toHaveLength(2);
    expect(app.ventaInfo.lineas.map((l) => l.cantidad).sort()).toEqual([1, 2]);
    expect(app.ventaInfo.total).toBe(3);
    expect(app.ventaInfo.propia).toBe(app.ventaColumna(app.filaReal('trozo_panceta')));
    app.reporteDiaVista = app.vistaReporteHoja({ ventas }, []);
    expect(app.totalReporteVenta()).toBe(3);
});

test('el modal conserva las partes reales consumidas de una reserva del mismo plato', () => {
    const app = crearApp();
    const parte = [{ nombre: 'Pollada', cantidad: 1, platos: 1, comandaId: 'c1', comanda: 'Comanda 1' }];
    app.abrirVenta({ id: 'pollada', nombre: 'Pollada', clave: 'pollada', claves: ['pollada', 'pechuga-pollo'], venta: 1 }, {
        ventas: [
            { rubro: 'pollada', origen: 'pollada', nombre: 'Pollada', cantidad: 1, detalle: parte },
            { rubro: 'pechuga-pollo', origen: 'pollada', nombre: 'Pollada', cantidad: 1, detalle: parte }
        ], movimientos: []
    });
    expect(app.ventaInfo.lineas[0].cantidad).toBe(2);
    expect(app.ventaInfo.propia).toBe(1);
});

test('editar stock establece apertura y recalcula total sin aumentar ingresos del período', async () => {
    const app = crearApp();
    const guardados = [mov('cuy', 'ingreso', 10, horaAyer('09:00')), mov('cuy', 'ingreso', 2, hora('09:00'))];
    app.rangoVista = () => ({ desde: '2026-11-11', hasta: '2026-11-11' });
    app.fechaCierreVista = () => undefined;
    app.cargarKardex = async () => { pintar(app, guardados); };
    app.paso = async (rubro, tipoProducto, cantidad, motivo, clase, nombre, fecha) => { guardados.push(mov(rubro, clase, cantidad, fecha, motivo, tipoProducto)); };
    app.pulseRowTotal = () => {};
    app.anotarHistorial = () => {};
    await app.cargarKardex();
    app.abrirEditarStock('cuy');
    expect(app.editarStock.crudo).toBe(12);
    app.editarStock.crudo = 7;
    expect(await app.guardarModalStock()).toBe(true);
    const ajuste = guardados[guardados.length - 1];
    expect(ajuste).toMatchObject({ clase: 'ingreso', cantidad: -5, fecha: '2026-11-11T04:00:00-05:00' });
    expect(ajuste.motivo.indexOf('Ajuste apertura')).toBe(0);
    const row = app.filaReal('cuy');
    expect(row.saldoAnterior).toBe(5);
    expect(app.valorTipo(row, 'ingreso', 'crudo')).toBe(2);
    expect(app.ingresoTotalColumna(row)).toBe(7);
    expect(app.saldoRealColumna(row)).toBe(7);
    expect(row.correccion).toBe(0);
});

test('una venta con el modal abierto no altera la apertura escrita ni se pierde al guardar', async () => {
    const app = crearApp();
    const guardados = [mov('cuy', 'ingreso', 10, hora('09:00'))];
    const ventas = [];
    app.rangoVista = () => ({ desde: '2026-11-11', hasta: '2026-11-11' });
    app.fechaCierreVista = () => undefined;
    app.cargarKardex = async () => { pintar(app, guardados, ventas); };
    app.paso = async (rubro, tipoProducto, cantidad, motivo, clase, nombre, fecha) => { guardados.push(mov(rubro, clase, cantidad, fecha, motivo, tipoProducto)); };
    app.pulseRowTotal = () => {};
    app.anotarHistorial = () => {};
    await app.cargarKardex();
    app.abrirEditarStock('cuy');
    ventas.push({ rubro: 'cuy', nombre: 'Cuy', cantidad: 4, fecha: hora('14:00'), detalle: [] });
    app.editarStock.crudo = 8;
    await app.guardarModalStock();
    expect(app.filaReal('cuy')).toMatchObject({ saldoAnterior: 2, ingreso: 10, venta: 4 });
    expect(app.ingresoTotalColumna(app.filaReal('cuy'))).toBe(12);
    expect(app.saldoRealColumna(app.filaReal('cuy'))).toBe(8);
});

test('editar apertura de un día pasado usa el inicio de ese día', () => {
    const app = crearApp();
    app.ymdOperativo = () => '2026-11-17';
    app.activeTab = 'tabla';
    app.periodo = 'ayer';
    expect(app.fechaCierreVista()).toBe('2026-11-17T03:59:00-05:00');
    expect(app.fechaSaldoAnterior()).toBe('2026-11-16T04:00:00-05:00');
    expect(app.notaEditarStock()).toContain('Saldo anterior');
    app.periodo = 'hoy';
    expect(app.fechaCierreVista()).toBeUndefined();
});

test('la venta muestra Mix de chancho a la leña y conserva el nombre de la comanda', () => {
    const app = crearApp();
    expect(app.nombreVisibleVenta('Panceta de chancho leña')).toBe('Mix de chancho a la leña');
    expect(app.nombreVisibleVenta('Panceta de chancho a la leña + papas doradas + plátano + ensalada'))
        .toBe('Mix de chancho a la leña + papas doradas + plátano + ensalada');
    expect(app.nombreVisibleVenta('1/2 Panceta de chancho a la leña + papas doradas + choclo + ensalada'))
        .toBe('1/2 Mix de chancho a la leña + papas doradas + choclo + ensalada');
    expect(app.nombreVisibleVenta('Costillar de chancho a la leña a la BBQ + papas fritas + arroz + ensalada'))
        .toBe('Costillar de chancho a la leña a la BBQ + papas fritas + arroz + ensalada');
    const fila = { clave: 'trozo-panceta', nombre: 'Pieza de panceta', claves: ['trozo-panceta'] };
    const venta = {
        rubro: 'trozo-panceta', nombre: 'Panceta de chancho leña', cantidad: 3, tipoProducto: 'cocido',
        detalle: [{ nombre: 'Panceta de chancho leña', cantidad: 3, platos: 1, comanda: 'Comanda 4', comandaId: 'c4', hora: hora('13:00') }]
    };
    const info = app.detalleVenta(fila, { ventas: [venta], movimientos: [] });
    expect(info.lineas[0].nombre).toBe('Panceta de chancho leña');
    expect(app.nombreVisibleVenta(info.lineas[0].nombre)).toBe('Mix de chancho a la leña');
});

test('Arroz con pollo no entra a Emergencia: esa venta sale de Arroz verde + pato', () => {
    const app = crearApp();
    pintar(app, [
        mov('arroz-pollo', 'egreso', 1, hora('12:00'), 'Venta'),
        mov('arroz-verde', 'egreso', 1, hora('12:00'), 'Venta', 'cocido')
    ]);
    expect(app.emergenciaFila(app.filaReal('arroz_con_pollo'))).toBe(false);
    expect(app.filasEmergencia().some((row) => row.id === 'arroz_con_pollo')).toBe(false);
    expect(app.filasEmergencia().map((row) => row.id)).toContain('arroz_verde');
    const descuadre = app.filasDescuadre().filter((item) => item.clase === 'emergencia').map((item) => item.id);
    expect(descuadre).not.toContain('arroz_con_pollo');
    expect(descuadre).toContain('arroz_verde');
});

test('descuadre: dice qué pasó y cómo resolverlo, sin falsas alarmas', async () => {
    const app = crearApp();
    const guardados = [
        mov('chicharron-chancho', 'ingreso', 5, hora('09:00')),
        mov('cuy', 'ingreso', 1, hora('09:00')),
        mov('pollada', 'ingreso', 3, hora('09:00')),
        mov('yuca', 'ingreso', 6, horaAyer('09:00')),
        mov('yuca', 'ingreso', -2, hora('08:00'), 'Ajuste apertura'),
        mov('helados', 'ingreso', 9, hora('09:00')),
        mov('helados', 'inventario', 7, hora('10:00'), 'Conteo crudo')
    ];
    const ventas = [
        { rubro: 'chicharron-chancho', nombre: 'Chicharrón', cantidad: 2, fecha: hora('12:00'), detalle: [] },
        { rubro: 'cuy', nombre: 'Cuy', cantidad: 3, fecha: hora('12:00'), detalle: [] }
    ];
    app.cargarKardex = async () => { pintar(app, guardados, ventas); };
    app.paso = async (rubro, tipoProducto, cantidad, motivo, clase) => { guardados.push(mov(rubro, clase, cantidad, hora('20:00'), motivo, tipoProducto)); };
    app.fechaCierreVista = () => undefined;
    app.fechaSaldoAnterior = () => hora('04:00');
    await app.cargarKardex();
    const lista = app.filasDescuadre();
    expect(lista.map((i) => [i.clase, i.id])).toEqual([['emergencia', 'cuy'], ['apertura', 'yuca'], ['conteo', 'helados']]);
    expect(lista[0]).toMatchObject({ falta: 2, titulo: 'Faltan 2' });
    expect(app.cuentaDescuadre()).toBe(2);
    await app.resolverDescuadre(lista[0], 'ingreso');
    expect(app.saldoRealColumna(app.filaReal('cuy'))).toBe(0);
    expect(app.emergenciaFila(app.filaReal('cuy'))).toBe(false);
    await app.resolverDescuadre(app.filasDescuadre().find((i) => i.clase === 'apertura'), 'apertura');
    expect(app.saldoAnteriorColumna(app.filaReal('yuca'))).toBe(6);
    expect(app.filasDescuadre().map((i) => i.clase)).toEqual(['conteo']);
    expect(app.cuentaDescuadre()).toBe(0);
});

test('editar stock de filete y octavo no crea apertura pendiente ni modifica sus existencias al consultar Descuadre', () => {
    const app = crearApp();
    app.rangoVista = () => ({ desde: '2026-11-11', hasta: '2026-11-11' });
    const movimientos = [
        mov('filete', 'ingreso', 10, horaAyer('09:00')),
        mov('octavo-pollo', 'ingreso', 20, horaAyer('09:00')),
        mov('filete', 'ingreso', 4, hora('04:00'), 'Ajuste apertura · Editar stock'),
        mov('octavo-pollo', 'ingreso', -3, hora('04:00'), 'Ajuste apertura · Editar stock · pierna')
    ];
    pintar(app, movimientos);
    const antes = JSON.stringify(app.rows);
    expect(app.filasDescuadre().filter((i) => i.clase === 'apertura')).toHaveLength(0);
    expect(app.cuentaDescuadre()).toBe(0);
    expect(app.filaReal('filete').saldoAnterior).toBe(14);
    expect(app.filaReal('octavo_pollo').saldoAnterior).toBe(17);
    expect(JSON.stringify(app.rows)).toBe(antes);
    expect(app.movimientosPeriodo).toBe(movimientos);
});

test('quitar el aviso de Filete lo oculta en su período sin ajustar el stock', async () => {
    const app = crearApp();
    const rango = { desde: '2026-11-11', hasta: '2026-11-11' };
    const q = app.queryRango(rango);
    app.rangoVista = () => rango;
    app._cacheKardex.tabla = { q };
    const movimientos = [
        mov('filete', 'ingreso', 10, horaAyer('09:00')),
        mov('filete', 'ingreso', -3, hora('04:00'), 'Ajuste apertura'),
        mov('yuca', 'ingreso', 1, hora('04:00'), 'Ajuste apertura')
    ];
    pintar(app, movimientos);
    const antes = JSON.stringify(app.rows);
    const aviso = app.filasDescuadre().find((item) => item.id === 'filete');
    expect(aviso.firma).toBe('filete|crudo|apertura|-3|10|7');
    app.api = jest.fn().mockResolvedValue({ success: true });
    app.paso = jest.fn();

    await app.omitirDescuadre(aviso);
    expect(app.api).toHaveBeenCalledWith('/inventario/descuadres/omitidos?' + q, {
        method: 'PUT', body: JSON.stringify({ aviso: aviso.firma })
    });
    expect(app.paso).not.toHaveBeenCalled();
    expect(JSON.stringify(app.rows)).toBe(antes);
    expect(app.movimientosPeriodo).toBe(movimientos);
    expect(app.filasDescuadre().map((item) => item.id)).toEqual(['yuca']);
    expect(app.cuentaDescuadre()).toBe(1);

    const recargada = crearApp();
    recargada.rangoVista = () => rango;
    recargada.registrarDescuadresOmitidos(q, [aviso.firma]);
    pintar(recargada, movimientos);
    expect(recargada.filasDescuadre().map((item) => item.id)).toEqual(['yuca']);
    pintar(recargada, movimientos.concat(mov('filete', 'ingreso', -1, hora('04:00'), 'Ajuste apertura')));
    expect(recargada.filasDescuadre().find((item) => item.id === 'filete').ajuste).toBe(-4);
});

test('una edición de stock no oculta faltantes reales ni otros ajustes de apertura', () => {
    const app = crearApp();
    app.rangoVista = () => ({ desde: '2026-11-11', hasta: '2026-11-11' });
    pintar(app, [
        mov('filete', 'ingreso', 2, hora('04:00'), 'Ajuste apertura · Editar stock'),
        mov('filete', 'ingreso', 3, hora('04:00'), 'Ajuste apertura'),
        mov('filete', 'egreso', 10, hora('12:00'), 'Venta'),
        mov('yuca', 'ingreso', 1, hora('04:00'), 'Ajuste apertura')
    ]);
    const lista = app.filasDescuadre();
    expect(lista.find((i) => i.id === 'filete' && i.clase === 'apertura').ajuste).toBe(3);
    expect(lista.some((i) => i.id === 'filete' && i.clase === 'emergencia')).toBe(true);
    expect(lista.some((i) => i.id === 'yuca' && i.clase === 'apertura')).toBe(true);
});

test('descuadre: si hay crudo libre, primero se pasa a cocido', async () => {
    const app = crearApp();
    const guardados = [mov('pollo-baby', 'ingreso', 5, hora('09:00')), mov('pollo-baby', 'ingreso', 1, hora('09:00'), 'Ingreso cocido', 'cocido')];
    const ventas = [{ rubro: 'pollo-baby', nombre: 'Pollo baby', cantidad: 3, fecha: hora('12:00'), detalle: [] }];
    app.cargarKardex = async () => { pintar(app, guardados, ventas); };
    app.encolarMovimientos = (movs) => { movs.forEach((m) => guardados.push({ ...m, fecha: hora('20:00') })); };
    app.anotarHistorial = () => {};
    app.pulseRowTotal = () => {};
    await app.cargarKardex();
    const item = app.filasDescuadre()[0];
    expect(item).toMatchObject({ clase: 'emergencia', tipo: 'cocido', falta: 2, crudoLibre: 5 });
    await app.resolverDescuadre(item, 'crudo');
    const row = app.filaReal('pollo_baby');
    expect(app.quedaSinTopeTipo(row, 'cocido')).toBe(0);
    expect(app.saldoRealColumnaTipo(row, 'crudo')).toBe(3);
});

test('el cuadro de ingreso total explica la suma', () => {
    const app = crearApp();
    app.frescosHoy = () => 0;
    pintar(app, [mov('cuy', 'ingreso', 4, horaAyer('09:00')), mov('cuy', 'ingreso', 6, hora('09:00'))]);
    app.abrirIngresoLupa(app.filaReal('cuy'));
    expect(app.ingresoLupa).toMatchObject({ saldoAnterior: 4, ingresoDia: 6, ingresoTotal: 10 });
});

test('la lupa de Queda cuadra con las columnas', () => {
    const app = crearApp();
    pintar(app, [
        mov('cuy', 'ingreso', 4, horaAyer('09:00')),
        mov('cuy', 'ingreso', 6, hora('09:00')),
        mov('cuy', 'regulacion', -1, hora('10:00'), 'Ajuste de stock')
    ], [{ rubro: 'cuy', nombre: 'Cuy', cantidad: 2, fecha: hora('12:00'), detalle: [] }]);
    app.diasMultiplicadorPeriodo = () => 1;
    const info = app.construirProcedimientoSaldoReal(app.filaReal('cuy'));
    expect(info).toMatchObject({ saldoAnterior: 4, ingreso: 6, ingresoTotal: 10, ventas: 2, correccion: -1, quedaSaldoReal: 7, cuadra: true });
});

test('una etiqueta de Transformar no cuenta un ajuste de stock como ingreso', () => {
    const app = crearApp();
    app.rangoTurnoCuadro = () => ({ desde: hora('04:00'), hasta: hora('23:59') });
    app.movimientosTurno = [
        { rubro: 'cuy', clase: 'ingreso', tipoProducto: 'crudo', cantidad: 2, motivo: 'Ingreso crudo', fecha: hora('10:00') },
        { rubro: 'cuy', clase: 'regulacion', tipoProducto: 'crudo', cantidad: 5, motivo: 'Ajuste de stock', fecha: hora('11:00') }
    ];
    expect(app.partesMovimiento('cuy', 'crudo')).toEqual({ ingreso: 2, resto: 0 });
});

test('una bebida que acompaña un plato conserva su nombre', () => {
    const app = crearApp();
    app.asegurarFilasVendidas([{ rubro: 'gaseosa-inca-kola-300ml', nombre: 'Inca Kola 300ml', cantidad: 1, detalle: [{ nombre: 'Seco de Res + frijoles + arroz' }] }]);
    expect(app.filaPorClave('gaseosa-inca-kola-300ml').nombre).toBe('Inca Kola 300ml');
});

describe('descarga manual de octavos en el modal de ventas', () => {
    const fila = { id: 'octavo_pollo', nombre: 'Octavo de pollo', clave: 'octavo-pollo', claves: ['octavo-pollo'], venta: 0 };
    const mov = (cantidad, motivo, extra) => ({
        _id: motivo + cantidad, rubro: 'octavo-pollo', nombre: 'Octavo de pollo', clase: 'egreso',
        tipoProducto: 'crudo', cantidad, motivo, fecha: hora('10:00'), ...extra
    });
    const lineas = (movimientos) => {
        const app = crearApp();
        app.abrirVenta(fila, { ventas: [], movimientos });
        return { app, lineas: app.ventaInfo.lineas };
    };

    test('dice si los octavos fueron de pierna o de pecho', () => {
        const pierna = lineas([mov(40, 'Venta manual · pierna · Para evento', { lote: 'vm-aaaa-1111' })]).lineas[0];
        expect(pierna.usos).toEqual([{ uso: 'Principal — Octavo de pollo · Pierna', cantidad: 40 }]);
        expect(pierna.motivo).toBe('Para evento');
        expect(lineas([mov(3, 'Venta manual · pecho')]).lineas[0].uso).toBe('Principal — Octavo de pollo · Pecho');
    });

    test('una descarga de sector separa cuánto fue de cada corte', () => {
        const { app, lineas: [linea] } = lineas([
            mov(10, 'Venta manual · Eventos · pecho', { lote: 'vm-bbbb-2222' }),
            mov(30, 'Venta manual · Eventos · pierna', { lote: 'vm-bbbb-2222' })
        ]);
        expect(linea.cantidad).toBe(40);
        expect(linea.motivo).toBe('Eventos');
        expect(linea.usos).toEqual([
            { uso: 'Principal — Octavo de pollo · Pecho', cantidad: 10 },
            { uso: 'Principal — Octavo de pollo · Pierna', cantidad: 30 }
        ]);
        app.ventaBusqueda = 'pierna';
        expect(app.lineasVentaVista()).toHaveLength(1);
    });

    test('una descarga antigua sin marca no inventa el corte', () => {
        expect(lineas([mov(2, 'Venta manual')]).lineas[0].uso).toBe('Principal — Octavo de pollo');
    });

    test.each([
        ['beata', 'Beata', 'Entrega acordada · pierna · 12:00'],
        ['personal', 'Personal', ''],
        ['eventos', 'Evento', 'Servicio'],
        ['rio-lindo', 'Rio Lindo', 'Traslado '.repeat(24)]
    ])('%s queda en cero al descargar y recupera ambos cortes al eliminar la descarga', async (id, nombre, motivo) => {
        const app = crearApp({}, { confirm: () => true });
        app.pulseRowTotal = () => {};
        app.$refs.modalDescargaSector = { showModal: jest.fn(), close: jest.fn() };
        const movimientos = [
            mov(8, 'Ingreso · pecho', { clase: 'ingreso' }),
            mov(7, 'Ingreso · pierna', { clase: 'ingreso' }),
            mov(-2, 'Separado · ' + nombre + ' · pecho', { clase: 'regulacion' }),
            mov(-3, 'Separado · ' + nombre + ' · pierna', { clase: 'regulacion' })
        ];
        pintar(app, movimientos, []);
        const octavo = app.filaReal('octavo_pollo');
        const sectorVisible = nombre === 'Rio Lindo' ? 'Río Lindo' : nombre;
        const comprobarIngreso = (total, pecho) => {
            expect(app.cifraIngresoTabla(octavo, 'ingresoTotal')).toBe(total);
            expect(app.origenIngresoDe(octavo).lineas).toEqual(expect.arrayContaining([
                expect.objectContaining({ clase: 'transformacion', cantidad: -pecho, texto: `Se transformó ${pecho} octavos de pecho a ${sectorVisible}` }),
                expect.objectContaining({ clase: 'transformacion', cantidad: -3, texto: `Se transformó 3 octavos de pierna a ${sectorVisible}` })
            ]));
            expect(app.construirProcedimientoSaldoReal(octavo)).toMatchObject({ ingresoTotal: total, saldoTeorico: total, cuadra: true });
        };
        comprobarIngreso(10, 2);
        app.api = jest.fn(async (_url, { body }) => {
            const datos = JSON.parse(body);
            movimientos.push({ ...datos, fecha: hora('11:00'), _id: datos.motivo });
        });

        app.abrirDescargaSector(app.destinosOctavoExtra().find((dest) => dest.id === id));
        expect(app.$refs.modalDescargaSector.showModal).toHaveBeenCalledTimes(1);
        expect(app.api).not.toHaveBeenCalled();
        expect(app.descargaSector.motivo).toBe('');
        app.descargaSector.motivo = motivo;
        app.confirmarDescargaSector();
        expect(app.$refs.modalDescargaSector.close).toHaveBeenCalledTimes(1);
        expect(app.octavosEnDestino(id, 'pechugas')).toBe(0);
        expect(app.octavosEnDestino(id, 'piernas')).toBe(0);
        comprobarIngreso(10, 2);
        await app._colaTransformar;
        expect(app.api).toHaveBeenCalledTimes(4);

        const libro = pintar(app, movimientos, []);
        const nota = motivo.trim().slice(0, 155);
        const prefijo = 'Venta manual · ' + nombre + (nota ? ' · Motivo: ' + nota : '');
        expect(movimientos.filter((m) => m.clase === 'egreso').map((m) => m.motivo)).toEqual([
            prefijo + ' · pecho', prefijo + ' · pierna'
        ]);
        expect(prefijo.length + ' · pierna'.length).toBeLessThanOrEqual(200);
        expect(app.octavosSeparadosSector(id)).toBe(0);
        expect(app.octavosEnDestino(id, 'pechugas')).toBe(0);
        expect(app.octavosEnDestino(id, 'piernas')).toBe(0);
        expect(libro.filas.find((r) => r.rubro === 'octavo-pollo')).toMatchObject({ queda: 10 });
        comprobarIngreso(10, 2);
        app.abrirVenta(fila, { ventas: [], movimientos });
        const [linea] = app.ventaInfo.lineas;
        expect(linea.motivo).toBe(nombre + (nota ? ' · Motivo: ' + nota : ''));
        expect(linea.usos).toEqual([
            { uso: 'Principal — Octavo de pollo · Pecho', cantidad: 2 },
            { uso: 'Principal — Octavo de pollo · Pierna', cantidad: 3 }
        ]);

        expect(app.fijarOctavoDestino(id, 'pechugas', 1)).toBe(true);
        await app._colaTransformar;
        app.api.mockImplementationOnce(async (_url, { body }) => {
            const { lote } = JSON.parse(body);
            for (const m of movimientos.filter((m) => m.lote === lote && m.clase === 'egreso')) {
                const corte = m.motivo.split(' · ').at(-1);
                Object.assign(m, { clase: 'regulacion', cantidad: -m.cantidad, motivo: `Separado · ${nombre} · ${corte}`, lote: '' });
            }
            return { success: true, eliminados: 2, sectorRestaurado: nombre };
        });
        app.cargarKardex = jest.fn(async () => pintar(app, movimientos, []));
        await app.eliminarVentaManual(linea);
        expect(app.api).toHaveBeenLastCalledWith('/inventario/venta-manual/eliminar', expect.objectContaining({
            body: JSON.stringify({ lote: linea.lote })
        }));
        expect(app.ventaInfo.lineas).toHaveLength(0);
        expect(app.octavosEnDestino(id, 'pechugas')).toBe(3);
        expect(app.octavosEnDestino(id, 'piernas')).toBe(3);
        expect(app.stockCuadro('octavo_pollo', 'crudo')).toBe(9);
        comprobarIngreso(9, 3);
    });
});

describe('Procedimiento saldo real de Octavo de pollo', () => {
    test.each([['beata', 'Beata'], ['personal', 'Personal'], ['eventos', 'Evento'], ['rio-lindo', 'Rio Lindo']])(
        'los pendientes de %s cruzan el día y se registran al descargar', (id, nombre) => {
            const app = crearApp();
            const clave = 'octavo-pollo';
            const movimientos = [
                mov(clave, 'ingreso', 10, horaAyer('09:00'), 'Ingreso · pecho'),
                mov(clave, 'regulacion', -3, horaAyer('10:00'), `Separado · ${nombre} · pecho`),
                mov(clave, 'ingreso', 2, horaAyer('10:03'), `Ingreso independiente crudo · Sector ${nombre} · pierna`),
                mov(clave, 'regulacion', -2, horaAyer('10:03'), `Separado · ${nombre} · pierna`)
            ];
            app.productoBloqueado = () => false;
            app.pulseRowTotal = () => {};
            app.encolarMovimientos = (lista) => movimientos.push(...lista.map((m) => ({ ...m, fecha: hora('12:00') })));
            pintar(app, movimientos);
            app.movimientosPeriodo = [];
            expect(app.octavosEnDestino(id, 'pechugas')).toBe(3);
            expect(app.octavosEnDestino(id, 'piernas')).toBe(2);
            expect(app.ingresoTotalColumna(app.filaReal('octavo_pollo'))).toBe(7);
            expect(app.descargarSectorOctavo({ id, nombre })).toBe(true);
            expect(app.octavosSeparadosSector(id)).toBe(0);
            pintar(app, movimientos);
            app.movimientosPeriodo = movimientos.slice(4);
            expect(app.octavosSeparadosSector(id)).toBe(0);
            expect(app.ingresoTotalColumna(app.filaReal('octavo_pollo'))).toBe(7);
            app.reporteDiaVista = { movimientos: app.movimientosPeriodo };
            expect(app.lineasSectoresReporte().map((l) => l.cantidad)).toEqual([3, 2]);
            pintar(app, movimientos, [], '2026-11-12');
            expect(app.octavosSeparadosSector(id)).toBe(0);
        }
    );

    test('Ingreso total descuenta 60 octavos de cada corte enviados a Beata', () => {
        const app = crearApp();
        app.rangoPeriodo = () => ({ desde: '2026-11-11', hasta: '2026-11-11' });
        const rubro = 'octavo-pollo';
        const movimientos = [
            mov(rubro, 'ingreso', 24, horaAyer('17:00'), 'Ingreso · pecho'),
            mov(rubro, 'ingreso', 42, horaAyer('17:00'), 'Ingreso · pierna'),
            mov(rubro, 'ingreso', 6, horaAyer('17:00'), 'Ingreso'),
            mov(rubro, 'ingreso', 60, hora('09:00'), 'Sale de Pecho de Pollo · pecho'),
            mov(rubro, 'ingreso', 60, hora('09:00'), 'Sale de Pierna de Pollo · pierna'),
            mov(rubro, 'regulacion', -60, hora('10:00'), 'Separado · Beata · pecho'),
            mov(rubro, 'regulacion', -60, hora('10:00'), 'Separado · Beata · pierna'),
            mov(rubro, 'ingreso', 26, hora('11:00'), 'Ingreso independiente crudo · Sector Personal · pierna'),
            mov(rubro, 'regulacion', -26, hora('11:00'), 'Separado · Personal · pierna')
        ];
        pintar(app, movimientos);
        app.movimientosPeriodo = movimientos.slice(3);
        const octavo = app.filaReal('octavo_pollo');
        expect(app.cifraIngresoTabla(octavo, 'ingresoTotal')).toBe(72);
        app.abrirDesgloseGrupo(octavo, 'ingresoTotal');
        expect(app.desgloseGrupo.total).toBe(72);
        expect(app.desgloseGrupo.filas[0].cortes.map((c) => c.texto)).toEqual(['Pierna 42', 'Pecho 30']);
        expect(app.origenIngresoDe(octavo).lineas).toEqual(expect.arrayContaining([
            expect.objectContaining({ texto: 'Se transformó 60 octavos de pecho a Beata', cantidad: -60 }),
            expect.objectContaining({ texto: 'Se transformó 60 octavos de pierna a Beata', cantidad: -60 }),
            expect.objectContaining({ texto: 'Ingreso directo de 26 octavos de pierna a Personal', cantidad: 26 })
        ]));
    });

    test('descargar una separación anterior mantiene el disponible y devolverla lo suma', () => {
        const app = crearApp();
        const rubro = 'octavo-pollo';
        const movimientos = [
            mov(rubro, 'ingreso', 30, horaAyer('16:00'), 'Ingreso · pecho'),
            mov(rubro, 'regulacion', -20, horaAyer('17:00'), 'Separado · Río Lindo · pecho'),
            mov(rubro, 'regulacion', 12, hora('10:00'), 'Separado · Río Lindo · pecho'),
            mov(rubro, 'egreso', 12, hora('10:00'), 'Venta manual · Río Lindo · pecho'),
            mov(rubro, 'regulacion', 8, hora('11:00'), 'Separado · Río Lindo · pecho')
        ];
        pintar(app, movimientos);
        app.movimientosPeriodo = movimientos.slice(2);
        const octavo = app.filaReal('octavo_pollo');
        expect(app.cifraIngresoTabla(octavo, 'ingresoTotal')).toBe(18);
        expect(app.origenIngresoDe(octavo).lineas).toEqual([
            expect.objectContaining({ texto: 'Regresaron 8 octavos de pecho de Río Lindo', cantidad: 8 })
        ]);
        expect(app.construirProcedimientoSaldoReal(octavo)).toMatchObject({ ingresoTotal: 18, saldoTeorico: 18, cuadra: true });
    });

    test('la lupa de Saldo anterior muestra el reparto guardado sin cambiar el saldo ni cortes de otros cuadros', () => {
        const app = crearApp();
        app.rangoPeriodo = () => ({ desde: '2026-11-11', hasta: '2026-11-12' });
        const movimientos = [
            mov('octavo-pollo', 'ingreso', 176, horaAyer('09:00')),
            mov('octavo-pollo', 'ingreso', 30, hora('04:00'), 'Ajuste apertura · Editar stock · pecho'),
            mov('octavo-pollo', 'ingreso', 30, hora('04:00'), 'Saldo anterior · pecho'),
            mov('octavo-pollo', 'ingreso', 146, hora('04:00'), 'Saldo anterior · pierna'),
            mov('octavo-pollo', 'ingreso', -176, hora('04:00'), 'Saldo anterior · sin separar'),
            mov('octavo-pollo', 'ingreso', -1, hora('12:00'), 'Pasa a Caldo de pollo · pecho')
        ];
        pintar(app, movimientos);
        app.movimientosPeriodo = movimientos.concat([
            mov('octavo-pollo', 'ingreso', 7, '2026-11-12T04:00:00-05:00', 'Saldo anterior · pecho'),
            mov('octavo-pollo', 'ingreso', -7, '2026-11-12T04:00:00-05:00', 'Saldo anterior · sin separar')
        ]);
        const fila = app.filaReal('octavo_pollo');
        const inicial = JSON.stringify(fila.cortesOctavo);
        const stock = app.octavosVisibles();
        app.abrirDesgloseGrupo(fila, 'saldoAnterior');
        const octavo = app.desgloseGrupo.filas.find((f) => f.id === fila.id);
        expect(octavo.total).toBe(206);
        expect(octavo.cortes.map((c) => c.texto)).toEqual(['Pierna 146', 'Pecho 60']);
        expect(JSON.stringify(fila.cortesOctavo)).toBe(inicial);
        expect(app.octavosVisibles()).toEqual(stock);
        app.abrirDesgloseGrupo(fila, 'ingresoTotal');
        expect(app.desgloseGrupo.filas.find((f) => f.id === fila.id).cortes.map((c) => c.texto)).toEqual(['Pierna 146', 'Pecho 59']);
    });

    const textos = (lista) => lista.map((c) => c.texto);

    test('dice cuánto incluye de pierna y de pecho el saldo anterior y lo que queda', () => {
        const app = crearApp();
        const row = app.filaReal('octavo_pollo');
        Object.assign(row, {
            saldoAnterior: 90, crudo: 80,
            cortesOctavo: { inicial: { pierna: 60, pecho: 30 }, queda: { pierna: 60, pecho: 30 } }
        });
        const info = app.construirProcedimientoSaldoReal(row);
        expect(textos(info.pasos[0].cortes)).toEqual(['Pierna 60', 'Pecho 30']);
        const saldoQueda = info.quedaSaldoReal;
        const esperado = ['Pierna 60', 'Pecho ' + (saldoQueda > 90 ? app.formatNum(30 + saldoQueda - 90) : '30')];
        if (saldoQueda < 90) esperado.push('Salió sin corte −' + app.formatNum(90 - saldoQueda));
        expect(textos(info.cortesSueltas)).toEqual(esperado);
    });

    test('lo que las marcas no explican se dice aparte', () => {
        const app = crearApp();
        expect(textos(app.cortesDeSaldoOctavo({ pierna: 60, pecho: 30 }, 100))).toEqual(['Pierna 60', 'Pecho 40']);
        expect(textos(app.cortesDeSaldoOctavo({ pierna: 60, pecho: 30 }, 80))).toEqual(['Pierna 60', 'Pecho 30', 'Salió sin corte −10']);
    });

    test('otras filas no muestran cortes', () => {
        const app = crearApp();
        const info = app.construirProcedimientoSaldoReal(app.filaReal('pierna'));
        expect(info.pasos[0].cortes).toBeNull();
        expect(info.cortesSueltas).toBeNull();
    });
});

test('los cuadros de octavos del procedimiento usan el mismo saldo que Queda', () => {
    const app = crearApp();
    const row = app.filaReal('octavo_pollo');
    row.cortesOctavo = { inicial: { pierna: 60, pecho: 30 }, queda: { pierna: 60, pecho: 20 } };
    const { octavos } = app.construirProcedimientoSaldoReal(row);
    expect(octavos.pierna.sueltos).toBe(60);
    expect(octavos.pecho.sueltos).toBe(20);
});


describe('productos con grupo en la tabla', () => {
    const preparar = () => {
        const app = crearApp();
        pintar(app, [
            mov('pierna-pollo', 'ingreso', 10, horaAyer('09:00')),
            mov('pollada', 'ingreso', 4, horaAyer('09:00')),
            mov('pierna-pollo', 'ingreso', 20, hora('09:00')),
            mov('pierna-pollo', 'ingreso', -3, hora('10:00'), 'Pasa a Pollada'),
            mov('pollada', 'ingreso', 3, hora('10:00'), 'Sale de Pierna de Pollo')
        ]);
        app.encolarMovimientos = jest.fn();
        app.anotarMovs = () => {};
        app.pulseRowTotal = () => {};
        app.productoBloqueado = () => false;
        return { app, pierna: app.filaReal('pierna') };
    };

    test('la lupa suma el grupo y distingue el ingreso total de la fila', () => {
        const { app, pierna } = preparar();
        expect(app.cifraGrupo(pierna, 'saldoAnterior')).toBe(14);
        expect(app.cifraGrupo(pierna, 'ingreso')).toBe(23);
        expect(app.cifraGrupo(pierna, 'ingresoTotal')).toBe(34);
        expect(app.cifraIngresoTabla(pierna, 'ingresoTotal')).toBe(34);
        expect(app.ingresoTotalColumna(pierna)).toBe(27);
        expect(app.cifraGrupo(pierna, 'transformacion')).toBe(3);
        expect(app.cifraGrupo(pierna, 'queda')).toBe(34);
        ['saldoAnterior', 'ingresoTotal', 'queda'].forEach((columna) => {
            app.abrirDesgloseGrupo(pierna, columna);
            const info = app.desgloseGrupo;
            expect(info.filas[0]).toMatchObject({ id: 'pierna', propio: true });
            expect(info.filas.map((f) => f.id)).toEqual(expect.arrayContaining(['pollada', 'pierna_lena', 'pollo_pachamanca']));
            expect(info.filas.reduce((a, f) => a + f.total, 0)).toBe(info.total);
            expect(info.total).toBe(app.cifraGrupo(pierna, columna));
        });
    });

    test('un producto sin platos sigue mostrando solo lo suyo y no abre los modales de grupo', () => {
        const app = crearApp();
        pintar(app, [mov('cuy', 'ingreso', 5, hora('10:00'))]);
        const cuy = app.filaReal('cuy');
        expect(app.cifraGrupo(cuy, 'queda')).toBe(5);
        app.abrirIngresoGrupo(cuy);
        app.abrirDesgloseGrupo(cuy, 'queda');
        expect(app.ingresoGrupo).toBeNull();
        expect(app.desgloseGrupo).toBeNull();
    });

    test('ingresar suma stock en cada producto sin transformar y coincide con Transformar', () => {
        const { app, pierna } = preparar();
        const pollada = app.filaReal('pollada');
        const piernaAntes = app.saldoRealColumna(pierna);
        const polladaAntes = app.calcSaldoTipo(pollada, 'cocido');
        app.abrirIngresoGrupo(pierna);
        const lineas = app.ingresoGrupo.lineas;
        expect(lineas[0]).toMatchObject({ id: 'pierna', principal: true });
        lineas[0].cuadros[0].valor = '5';
        lineas.find((l) => l.id === 'pollada').cuadros.find((c) => c.tipo === 'cocido').valor = '2';
        expect(app.totalIngresoGrupo()).toBe(7);
        expect(app.guardarIngresoGrupo()).toBe(true);
        expect(app.ingresoGrupo).toBeNull();
        expect(app.saldoRealColumna(pierna)).toBe(piernaAntes + 5);
        expect(app.calcSaldoTipo(pollada, 'cocido')).toBe(polladaAntes + 2);
        const movs = app.encolarMovimientos.mock.calls.flatMap((c) => c[0]);
        expect(movs.map((m) => [m.rubro, m.tipoProducto, m.clase, m.cantidad, m.motivo])).toEqual([
            ['pierna-pollo', 'crudo', 'ingreso', 5, 'Ingreso independiente crudo'],
            ['pollada', 'cocido', 'ingreso', 2, 'Ingreso independiente cocido']
        ]);
    });

    test('el ingreso de octavos se guarda por pierna o pecho', () => {
        const app = crearApp();
        pintar(app, []);
        app.encolarMovimientos = jest.fn();
        app.anotarMovs = () => {};
        app.pulseRowTotal = () => {};
        app.productoBloqueado = () => false;
        app.abrirIngresoGrupo(app.filaReal('octavo_pollo'));
        const cuadros = app.ingresoGrupo.lineas[0].cuadros;
        expect(cuadros.map((c) => c.etiqueta)).toEqual(['Pierna', 'Pecho']);
        cuadros[0].valor = '8';
        app.guardarIngresoGrupo();
        expect(app.encolarMovimientos.mock.calls[0][0][0]).toMatchObject({ rubro: 'octavo-pollo', cantidad: 8, motivo: 'Ingreso independiente crudo · pierna' });
    });

    test('no guarda un ingreso sin cambios ni un ingreso negativo', () => {
        const { app, pierna } = preparar();
        app.abrirIngresoGrupo(pierna);
        expect(app.guardarIngresoGrupo()).toBe(false);
        app.ingresoGrupo.lineas[0].cuadros[0].valor = '-3';
        expect(app.guardarIngresoGrupo()).toBe(false);
        expect(app.ingresoGrupo.error).toMatch(/no puede ser negativo/);
        expect(app.encolarMovimientos).not.toHaveBeenCalled();
    });
    test('la lupa de Ingreso separa lo ingresado de lo transformado en todo el grupo', () => {
        const { app, pierna } = preparar();
        app.movimientosPeriodo = app.movimientosPeriodo.filter((m) => new Date(m.fecha) >= new Date(hora('04:00')));
        const origen = app.origenIngresoDe(pierna);
        expect(origen.total).toBe(23);
        expect(origen.transformado).toBe(3);
        expect(origen.anotado).toBe(20);
        app.abrirIngresoGrupo(pierna);
        expect(app.ingresoGrupo.transformaciones).toMatchObject([{ cantidad: 3 }]);
    });

    test('el ingreso de filete de pollo oculta los otros productos del grupo y los demás grupos no', () => {
        const app = crearApp();
        pintar(app, []);
        const filete = app.filaReal('filete');
        expect(app.mostrarOtrosFileteIngreso).toBe(false);
        app.abrirIngresoGrupo(filete);
        expect(app.ingresoGrupo.lineas.some((l) => l.principal && l.id === 'filete')).toBe(true);
        expect(app.ingresoGrupo.lineas.some((l) => !l.principal)).toBe(true);
        expect(app.verOtrosIngresoGrupo()).toBe(false);
        app.setOcultarOtrosFileteIngreso(false);
        expect(app.mostrarOtrosFileteIngreso).toBe(true);
        expect(app.verOtrosIngresoGrupo()).toBe(true);
        app.setOcultarOtrosFileteIngreso(true);
        expect(app.verOtrosIngresoGrupo()).toBe(false);
        app.abrirIngresoGrupo(app.filaReal('pierna'));
        expect(app.verOtrosIngresoGrupo()).toBe(true);
    });
});


describe('modales del grupo de Octavo de pollo', () => {
    const textos = (l) => (l || []).map((c) => c.texto);
    const preparar = () => {
        const app = crearApp();
        pintar(app, []);
        const octavo = app.filaReal('octavo_pollo');
        octavo.cortesOctavo = { inicial: { pierna: 6, pecho: 4 }, queda: { pierna: 6, pecho: 4 } };
        octavo.saldoAnterior = 10;
        octavo.crudo = 10;
        app.pulseRowTotal = () => {};
        return { app, octavo };
    };

    test('el reparto dice cuánto es de pierna y de pecho en cada fila', () => {
        const { app, octavo } = preparar();
        app.abrirDesgloseGrupo(octavo, 'saldoAnterior');
        const fila = app.desgloseGrupo.filas.find((f) => f.id === 'octavo_pollo');
        expect(textos(fila.cortes)).toEqual(['Pierna 6', 'Pecho 4']);
        app.abrirDesgloseGrupo(octavo, 'queda');
        expect(textos(app.desgloseGrupo.filas.find((f) => f.id === 'octavo_pollo').cortes)).toEqual(['Pierna 6', 'Pecho 4']);
        expect(app.desgloseGrupo.filas.every((f) => Array.isArray(f.cortes))).toBe(true);
    });

    test('el modal de ingreso dice cuánto hay de pierna y de pecho, también en cada plato', () => {
        const { app, octavo } = preparar();
        app.abrirIngresoGrupo(octavo);
        const principal = app.ingresoGrupo.lineas[0];
        expect(textos(principal.hayCortes)).toEqual(['Pierna 6', 'Pecho 4']);
        expect(principal.cuadros.map((c) => [c.etiqueta, c.hay])).toEqual([['Pierna', 6], ['Pecho', 4]]);
        const plato = app.ingresoGrupo.lineas.find((l) => l.id === 'arroz_con_pollo');
        expect(plato.cuadros.map((c) => c.etiqueta)).toEqual(expect.arrayContaining(['Pierna crudo', 'Pecho crudo']));
        expect(plato.hayCortes).toHaveLength(2);
    });
});
