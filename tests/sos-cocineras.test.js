jest.mock('../src/utils/redisCache', () => ({
  getCustom: jest.fn(),
  setCustom: jest.fn(),
}));

const redisCache = require('../src/utils/redisCache');
const { getSosCocineras, setSosCocineras, emitSosCocineras } = require('../src/services/sosCocineras.service');

describe('sosCocineras.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.io = undefined;
  });

  test('getSosCocineras lee "1" como true', async () => {
    redisCache.getCustom.mockResolvedValue('1');
    await expect(getSosCocineras()).resolves.toBe(true);
  });

  test('getSosCocineras ausente es false', async () => {
    redisCache.getCustom.mockResolvedValue(null);
    await expect(getSosCocineras()).resolves.toBe(false);
  });

  test('setSosCocineras persiste y emite a /cocina', async () => {
    redisCache.setCustom.mockResolvedValue(undefined);
    const emit = jest.fn();
    global.io = { of: jest.fn(() => ({ emit })) };
    await expect(setSosCocineras(true)).resolves.toBe(true);
    expect(redisCache.setCustom).toHaveBeenCalledWith('cocina', 'sosCocineras', '1', expect.any(Number));
    emitSosCocineras({ activo: true, by: { id: 'u1' } });
    expect(global.io.of).toHaveBeenCalledWith('/cocina');
    expect(emit).toHaveBeenCalledWith('sos-cocineras', expect.objectContaining({ activo: true }));
  });
});
