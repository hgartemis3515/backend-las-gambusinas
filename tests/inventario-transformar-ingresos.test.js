const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '../public/inventario.html'), 'utf8');
const code = html.slice(html.indexOf('function inventarioApp()'), html.lastIndexOf('</script>'));

function crearApp() {
    const storage = { getItem: () => null };
    const factory = vm.runInNewContext('(' + code.trim() + ')', {
        window: {}, localStorage: storage, sessionStorage: storage,
        setTimeout: () => 0, clearTimeout: () => {}
    });
    const app = factory();
    app.encolarMovimientos = jest.fn();
    app.api = jest.fn();
    return app;
}

function campo(value, eligible = true) {
    return {
        value,
        dataset: {},
        style: { setProperty: jest.fn() },
        matches: () => eligible,
        closest: () => eligible ? {} : null
    };
}

test.each(['0', '0.0', '0.000', '-0'])('foco y clic vacían %s y salir recupera su valor sin guardar', (value) => {
    const app = crearApp();
    const target = campo(value);
    const event = { target };
    app.prepararNumeroTransformar(event); // focusin
    expect(target.value).toBe('');
    expect(target.dataset.ceroAntesDeEditar).toBe(value);
    app.prepararNumeroTransformar(event); // click después de focusin
    expect(target.value).toBe('');
    expect(target.dataset.ceroAntesDeEditar).toBe(value);
    app.restaurarCeroTransformar(event);
    expect(target.value).toBe(value);
    expect(target.dataset.ceroAntesDeEditar).toBeUndefined();
    expect(app.encolarMovimientos).not.toHaveBeenCalled();
    expect(app.api).not.toHaveBeenCalled();
});

test('change.capture impide enviar un campo vaciado automáticamente desde cero', () => {
    const app = crearApp();
    const target = campo('0');
    app.prepararNumeroTransformar({ target });
    const event = { target, stopPropagation: jest.fn() };
    app.ignorarIngresoVacio(event);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(target.value).toBe('0');
    expect(target.dataset.ceroAntesDeEditar).toBeUndefined();
    app.restaurarCeroTransformar({ target });
    expect(target.value).toBe('0');
    expect(app.encolarMovimientos).not.toHaveBeenCalled();
    expect(app.api).not.toHaveBeenCalled();
});

test('escribir cero sobre un ingreso existente y volver a pulsarlo permite deshacerlo', () => {
    const app = crearApp();
    const target = campo('1');
    app.prepararNumeroTransformar({ type: 'focusin', target });
    target.value = '0';
    app.prepararNumeroTransformar({ type: 'click', target });
    expect(target.value).toBe('');
    const event = { target, stopPropagation: jest.fn() };
    app.ignorarIngresoVacio(event);
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(Number(target.value)).toBe(0);
    app.restaurarCeroTransformar(event);
    expect(target.dataset.valorAlEnfocar).toBeUndefined();
});

test.each(['12', '1.5', '-3', '-0.5'])('foco y clic conservan el valor no nulo %s', (value) => {
    const app = crearApp();
    const target = campo(value);
    const event = { target, stopPropagation: jest.fn() };
    app.prepararNumeroTransformar(event);
    app.prepararNumeroTransformar(event);
    app.ignorarIngresoVacio(event);
    app.restaurarCeroTransformar(event);
    expect(target.value).toBe(value);
    expect(target.dataset.ceroAntesDeEditar).toBeUndefined();
    expect(event.stopPropagation).not.toHaveBeenCalled();
});

test('el valor escrito tras vaciar un cero se conserva y permite guardar el change', () => {
    const app = crearApp();
    const target = campo('0');
    const event = { target, stopPropagation: jest.fn() };
    app.prepararNumeroTransformar(event);
    target.value = '125';
    app.ignorarIngresoVacio(event);
    expect(event.stopPropagation).not.toHaveBeenCalled();
    app.restaurarCeroTransformar(event);
    expect(target.value).toBe('125');
    expect(target.dataset.ceroAntesDeEditar).toBeUndefined();
    expect(target.style.setProperty).toHaveBeenLastCalledWith('width', 'calc(3ch + 1.15rem)', 'important');
});

test('escribir cero expresamente después de enfocar permite procesar el change', () => {
    const app = crearApp();
    const target = campo('0');
    const event = { target, stopPropagation: jest.fn() };
    app.prepararNumeroTransformar(event);
    target.value = '0';
    app.ignorarIngresoVacio(event);
    expect(event.stopPropagation).not.toHaveBeenCalled();
    app.restaurarCeroTransformar(event);
    expect(target.value).toBe('0');
});

test('un vacío que no proviene de borrar cero no se restaura ni cancela', () => {
    const app = crearApp();
    const target = campo('');
    const event = { target, stopPropagation: jest.fn() };
    app.prepararNumeroTransformar(event);
    app.ignorarIngresoVacio(event);
    app.restaurarCeroTransformar(event);
    expect(target.value).toBe('');
    expect(target.dataset.ceroAntesDeEditar).toBeUndefined();
    expect(event.stopPropagation).not.toHaveBeenCalled();
});

test('la delegación ignora otros campos y eventos sin objetivo', () => {
    const app = crearApp();
    const target = campo('0', false);
    const event = { target, stopPropagation: jest.fn() };
    app.prepararNumeroTransformar(event);
    app.ignorarIngresoVacio(event);
    app.restaurarCeroTransformar(event);
    expect(target.value).toBe('0');
    expect(target.style.setProperty).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(() => app.prepararNumeroTransformar({})).not.toThrow();
    expect(() => app.restaurarCeroTransformar({})).not.toThrow();
    expect(() => app.ignorarIngresoVacio({})).not.toThrow();
});
