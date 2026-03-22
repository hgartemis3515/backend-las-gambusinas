/**
 * MIGRACIÓN v2: Actualizar bouchers con información de cocinero y tiempo de preparación
 * 
 * Este script replica exactamente la lógica de comandas.html:
 * - getCocineroPlato: busca en procesadoPor y procesandoPor
 * - getTiempoPreparacion: calcula desde tiempos.en_espera hasta tiempos.recoger
 * 
 * Ejecutar con: node scripts/migrar-cocineros-bouchers.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Cargar variables de entorno
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Importar modelos
const boucherModel = require('../src/database/models/boucher.model');
const comandaModel = require('../src/database/models/comanda.model');

// Conexión a MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lasgambusinas';

/**
 * Replica exacta de getCocineroPlato de comandas.html
 */
function getCocineroPlato(item) {
    if (!item) return { nombre: '—', enPreparacion: false };
    
    const estado = item.estado?.toLowerCase() || '';
    const esEstadoFinal = estado === 'recoger' || estado === 'entregado' || estado === 'pagado';
    
    // Si el plato fue finalizado, mostrar quien lo procesó
    if (item.procesadoPor && (item.procesadoPor.alias || item.procesadoPor.nombre)) {
        return {
            nombre: item.procesadoPor.alias || item.procesadoPor.nombre,
            enPreparacion: false
        };
    }
    
    // Si está siendo procesado actualmente
    if (item.procesandoPor && (item.procesandoPor.alias || item.procesandoPor.nombre)) {
        return {
            nombre: item.procesandoPor.alias || item.procesandoPor.nombre,
            enPreparacion: !esEstadoFinal
        };
    }
    
    return { nombre: '—', enPreparacion: false };
}

/**
 * Formatea milisegundos a MM:SS o HH:MM:SS
 */
function formatearTiempo(diffMs) {
    if (diffMs < 0) return '—';
    
    const segundos = Math.floor(diffMs / 1000);
    const minutos = Math.floor(segundos / 60);
    const seg = segundos % 60;
    
    if (minutos >= 60) {
        const horas = Math.floor(minutos / 60);
        const min = minutos % 60;
        return `${horas.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
    }
    
    return `${minutos.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
}

/**
 * Replica exacta de getTiempoPreparacion de comandas.html
 */
function getTiempoPreparacion(item) {
    if (!item) return { tiempo: '—', enPreparacion: false, segundos: 0 };
    
    const estado = item.estado?.toLowerCase() || '';
    const procesandoDesde = item.procesandoPor?.timestamp || item.procesandoPor?.desde;
    const procesadoEn = item.procesadoPor?.timestamp;
    
    // Obtener timestamps del plato si existen
    const tiempos = item.tiempos || {};
    const tiempoRecoger = tiempos.recoger ? new Date(tiempos.recoger).getTime() : null;
    const tiempoEnEspera = tiempos.en_espera ? new Date(tiempos.en_espera).getTime() : null;
    const tiempoPedido = tiempos.pedido ? new Date(tiempos.pedido).getTime() : null;
    
    // Si el plato está en estado final (recoger, entregado, pagado)
    if (estado === 'recoger' || estado === 'entregado' || estado === 'pagado') {
        let tiempoFinal = null;
        let tiempoInicio = null;
        
        // Determinar tiempo de inicio
        if (tiempoEnEspera) {
            tiempoInicio = tiempoEnEspera;
        } else if (tiempoPedido) {
            tiempoInicio = tiempoPedido;
        } else if (procesandoDesde) {
            tiempoInicio = new Date(procesandoDesde).getTime();
        } else if (item.createdAt) {
            tiempoInicio = new Date(item.createdAt).getTime();
        }
        
        // Determinar tiempo final
        if (tiempoRecoger) {
            tiempoFinal = tiempoRecoger;
        } else if (procesadoEn) {
            tiempoFinal = new Date(procesadoEn).getTime();
        }
        
        // Calcular diferencia si tenemos ambos tiempos
        if (tiempoInicio && tiempoFinal) {
            const diffMs = tiempoFinal - tiempoInicio;
            if (diffMs >= 0) {
                return {
                    tiempo: formatearTiempo(diffMs),
                    enPreparacion: false,
                    segundos: Math.floor(diffMs / 1000)
                };
            }
        }
        
        // Si hay procesandoDesde y procesadoEn
        if (procesandoDesde && procesadoEn) {
            const inicio = new Date(procesandoDesde).getTime();
            const fin = new Date(procesadoEn).getTime();
            const diffMs = fin - inicio;
            if (diffMs >= 0) {
                return {
                    tiempo: formatearTiempo(diffMs),
                    enPreparacion: false,
                    segundos: Math.floor(diffMs / 1000)
                };
            }
        }
        
        return { tiempo: '—', enPreparacion: false, segundos: 0 };
    }
    
    // Para platos en preparación, calcular tiempo transcurrido
    if (procesandoDesde) {
        const inicio = new Date(procesandoDesde).getTime();
        const ahora = Date.now();
        const diffMs = ahora - inicio;
        if (diffMs >= 0) {
            return {
                tiempo: formatearTiempo(diffMs),
                enPreparacion: true,
                segundos: Math.floor(diffMs / 1000)
            };
        }
    }
    
    return { tiempo: '—', enPreparacion: false, segundos: 0 };
}

/**
 * Función principal de migración
 */
async function migrarCocinerosBouchers() {
    console.log('🚀 Iniciando migración v2 de cocineros a bouchers...\n');
    
    try {
        // Conectar a MongoDB
        console.log('📡 Conectando a MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Conectado a MongoDB\n');
        
        // Obtener todos los bouchers
        const bouchers = await boucherModel.find({ isActive: true });
        
        console.log(`📋 Encontrados ${bouchers.length} bouchers activos\n`);
        
        let actualizados = 0;
        let sinCambios = 0;
        let errores = 0;
        
        for (const boucher of bouchers) {
            try {
                const boucherNumber = boucher.boucherNumber || boucher.voucherId;
                console.log(`\n📝 Procesando Boucher #${boucherNumber}...`);
                
                // Obtener IDs de comandas asociadas
                const comandasIds = boucher.comandas || [];
                if (comandasIds.length === 0) {
                    console.log(`   ⚠️  No tiene comandas asociadas`);
                    sinCambios++;
                    continue;
                }
                
                // Obtener comandas completas
                const comandas = await comandaModel.find({ _id: { $in: comandasIds } });
                
                // Crear un mapa plano de todos los platos de todas las comandas
                const todosLosPlatos = [];
                for (const comanda of comandas) {
                    const comandaNumber = comanda.comandaNumber;
                    const platos = comanda.platos || [];
                    
                    for (let i = 0; i < platos.length; i++) {
                        const plato = platos[i];
                        if (plato.eliminado) continue;
                        
                        const platoId = plato.platoId || (plato.plato?._id ? plato.plato._id.toString() : null) || (plato.plato?.id);
                        
                        todosLosPlatos.push({
                            comandaNumber,
                            platoId,
                            index: i,
                            nombrePlato: plato.plato?.nombre || plato.nombre || 'Desconocido',
                            platoComanda: plato
                        });
                    }
                }
                
                console.log(`   📦 ${todosLosPlatos.length} platos encontrados en ${comandas.length} comandas`);
                
                // Actualizar cada plato del boucher
                let cambios = false;
                const platosActualizados = boucher.platos.map((platoBoucher, idx) => {
                    const platoId = platoBoucher.platoId?.toString() || (platoBoucher.plato?._id?.toString()) || (platoBoucher.plato?.toString());
                    const comandaNumber = platoBoucher.comandaNumber;
                    const nombrePlato = platoBoucher.nombre;
                    
                    // Buscar el plato correspondiente en las comandas
                    // Primero buscar por comandaNumber y platoId exactos
                    let platoEncontrado = todosLosPlatos.find(p => 
                        p.comandaNumber === comandaNumber && 
                        (p.platoId?.toString() === platoId?.toString() || p.platoId === platoId)
                    );
                    
                    // Si no se encuentra, buscar por índice en la comanda correspondiente
                    if (!platoEncontrado && comandaNumber) {
                        const platosComanda = todosLosPlatos.filter(p => p.comandaNumber === comandaNumber);
                        if (platosComanda.length > idx) {
                            platoEncontrado = platosComanda[idx];
                        }
                    }
                    
                    // Si aún no se encuentra, buscar por nombre de plato
                    if (!platoEncontrado) {
                        platoEncontrado = todosLosPlatos.find(p => 
                            p.nombrePlato === nombrePlato || 
                            p.platoComanda.plato?.nombre === nombrePlato
                        );
                    }
                    
                    if (platoEncontrado) {
                        const infoCocinero = getCocineroPlato(platoEncontrado.platoComanda);
                        const infoTiempo = getTiempoPreparacion(platoEncontrado.platoComanda);
                        
                        const cocineroNombre = infoCocinero.nombre !== '—' ? infoCocinero.nombre : null;
                        const cocineroId = platoEncontrado.platoComanda.procesadoPor?.cocineroId || 
                                          platoEncontrado.platoComanda.procesandoPor?.cocineroId || null;
                        const tiempoPreparacion = infoTiempo.tiempo !== '—' ? infoTiempo.tiempo : null;
                        
                        if (cocineroNombre || tiempoPreparacion) {
                            cambios = true;
                            console.log(`   ✅ Plato "${nombrePlato}": Cocinero=${cocineroNombre || '—'}, Tiempo=${tiempoPreparacion || '—'}`);
                            
                            return {
                                ...platoBoucher.toObject ? platoBoucher.toObject() : platoBoucher,
                                cocinero: cocineroNombre,
                                cocineroId: cocineroId,
                                tiempoPreparacion: tiempoPreparacion
                            };
                        }
                    }
                    
                    return platoBoucher.toObject ? platoBoucher.toObject() : platoBoucher;
                });
                
                if (cambios) {
                    boucher.platos = platosActualizados;
                    await boucher.save();
                    actualizados++;
                    console.log(`   💾 Boucher #${boucherNumber} actualizado`);
                } else {
                    sinCambios++;
                    console.log(`   ℹ️  No se encontró información nueva para actualizar`);
                }
                
            } catch (error) {
                errores++;
                console.error(`   ❌ Error procesando boucher: ${error.message}`);
            }
        }
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 RESUMEN DE MIGRACIÓN v2');
        console.log('='.repeat(50));
        console.log(`✅ Bouchers actualizados: ${actualizados}`);
        console.log(`⏭️  Bouchers sin cambios: ${sinCambios}`);
        console.log(`❌ Errores: ${errores}`);
        console.log(`📋 Total procesados: ${bouchers.length}`);
        console.log('='.repeat(50));
        
    } catch (error) {
        console.error('❌ Error en la migración:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Desconectado de MongoDB');
    }
}

// Ejecutar migración
migrarCocinerosBouchers()
    .then(() => {
        console.log('\n✅ Migración completada exitosamente');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error en la migración:', error);
        process.exit(1);
    });
