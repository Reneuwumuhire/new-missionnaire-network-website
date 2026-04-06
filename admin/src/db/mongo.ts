import { MongoClient, ServerApiVersion } from 'mongodb';
import { MONGODB_URI } from '$env/static/private';

let client: MongoClient | null = null;
let isConnecting = false;
let connectionPromise: Promise<MongoClient> | null = null;

export async function connect() {
	if (isConnecting && connectionPromise) {
		return connectionPromise;
	}

	try {
		if (
			client &&
			(await client
				.db()
				.admin()
				.command({ ping: 1 })
				.catch(() => false))
		) {
			return client;
		}

		if (client) {
			await client.close(true);
			client = null;
		}

		isConnecting = true;
		connectionPromise = new Promise((resolve, reject) => {
			console.log('[MongoDB Admin] Attempting to connect...');
			const newClient = new MongoClient(MONGODB_URI, {
				serverApi: {
					version: ServerApiVersion.v1,
					strict: false,
					deprecationErrors: true
				},
				maxPoolSize: 10,
				minPoolSize: 5,
				serverSelectionTimeoutMS: 5000,
				socketTimeoutMS: 45000,
				connectTimeoutMS: 10000
			});

			newClient
				.connect()
				.then(() => {
					client = newClient;
					client.on('close', () => {
						console.log('[MongoDB Admin] Connection closed');
						client = null;
					});
					client.on('error', (error) => {
						console.error('[MongoDB Admin] Connection error:', error);
						client = null;
					});
					console.log('[MongoDB Admin] Connected successfully');
					resolve(client);
				})
				.catch(reject)
				.finally(() => {
					isConnecting = false;
					connectionPromise = null;
				});
		});

		return await connectionPromise;
	} catch (error) {
		isConnecting = false;
		connectionPromise = null;
		console.error('[MongoDB Admin] Connection error:', error);
		throw error;
	}
}

export async function getDb() {
	const connectedClient = await connect();
	return connectedClient.db('youtube_data');
}
