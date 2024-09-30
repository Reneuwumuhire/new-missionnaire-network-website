import { MONGODB_URI } from '$env/static/private';
import { Db, MongoClient } from 'mongodb';

const client = new MongoClient("mongodb+srv://renefrontend:JjjRblRkX8dDuS0d@cluster0.z9vgqkr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0");

// connect to the database
export async function connect(): Promise<void> {
    await client.connect();
}

// disconnect from the database
export async function disconnect(): Promise<void> {
    await client.close();
}

// get the database
export function getDB(): Db {
    return client.db('youtube_data');
}