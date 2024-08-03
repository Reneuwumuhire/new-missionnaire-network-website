import { MongoClient } from 'mongodb';
import { MONGODB_URI } from '$env/static/private';

const client = new MongoClient(MONGODB_URI);

export function startMongo() {
	console.log('Starting Mongo...');
	return client.connect();
}

export default client.db('youtube_data');
// 'mongodb+srv://renefrontend:JjjRblRkX8dDuS0d@cluster0.z9vgqkr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'
