const { Types } = require('mongoose');
const Movimiento = require('../src/database/models/inventarioMovimiento.model');
const Rubro = require('../src/database/models/inventarioRubro.model');
const inventario = require('../src/repository/inventario.repository');

jest.mock('../src/utils/inventarioMapas', () => ({ clavesExtra: () => [], leerGuardados: async () => [] }));
jest.mock('../src/utils/inventarioSalidaVentas', () => ({ egresosVentaHasta: async () => ({ ventas: [] }) }));
jest.mock('../src/database/models/inventarioMovimiento.model', () => ({
    find() {}, findById() {}, exists() {}, distinct() {}, create() {}
}));
jest.mock('../src/database/models/inventarioRubro.model', () => ({ find() {} }));
jest.mock('../src/database/models/plato.model', () => ({}));
jest.mock('../src/database/models/inventarioMapa.model', () => ({}));
jest.mock('../src/database/models/inventarioReporte.model', () => ({}));
jest.mock('../src/utils/logger', () => ({}));

const rubro = 'pachamanca-chancho';
const hora = (h) => new Date(`2026-11-11T${h}:00-05:00`);
const movimiento = (tipoProducto, cantidad, motivo, fecha, extra) => ({
    _id: new Types.ObjectId(), rubro, nombre: 'Cerdo pachamanca', clase: 'ingreso', tipoProducto, cantidad, motivo, fecha, ...extra
});

function modeloEnMemoria(docs) {
    const cadena = (data) => {
        const query = { lean: async () => data };
        for (const metodo of ['select', 'sort', 'limit', 'populate']) query[metodo] = () => query;
        return query;
    };
    jest.spyOn(Rubro, 'find').mockImplementation(() => cadena([]));
    jest.spyOn(Movimiento, 'find').mockImplementation(({ clase, rubro: clave, fecha }) => cadena(docs.filter((m) => (
        (!clase || m.clase === clase) && (typeof clave !== 'string' || m.rubro === clave) &&
        (!fecha?.$gte || m.fecha >= fecha.$gte) && (!fecha?.$lte || m.fecha <= fecha.$lte)
    ))));
    jest.spyOn(Movimiento, 'findById').mockImplementation((id) => cadena(docs.find((m) => String(m._id) === String(id))));
    jest.spyOn(Movimiento, 'exists').mockImplementation(async ({ reviertePase }) => docs.some((m) => String(m.reviertePase) === String(reviertePase)));
    jest.spyOn(Movimiento, 'distinct').mockImplementation(async (_, { reviertePase }) => (
        docs.filter((m) => reviertePase.$in.some((id) => String(m.reviertePase) === String(id))).map((m) => m.reviertePase)
    ));
    jest.spyOn(Movimiento, 'create').mockImplementation(async (datos) => {
        if (docs.some((m) => String(m.reviertePase) === String(datos.reviertePase))) throw Object.assign(new Error(), { code: 11000 });
        const doc = { ...datos, _id: new Types.ObjectId(), fecha: new Date() };
        docs.push(doc);
        return { toObject: () => doc };
    });
}

beforeEach(() => jest.useFakeTimers({ now: hora('12:00') }));
afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
});

test.each([false, true])('la reversión es atómica y se identifica en las dos lupas (histórico: %s)', async (historico) => {
    const entrada = movimiento('cocido', 5, 'Pasa de crudo Cerdo pachamanca', hora('09:00'), historico ? {} : { paseTipo: true });
    const docs = [movimiento('crudo', 5, 'Ingreso crudo', hora('08:00')), entrada];
    const salida = historico ? movimiento('crudo', -5, 'Pasa a cocido Cerdo pachamanca', hora('09:00')) : null;
    if (salida) docs.push(salida);
    modeloEnMemoria(docs);

    const id = String(entrada._id);
    const intentos = await Promise.allSettled([inventario.revertirPase(String(salida?._id || entrada._id)), inventario.revertirPase(id)]);
    expect(intentos.map((p) => p.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(intentos.find((p) => p.status === 'rejected').reason).toMatchObject({ statusCode: 409 });
    expect(docs.filter((m) => m.reviertePase)).toMatchObject([{ tipoProducto: 'crudo', cantidad: 5, paseTipo: true }]);

    const visibles = await inventario.listarMovimientos({});
    expect(visibles.filter((m) => m.paseId === id)).toHaveLength(2);
    expect(visibles.filter((m) => m.paseId === id).every((m) => m.paseRevertido)).toBe(true);
});

test('si el cocido ya salió, rechaza revertir sin grabar ningún movimiento', async () => {
    const pase = movimiento('cocido', 5, 'Pasa de crudo Cerdo pachamanca', hora('09:00'), { paseTipo: true });
    modeloEnMemoria([movimiento('crudo', 5, 'Ingreso crudo', hora('08:00')), pase,
        movimiento('cocido', 1, 'Venta manual', hora('10:00'), { clase: 'egreso' })]);
    await expect(inventario.revertirPase(String(pase._id))).rejects.toThrow('El stock disponible es insuficiente');
    expect(Movimiento.create).not.toHaveBeenCalled();
});
