import { MongoClient, ServerApiVersion } from 'mongodb';
import { MONGODB_URI } from '$env/static/private';

let client: MongoClient | null = null;
let isConnecting = false;
let connectionPromise: Promise<MongoClient> | null = null;

export async function connect() {
	// If already connecting, wait for that connection
	if (isConnecting && connectionPromise) {
		return connectionPromise;
	}

	try {
		// Check if existing client is still connected
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

		// Reset client if it exists but isn't connected
		if (client) {
			await client.close(true);
			client = null;
		}

		isConnecting = true;
		connectionPromise = new Promise((resolve, reject) => {
			console.log('[MongoDB] Attempting to connect...');
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
						console.log('[MongoDB] Connection closed');
						client = null;
					});

					client.on('error', (error) => {
						console.error('[MongoDB] Connection error:', error);
						client = null;
					});

					console.log('[MongoDB] Connected successfully');
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
		console.error('[MongoDB] Connection error:', error);
		throw error;
	}
}

export async function getDb() {
	const connectedClient = await connect();
	return connectedClient.db('youtube_data');
}

// Add cleanup function
export async function closeConnection() {
	if (client) {
		try {
			await client.close(true);
			client = null;
		} catch (error) {
			console.error('[MongoDB] Error closing connection:', error);
		}
	}
}

// Optional: Add health check function
export async function isConnected() {
	try {
		if (!client) return false;
		await client.db().admin().ping();
		return true;
	} catch {
		return false;
	}
}
