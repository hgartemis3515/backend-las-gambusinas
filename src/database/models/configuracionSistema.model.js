/**
 * Modelo de Configuración del Sistema - Las Gambusinas
 * 
 * Singleton que almacena la configuración global del sistema:
 * - Moneda y precios
 * - IGV y política de impuestos
 * - Datos fiscales del restaurante
 * - Métodos de pago
 * - Configuración de redondeo
 */

const mongoose = require('mongoose');
const moment = require('moment-timezone');

const CONFIGURACION_DEFAULT = {
    // Moneda y precios
    moneda: 'PEN',
    simboloMoneda: 'S/.',
    decimales: 2,
    posicionSimbolo: 'antes', // 'antes' | 'despues'
    
    // IGV e impuestos
    igvPorcentaje: 18,
    preciosIncluyenIGV: false,
    nombreImpuestoPrincipal: 'IGV',
    
    // Política de redondeo
    politicaRedondeo: 'total', // 'linea' | 'total' | 'banco-peru'
    redondearA: 0.01, // 0.01, 0.05, 0.10, 1.00
    
    // Formato de números
    formatoSeparadores: {
        separadorMiles: ',',
        separadorDecimales: '.'
    },
    
    // Datos fiscales del restaurante
    datosFiscales: {
        nombreComercial: 'Las Gambusinas',
        razonSocial: '',
        ruc: '',
        direccionFiscal: '',
        telefono: '',
        email: '',
        logoUrl: ''
    },
    
    // Ubicación y zona horaria
    pais: 'PE',
    zonaHoraria: 'America/Lima',
    idiomaPrincipal: 'es-PE',
    
    // Cargo de servicio (propina automática)
    cargoServicio: {
        activo: false,
        porcentaje: 10,
        incluyeImpuesto: false,
        nombre: 'Servicio'
    },
    
    // Modo de precios
    modoPrecios: 'unico', // 'unico' | 'multi-lista'
    
    // Métodos de pago permitidos
    metodosPago: {
        efectivo: { activo: true, requiereReferencia: false },
        tarjeta: { activo: true, requiereReferencia: true },
        yape: { activo: true, requiereReferencia: true },
        plin: { activo: true, requiereReferencia: true },
        transferencia: { activo: false, requiereReferencia: true }
    },
    
    // Propinas
    propinas: {
        habilitadas: true,
        sugerida: 10,
        obligatoria: false
    },
    
    // Descuentos
    descuentos: {
        habilitados: true,
        maximoSinAutorizacion: 10
    },
    
    // Numeración de comprobantes
    numeracion: {
        prefijoVoucher: '',
        serieBoleta: 'B001',
        serieFactura: 'F001',
        numeracionAutomatica: true
    },
    
    // Configuración de tickets
    tickets: {
        mostrarIGVDesglosado: true,
        mensajePie: 'Gracias por su visita',
        mostrarComplementos: true
    },
    
    // Horarios de operación
    horarios: {
        horaApertura: '08:00',
        horaCierre: '23:00',
        diasOperacion: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
    },
    
    // Seguridad
    seguridad: {
        timeoutInactividadMin: 30,
        sesionesSimultaneas: 3,
        requiere2FA: false,
        auditoriaExtendida: true
    },
    
    // Cierre de caja
    cierreCaja: {
        bloquearSinCierreAnterior: false,
        requerirEfectivoInicial: true,
        cierreAutomatico: false,
        horaCierreAutomatico: '23:59'
    },
    
    // SEO y Metadatos
    seo: {
        metaTitle: 'Las Gambusinas - Sistema POS',
        metaDescription: 'Sistema de punto de venta para gestión de restaurante. Control de mesas, comandas, pedidos y más.',
        canonicalUrl: '',
        ogTitle: 'Las Gambusinas - Restaurante',
        ogDescription: 'Sistema de gestión integral para restaurantes. Control de mesas, comandas y pedidos en tiempo real.',
        ogImage: '',
        ogUrl: '',
        ogType: 'website',
        twitterCard: 'summary_large_image',
        twitterSite: '',
        twitterTitle: 'Las Gambusinas - Sistema POS',
        twitterDescription: 'Sistema de punto de venta para gestión de restaurante',
        twitterImage: ''
    }
};

const configuracionSistemaSchema = new mongoose.Schema({
    // Identificador único para garantizar singleton
    _id: {
        type: String,
        default: 'configuracion_unica'
    },
    
    // Moneda y precios
    moneda: {
        type: String,
        required: true,
        uppercase: true,
        minlength: 3,
        maxlength: 3,
        default: CONFIGURACION_DEFAULT.moneda
    },
    simboloMoneda: {
        type: String,
        required: true,
        default: CONFIGURACION_DEFAULT.simboloMoneda
    },
    decimales: {
        type: Number,
        required: true,
        min: 0,
        max: 4,
        default: CONFIGURACION_DEFAULT.decimales
    },
    posicionSimbolo: {
        type: String,
        enum: ['antes', 'despues'],
        default: CONFIGURACION_DEFAULT.posicionSimbolo
    },
    
    // IGV e impuestos
    igvPorcentaje: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        default: CONFIGURACION_DEFAULT.igvPorcentaje
    },
    preciosIncluyenIGV: {
        type: Boolean,
        required: true,
        default: CONFIGURACION_DEFAULT.preciosIncluyenIGV
    },
    nombreImpuestoPrincipal: {
        type: String,
        required: true,
        default: CONFIGURACION_DEFAULT.nombreImpuestoPrincipal
    },
    
    // Política de redondeo
    politicaRedondeo: {
        type: String,
        enum: ['linea', 'total', 'banco-peru'],
        default: CONFIGURACION_DEFAULT.politicaRedondeo
    },
    redondearA: {
        type: Number,
        enum: [0.01, 0.05, 0.10, 1.00],
        default: CONFIGURACION_DEFAULT.redondearA
    },
    
    // Formato de números
    formatoSeparadores: {
        separadorMiles: {
            type: String,
            default: CONFIGURACION_DEFAULT.formatoSeparadores.separadorMiles
        },
        separadorDecimales: {
            type: String,
            default: CONFIGURACION_DEFAULT.formatoSeparadores.separadorDecimales
        }
    },
    
    // Datos fiscales del restaurante
    datosFiscales: {
        nombreComercial: {
            type: String,
            default: CONFIGURACION_DEFAULT.datosFiscales.nombreComercial
        },
        razonSocial: {
            type: String,
            default: CONFIGURACION_DEFAULT.datosFiscales.razonSocial
        },
        ruc: {
            type: String,
            default: CONFIGURACION_DEFAULT.datosFiscales.ruc
        },
        direccionFiscal: {
            type: String,
            default: CONFIGURACION_DEFAULT.datosFiscales.direccionFiscal
        },
        telefono: {
            type: String,
            default: CONFIGURACION_DEFAULT.datosFiscales.telefono
        },
        email: {
            type: String,
            default: CONFIGURACION_DEFAULT.datosFiscales.email
        },
        logoUrl: {
            type: String,
            default: CONFIGURACION_DEFAULT.datosFiscales.logoUrl
        }
    },
    
    // Ubicación y zona horaria
    pais: {
        type: String,
        uppercase: true,
        minlength: 2,
        maxlength: 2,
        default: CONFIGURACION_DEFAULT.pais
    },
    zonaHoraria: {
        type: String,
        default: CONFIGURACION_DEFAULT.zonaHoraria
    },
    idiomaPrincipal: {
        type: String,
        default: CONFIGURACION_DEFAULT.idiomaPrincipal
    },
    
    // Cargo de servicio
    cargoServicio: {
        activo: {
            type: Boolean,
            default: CONFIGURACION_DEFAULT.cargoServicio.activo
        },
        porcentaje: {
            type: Number,
            min: 0,
            max: 100,
            default: CONFIGURACION_DEFAULT.cargoServicio.porcentaje
        },
        incluyeImpuesto: {
            type: Boolean,
            default: CONFIGURACION_DEFAULT.cargoServicio.incluyeImpuesto
        },
        nombre: {
            type: String,
            default: CONFIGURACION_DEFAULT.cargoServicio.nombre
        }
    },
    
    // Modo de precios
    modoPrecios: {
        type: String,
        enum: ['unico', 'multi-lista'],
        default: CONFIGURACION_DEFAULT.modoPrecios
    },
    
    // Métodos de pago
    metodosPago: {
        efectivo: {
            activo: { type: Boolean, default: CONFIGURACION_DEFAULT.metodosPago.efectivo.activo },
            requiereReferencia: { type: Boolean, default: CONFIGURACION_DEFAULT.metodosPago.efectivo.requiereReferencia }
        },
        tarjeta: {
            activo: { type: Boolean, default: CONFIGURACION_DEFAULT.metodosPago.tarjeta.activo },
            requiereReferencia: { type: Boolean, default: CONFIGURACION_DEFAULT.metodosPago.tarjeta.requiereReferencia }
        },
        yape: {
            activo: { type: Boolean, default: CONFIGURACION_DEFAULT.metodosPago.yape.activo },
            requiereReferencia: { type: Boolean, default: CONFIGURACION_DEFAULT.metodosPago.yape.requiereReferencia }
        },
        plin: {
            activo: { type: Boolean, default: CONFIGURACION_DEFAULT.metodosPago.plin.activo },
            requiereReferencia: { type: Boolean, default: CONFIGURACION_DEFAULT.metodosPago.plin.requiereReferencia }
        },
        transferencia: {
            activo: { type: Boolean, default: CONFIGURACION_DEFAULT.metodosPago.transferencia.activo },
            requiereReferencia: { type: Boolean, default: CONFIGURACION_DEFAULT.metodosPago.transferencia.requiereReferencia }
        }
    },
    
    // Propinas
    propinas: {
        habilitadas: {
            type: Boolean,
            default: CONFIGURACION_DEFAULT.propinas.habilitadas
        },
        sugerida: {
            type: Number,
            min: 0,
            max: 100,
            default: CONFIGURACION_DEFAULT.propinas.sugerida
        },
        obligatoria: {
            type: Boolean,
            default: CONFIGURACION_DEFAULT.propinas.obligatoria
        }
    },
    
    // Descuentos
    descuentos: {
        habilitados: {
            type: Boolean,
            default: CONFIGURACION_DEFAULT.descuentos.habilitados
        },
        maximoSinAutorizacion: {
            type: Number,
            min: 0,
            max: 100,
            default: CONFIGURACION_DEFAULT.descuentos.maximoSinAutorizacion
        }
    },
    
    // Numeración de comprobantes
    numeracion: {
        prefijoVoucher: {
            type: String,
            default: CONFIGURACION_DEFAULT.numeracion.prefijoVoucher
        },
        serieBoleta: {
            type: String,
            default: CONFIGURACION_DEFAULT.numeracion.serieBoleta
        },
        serieFactura: {
            type: String,
            default: CONFIGURACION_DEFAULT.numeracion.serieFactura
        },
        numeracionAutomatica: {
            type: Boolean,
            default: CONFIGURACION_DEFAULT.numeracion.numeracionAutomatica
        }
    },
    
    // Configuración de tickets
    tickets: {
        mostrarIGVDesglosado: {
            type: Boolean,
            default: CONFIGURACION_DEFAULT.tickets.mostrarIGVDesglosado
        },
        mensajePie: {
            type: String,
            default: CONFIGURACION_DEFAULT.tickets.mensajePie
        },
        mostrarComplementos: {
            type: Boolean,
            default: CONFIGURACION_DEFAULT.tickets.mostrarComplementos
        }
    },
    
    // Horarios de operación
    horarios: {
        horaApertura: {
            type: String,
            default: CONFIGURACION_DEFAULT.horarios.horaApertura
        },
        horaCierre: {
            type: String,
            default: CONFIGURACION_DEFAULT.horarios.horaCierre
        },
        diasOperacion: [{
            type: String,
            enum: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
        }]
    },
    
    // Seguridad
    seguridad: {
        timeoutInactividadMin: {
            type: Number,
            default: CONFIGURACION_DEFAULT.seguridad.timeoutInactividadMin
        },
        sesionesSimultaneas: {
            type: Number,
            default: CONFIGURACION_DEFAULT.seguridad.sesionesSimultaneas
        },
        requiere2FA: {
            type: Boolean,
            default: CONFIGURACION_DEFAULT.seguridad.requiere2FA
        },
        auditoriaExtendida: {
            type: Boolean,
            default: CONFIGURACION_DEFAULT.seguridad.auditoriaExtendida
        }
    },
    
    // Cierre de caja
    cierreCaja: {
        bloquearSinCierreAnterior: {
            type: Boolean,
            default: CONFIGURACION_DEFAULT.cierreCaja.bloquearSinCierreAnterior
        },
        requerirEfectivoInicial: {
            type: Boolean,
            default: CONFIGURACION_DEFAULT.cierreCaja.requerirEfectivoInicial
        },
        cierreAutomatico: {
            type: Boolean,
            default: CONFIGURACION_DEFAULT.cierreCaja.cierreAutomatico
        },
        horaCierreAutomatico: {
            type: String,
            default: CONFIGURACION_DEFAULT.cierreCaja.horaCierreAutomatico
        }
    },
    
    // SEO y Metadatos
    seo: {
        metaTitle: {
            type: String,
            default: CONFIGURACION_DEFAULT.seo.metaTitle,
            maxlength: 60
        },
        metaDescription: {
            type: String,
            default: CONFIGURACION_DEFAULT.seo.metaDescription,
            maxlength: 160
        },
        canonicalUrl: {
            type: String,
            default: CONFIGURACION_DEFAULT.seo.canonicalUrl
        },
        ogTitle: {
            type: String,
            default: CONFIGURACION_DEFAULT.seo.ogTitle,
            maxlength: 60
        },
        ogDescription: {
            type: String,
            default: CONFIGURACION_DEFAULT.seo.ogDescription,
            maxlength: 200
        },
        ogImage: {
            type: String,
            default: CONFIGURACION_DEFAULT.seo.ogImage
        },
        ogUrl: {
            type: String,
            default: CONFIGURACION_DEFAULT.seo.ogUrl
        },
        ogType: {
            type: String,
            enum: ['website', 'article', 'product', 'profile'],
            default: CONFIGURACION_DEFAULT.seo.ogType
        },
        twitterCard: {
            type: String,
            enum: ['summary', 'summary_large_image', 'app', 'player'],
            default: CONFIGURACION_DEFAULT.seo.twitterCard
        },
        twitterSite: {
            type: String,
            default: CONFIGURACION_DEFAULT.seo.twitterSite
        },
        twitterTitle: {
            type: String,
            default: CONFIGURACION_DEFAULT.seo.twitterTitle,
            maxlength: 70
        },
        twitterDescription: {
            type: String,
            default: CONFIGURACION_DEFAULT.seo.twitterDescription,
            maxlength: 200
        },
        twitterImage: {
            type: String,
            default: CONFIGURACION_DEFAULT.seo.twitterImage
        }
    },
    
    // Estado
    isActive: {
        type: Boolean,
        default: true
    },
    
    // Metadata
    version: {
        type: Number,
        default: 1
    },
    
    ultimaModificacionPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        default: null
    }
}, {
    timestamps: true,
    strict: true
});

// Índice para garantizar que solo exista un documento
configuracionSistemaSchema.index({ _id: 1 }, { unique: true });

// Método estático para obtener la configuración (crea una si no existe)
configuracionSistemaSchema.statics.obtenerConfiguracion = async function() {
    let config = await this.findById('configuracion_unica');
    
    if (!config) {
        config = await this.create({
            _id: 'configuracion_unica',
            ...CONFIGURACION_DEFAULT,
            horarios: {
                ...CONFIGURACION_DEFAULT.horarios,
                diasOperacion: CONFIGURACION_DEFAULT.horarios.diasOperacion
            }
        });
        console.log('✅ Configuración del sistema creada con valores por defecto');
    }
    
    return config;
};

// Método para formatear un monto según la configuración
configuracionSistemaSchema.methods.formatearMonto = function(monto) {
    const montoFormateado = Number(monto).toFixed(this.decimales);
    const partes = montoFormateado.split('.');
    const enteros = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, this.formatoSeparadores.separadorMiles);
    const decimales = partes[1] || '';
    
    const montoConFormato = decimales 
        ? `${enteros}${this.formatoSeparadores.separadorDecimales}${decimales}`
        : enteros;
    
    return this.posicionSimbolo === 'antes' 
        ? `${this.simboloMoneda} ${montoConFormato}`
        : `${montoConFormato} ${this.simboloMoneda}`;
};

// Método para calcular totales con IGV
configuracionSistemaSchema.methods.calcularTotales = function(subtotalPlatos) {
    const igvFactor = this.igvPorcentaje / 100;
    
    let subtotalSinIGV, igv, total, subtotalConIGV;
    
    if (this.preciosIncluyenIGV) {
        // Los precios ya incluyen IGV
        subtotalConIGV = subtotalPlatos;
        igv = subtotalConIGV * (igvFactor / (1 + igvFactor));
        subtotalSinIGV = subtotalConIGV - igv;
        total = subtotalConIGV;
    } else {
        // Los precios NO incluyen IGV (modo clásico)
        subtotalSinIGV = subtotalPlatos;
        igv = subtotalSinIGV * igvFactor;
        total = subtotalSinIGV + igv;
        subtotalConIGV = total;
    }
    
    // Aplicar redondeo
    const redondear = (valor) => {
        switch (this.politicaRedondeo) {
            case 'banco-peru':
                // Redondeo bancario (a par más cercano)
                const multiplicador = 1 / this.redondearA;
                return Math.round(valor * multiplicador) / multiplicador;
            case 'total':
            case 'linea':
            default:
                // Redondeo estándar
                return Math.round(valor * Math.pow(10, this.decimales)) / Math.pow(10, this.decimales);
        }
    };
    
    return {
        subtotalSinIGV: redondear(subtotalSinIGV),
        igv: redondear(igv),
        total: redondear(total),
        subtotalConIGV: redondear(subtotalConIGV),
        igvPorcentaje: this.igvPorcentaje,
        preciosIncluyenIGV: this.preciosIncluyenIGV,
        nombreImpuesto: this.nombreImpuestoPrincipal
    };
};

// Pre-save hook para incrementar versión
configuracionSistemaSchema.pre('save', function(next) {
    if (!this.isNew) {
        this.version += 1;
    }
    next();
});

// Exportar modelo y configuración por defecto
const ConfiguracionSistema = mongoose.model('ConfiguracionSistema', configuracionSistemaSchema, 'configuracion_sistema');

module.exports = ConfiguracionSistema;
module.exports.CONFIGURACION_DEFAULT = CONFIGURACION_DEFAULT;
