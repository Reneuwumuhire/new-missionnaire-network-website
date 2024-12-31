import { MongoClient, ServerApiVersion } from 'mongodb';
import { MONGODB_URI } from '$env/static/private';

let client: MongoClient | null = null;

export async function connect() {
    try {
        if (!client) {
            console.log('[MongoDB] Attempting to connect...');
            client = new MongoClient(MONGODB_URI, {
                serverApi: {
                    version: ServerApiVersion.v1,
                    strict: true,
                    deprecationErrors: true,
                }
            });
            await client.connect();
            console.log('[MongoDB] Connected successfully');

            // Test the connection
            const db = client.db("youtube_data");
            const collections = await db.listCollections().toArray();
            console.log('[MongoDB] Available collections:', collections.map(c => c.name));
        }
        return client;
    } catch (error) {
        console.error('[MongoDB] Connection error:', error);
        throw error;
    }
}

export async function getDb() {
    if (!client) {
        await connect();
    }
    return client!.db("youtube_data");
}