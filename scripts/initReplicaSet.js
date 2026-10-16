/**
 * Inicia rs0 en el Mongo local si todavía no es replica set.
 * Uso: npm run mongo:rs0
 * El proceso mongod tiene que haber arrancado con --replSet rs0.
 */

const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_DIRECT || 'mongodb://localhost:27017/?directConnection=true';

async function main() {
    const client = new MongoClient(uri);
    await client.connect();
    try {
        const r = await client.db('admin').command({
            replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] },
        });
        console.log('Replica set rs0 iniciado', r.ok);
    } catch (err) {
        console.log(err.codeName || 'YA_INICIADO', err.message);
    }
    await new Promise((r) => setTimeout(r, 1500));
    const hello = await client.db('admin').command({ hello: 1 });
    console.log(`set=${hello.setName || 'ninguno'} primary=${hello.isWritablePrimary === true}`);
    if (hello.setName !== 'rs0' || hello.isWritablePrimary !== true) process.exit(1);
    await client.close();
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
