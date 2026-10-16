/**
 * Adaptador fiscal simulado para desarrollo y tests.
 * Simula latencia de red y responde CDR código 0 (aceptado) con hash SHA-256.
 * NO genera XML válido ni envía nada a SUNAT.
 * @module facturacion/providers/mockFiscal
 */

const crypto = require('crypto');
const ProveedorFiscal = require('./ProveedorFiscal');

const NOMBRES_TIPO = { '01': 'Factura', '03': 'Boleta', '07': 'Nota de Credito' };

class MockFiscalAdapter extends ProveedorFiscal {
    /**
     * @param {{latenciaMs?: number, fallarCon?: Error|null}} [opciones]
     */
    constructor(opciones = {}) {
        super(opciones);
        this.latenciaMs = opciones.latenciaMs ?? 150;
        this.fallarCon = opciones.fallarCon ?? null;
        /** @type {Map<string, Object>} */
        this.tickets = new Map();
    }

    get nombre() {
        return 'mock';
    }

    /** @private */
    async esperar() {
        await new Promise((r) => setTimeout(r, this.latenciaMs));
        if (this.fallarCon) throw this.fallarCon;
    }

    /** @private */
    static hash(contenido) {
        return crypto.createHash('sha256').update(JSON.stringify(contenido)).digest('base64');
    }

    async emitir(comprobante) {
        await this.esperar();
        const { ruc, tipo, serie, numero } = comprobante;
        const xmlNombre = `${ruc}-${tipo}-${serie}-${numero}`;
        return {
            aceptado: true,
            codigo: '0',
            descripcion: `La ${NOMBRES_TIPO[tipo] || 'Comprobante'} numero ${serie}-${Number(numero)}, ha sido aceptada`,
            observaciones: [],
            hash: MockFiscalAdapter.hash({ xmlNombre, totales: comprobante.totales, items: comprobante.items }),
            xmlNombre,
            xmlBase64: null,
            cdrBase64: null,
        };
    }

    async enviarResumen(resumen) {
        await this.esperar();
        const ticket = `MOCK-RC-${Date.now()}`;
        this.tickets.set(ticket, { tipo: 'RC', resumen });
        return { ticket };
    }

    async comunicarBaja(baja) {
        await this.esperar();
        const ticket = `MOCK-RA-${Date.now()}`;
        this.tickets.set(ticket, { tipo: 'RA', baja });
        return { ticket };
    }

    async consultarTicket(ticket) {
        await this.esperar();
        if (!this.tickets.has(ticket)) {
            return { aceptado: false, codigo: '0127', descripcion: 'El ticket no existe', observaciones: [], hash: null, xmlNombre: null, xmlBase64: null, cdrBase64: null };
        }
        return { aceptado: true, codigo: '0', descripcion: `Ticket ${ticket} procesado`, observaciones: [], hash: null, xmlNombre: null, xmlBase64: null, cdrBase64: null };
    }

    async consultarEstado({ serie, numero }) {
        await this.esperar();
        return { aceptado: true, codigo: '0', descripcion: `Comprobante ${serie}-${numero} aceptado`, observaciones: [], hash: null, xmlNombre: null, xmlBase64: null, cdrBase64: null };
    }
}

module.exports = MockFiscalAdapter;
