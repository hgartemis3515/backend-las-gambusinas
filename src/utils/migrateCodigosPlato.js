/**
 * ONE-TIME: asigna códigos de serie (formato ^[A-Z][0-9]{1,3}$) a platos existentes
 * que aún no tengan el campo `codigo`. Genera códigos temporales únicos basados en
 * la primera letra de la categoría/nombre + el id numérico, e imprime un CSV de
 * mapeo para revisión manual del admin en platos.html.
 *
 * Uso:  node src/utils/migrateCodigosPlato.js   (desde backend-gambusinas, con DBLOCAL en .env)
 */
require('dotenv/config');
const mongoose = require('mongoose');
const { validarCodigoPlato, REGEX_CODIGO_PLATO } = require('./validarCodigoPlato');

async function run() {
    if (!process.env.DBLOCAL) {
        console.error('Falta DBLOCAL en .env');
        process.exit(1);
    }
    await mongoose.connect(process.env.DBLOCAL);
    const plato = require('../database/models/plato.model');
    const { syncJsonFile } = require('./jsonSync');

    const sinCodigo = await plato.find({ $or: [{ codigo: null }, { codigo: { $exists: false } }, { codigo: '' }] });
    console.log(`Platos sin código: ${sinCodigo.length}`);

    if (sinCodigo.length === 0) {
        console.log('No hay platos por migrar.');
        await mongoose.disconnect();
        return;
    }

    // Códigos ya existentes en BD para evitar colisiones
    const existentes = new Set((await plato.distinct('codigo')).map(c => String(c).toUpperCase()).filter(Boolean));

    const lineasCsv = ['id,nombre,codigo_asignado'];
    let asignados = 0;
    let conflictos = 0;

    for (const doc of sinCodigo) {
        let letra = 'P';
        const base = (doc.categoria || doc.nombre || 'P').trim().charAt(0).toUpperCase();
        if (base && /[A-Z]/.test(base)) letra = base;

        // Construir código: letra + dígitos del id, truncado a 3 (formato L23)
        const digitos = String(doc.id != null ? doc.id : (Math.abs(doc._id.hashCode?.() || Math.floor(Math.random() * 900))));
        const codigoBase = letra + digitos.slice(0, 3).padStart(1, '0').slice(-3);

        // Buscar código único válido
        let codigo = codigoBase;
        let intento = 0;
        while (true) {
            const r = validarCodigoPlato(codigo);
            if (!r.valido) {
                intento += 1;
                codigo = letra + (Math.floor(Math.random() * 900) + 100);
                if (intento > 50) break;
                continue;
            }
            if (!existentos.has(r.codigo)) {
                codigo = r.codigo;
                break;
            }
            intento += 1;
            codigo = letra + (Math.floor(Math.random() * 900) + 100);
            if (intento > 50) break;
        }

        if (!REGEX_CODIGO_PLATO.test(codigo)) {
            console.warn(`No se pudo generar código para id=${doc.id} nombre="${doc.nombre}"`);
            conflictos += 1;
            lineasCsv.push(`${doc.id},"${(doc.nombre || '').replace(/"/g, '""')}",NO_ASIGNADO`);
            continue;
        }

        try {
            doc.codigo = codigo;
            await doc.save();
            existentes.add(codigo);
            asignados += 1;
            lineasCsv.push(`${doc.id},"${(doc.nombre || '').replace(/"/g, '""')}",${codigo}`);
        } catch (err) {
            if (err.code === 11000) {
                console.warn(`Conflicto de duplicado con código ${codigo} (id=${doc.id})`);
                conflictos += 1;
                lineasCsv.push(`${doc.id},"${(doc.nombre || '').replace(/"/g, '""')}",CONFLICTO`);
            } else {
                throw err;
            }
        }
    }

    // Sincronizar JSON
    const todos = await plato.find({});
    await syncJsonFile('platos.json', todos);

    console.log(`\nResumen: ${asignados} códigos asignados, ${conflictos} conflictos.`);
    console.log('\n--- CSV de mapeo (revisar y ajustar en platos.html) ---');
    console.log(lineasCsv.join('\n'));

    await mongoose.disconnect();
}

run().catch(err => {
    console.error('Error en migración de códigos:', err);
    process.exit(1);
});