import { MongoClient, ServerApiVersion } from 'mongodb';
import { MONGODB_URI } from '$env/static/private';

let client: MongoClient | null = null;
let isConnecting = false;
let connectionPromise: Promise<MongoClient> | null = null;

export async function connect() {
	// Reuse the existing client when present. The driver maintains its own
	// heartbeat / pool — pinging on every getDb() call adds an unnecessary
	// round trip to every server load. Connection-level errors clear `client`
	// via the 'close'/'error' listeners below, so the next call reconnects.
	if (client) return client;

	if (isConnecting && connectionPromise) {
		return connectionPromise;
	}

	try {
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
				// minPoolSize=0 (driver default): open sockets lazily as queries
				// arrive instead of eagerly filling 5 on startup. Eager fill
				// overwhelms Atlas M0's connection-handshake throttle when the
				// main-site process is also opening sockets, which surfaces as
				// ServerSelectionTimeout / ReplicaSetNoPrimary on cold start.
				serverSelectionTimeoutMS: 30000,
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
				console.error('[MongoDB Admin] HMR dispose close error:', err);
			}
			client = null;
		}
	});
}
