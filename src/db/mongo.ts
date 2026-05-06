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
		// Reuse the existing pooled client without an explicit ping. The
		// ping was adding a full Atlas round-trip to *every* server load,
		// which on Vercel serverless dominates SSR latency for the
		// homepage (videos + radio status + listeners = 3 sequential
		// queries, each preceded by ping). The driver's connection pool
		// already detects dead sockets via `error`/`close` events below
		// and clears `client` on failure — the next call falls through
		// to the reconnect branch on its own.
		if (client) {
			return client;
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
				// minPoolSize=0 (driver default): open sockets lazily as
				// queries arrive instead of eagerly filling 5 on startup.
				// Eager fill overwhelms Atlas M0's connection-handshake
				// throttle when the admin process is also opening sockets,
				// which surfaces as ServerSelectionTimeout / ReplicaSetNoPrimary.
				serverSelectionTimeoutMS: 30000,
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

// Vite HMR: when this module is replaced during dev (or when an importer is
// invalidated and re-evaluates this module), close the old MongoClient so its
// pool sockets don't accumulate against Atlas's connection cap. Without this,
// hours of dev with HMR can leak hundreds of half-open sockets and cause
// ReplicaSetNoPrimary timeouts on new connection attempts.
if (import.meta.hot) {
	import.meta.hot.dispose(async () => {
		if (client) {
			try {
				await client.close(true);
			} catch (err) {
				console.error('[MongoDB] HMR dispose close error:', err);
			}
			client = null;
		}
	});
}
