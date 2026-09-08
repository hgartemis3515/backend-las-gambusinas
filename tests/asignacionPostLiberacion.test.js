jest.mock('../src/database/models/comanda.model', () => ({
    findById: jest.fn(),
}));
jest.mock('../src/services/asignacionAutomaticaService', () => ({
    asignarPlatosNuevos: jest.fn(),
}));
jest.mock('../src/services/asignacionAutomaticaGuarnicionesService', () => ({
    asignarGuarnicionesNuevas: jest.fn(),
}));

const Comanda = require('../src/database/models/comanda.model');
const asignacionAutomaticaService = require('../src/services/asignacionAutomaticaService');
const asignacionGuarnicionesService = require('../src/services/asignacionAutomaticaGuarnicionesService');
const {
    aplicarAsignacionAutomaticaTrasLiberarPlatos,
} = require('../src/services/asignacionPostLiberacionService');

function leanDoc(doc) {
    return {
        populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(doc),
        }),
    };
}

describe('asignacionPostLiberacionService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('asigna platos y guarniciones de la comanda liberada', async () => {
        const comanda = { _id: 'c1', platos: [{ platoId: 10, estado: 'en_espera' }], programadaPorReserva: false };
        Comanda.findById.mockReturnValue(leanDoc(comanda));
        asignacionAutomaticaService.asignarPlatosNuevos.mockResolvedValue({ asignados: 1, noAsignados: 0 });
        asignacionGuarnicionesService.asignarGuarnicionesNuevas.mockResolvedValue({ asignados: 0 });

        const res = await aplicarAsignacionAutomaticaTrasLiberarPlatos(['c1'], { origen: 'post_ppa' });

        expect(asignacionAutomaticaService.asignarPlatosNuevos).toHaveBeenCalledWith(comanda);
        expect(asignacionGuarnicionesService.asignarGuarnicionesNuevas).toHaveBeenCalled();
        expect(res.asignados).toBe(1);
    });

    test('no asigna comandas aún programadas por reserva', async () => {
        const comanda = { _id: 'c2', platos: [{ platoId: 10 }], programadaPorReserva: true };
        Comanda.findById.mockReturnValue(leanDoc(comanda));

        await aplicarAsignacionAutomaticaTrasLiberarPlatos(['c2']);

        expect(asignacionAutomaticaService.asignarPlatosNuevos).not.toHaveBeenCalled();
    });

    test('sin ids no llama al motor', async () => {
        const res = await aplicarAsignacionAutomaticaTrasLiberarPlatos([]);
        expect(res).toEqual({ comandas: 0, asignados: 0 });
        expect(Comanda.findById).not.toHaveBeenCalled();
    });
});
