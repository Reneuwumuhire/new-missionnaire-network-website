import { getDb, connect } from './src/db/mongo';

async function check() {
    await connect();
    const db = await getDb();
    if (!db) return;
    const records = await db.collection('analytics').find({}).limit(5).toArray();
    console.log(JSON.stringify(records, null, 2));
    process.exit(0);
}
check();
