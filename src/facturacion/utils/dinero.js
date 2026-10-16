/**
 * Aritmética monetaria en enteros escalados (céntimos), sin operaciones float.
 * @module facturacion/utils/dinero
 */

/**
 * Convierte un valor decimal (number o string) a entero escalado con redondeo half-up.
 * `aEscalado('12.345', 2) === 1235`.
 * @param {number|string} valor
 * @param {number} decimales
 * @returns {number}
 */
function aEscalado(valor, decimales) {
    if (valor === null || valor === undefined || valor === '') return 0;
    let texto = typeof valor === 'number' ? valor.toFixed(10) : String(valor).trim();
    if (!/^-?\d+(\.\d+)?$/.test(texto)) {
        throw new TypeError(`Monto inválido: ${valor}`);
    }
    const negativo = texto.startsWith('-');
    if (negativo) texto = texto.slice(1);
    const [entero, fraccion = ''] = texto.split('.');
    const fracPad = (fraccion + '0'.repeat(decimales + 1)).slice(0, decimales + 1);
    let escalado = Number(entero + fracPad.slice(0, decimales));
    if (Number(fracPad[decimales]) >= 5) escalado += 1;
    if (!Number.isSafeInteger(escalado)) throw new RangeError(`Monto fuera de rango: ${valor}`);
    return negativo ? -escalado : escalado;
}

/** @param {number|string} valor @returns {number} céntimos */
const aCentimos = (valor) => aEscalado(valor, 2);

/**
 * División entera con redondeo half-up (simétrico para negativos).
 * @param {number} numerador
 * @param {number} denominador
 * @returns {number}
 */
function dividirRedondeo(numerador, denominador) {
    if (denominador === 0) throw new RangeError('División entre cero');
    const signo = Math.sign(numerador) * Math.sign(denominador);
    const n = Math.abs(numerador);
    const d = Math.abs(denominador);
    return signo * Math.floor((2 * n + d) / (2 * d));
}

/** @param {number} centimos @returns {number} soles (2 decimales exactos para mostrar/persistir) */
const aSoles = (centimos) => Number((centimos / 100).toFixed(2));

/** @param {number} centimos @returns {string} "123.45" */
function formatear(centimos) {
    const negativo = centimos < 0;
    const abs = Math.abs(centimos);
    const texto = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
    return negativo ? `-${texto}` : texto;
}

/**
 * Reparte `total` entre `pesos` de forma proporcional; el residuo de céntimos
 * se asigna al peso de mayor monto, garantizando Σ partes === total.
 * @param {number} total
 * @param {number[]} pesos
 * @returns {number[]}
 */
function prorratear(total, pesos) {
    const suma = pesos.reduce((a, b) => a + b, 0);
    if (suma === 0) return pesos.map(() => 0);
    const partes = pesos.map((p) => dividirRedondeo(total * p, suma));
    const residuo = total - partes.reduce((a, b) => a + b, 0);
    if (residuo !== 0) {
        let idxMayor = 0;
        pesos.forEach((p, i) => { if (p > pesos[idxMayor]) idxMayor = i; });
        partes[idxMayor] += residuo;
    }
    return partes;
}

module.exports = { aEscalado, aCentimos, dividirRedondeo, aSoles, formatear, prorratear };
