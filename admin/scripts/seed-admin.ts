/**
 * Seed script to create the first admin user.
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." npx tsx scripts/seed-admin.ts --email admin@example.com --password secret123 --name "Admin"
 */

import { MongoClient, ServerApiVersion } from 'mongodb';
import bcrypt from 'bcryptjs';

function getArg(name: string): string | undefined {
	const idx = process.argv.indexOf(`--${name}`);
	return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
	const uri = process.env.MONGODB_URI;
	const email = getArg('email');
	const password = getArg('password');
	const name = getArg('name') ?? 'Admin';

	if (!uri) {
		console.error('Error: MONGODB_URI environment variable is required');
		process.exit(1);
	}
	if (!email || !password) {
		console.error('Usage: MONGODB_URI="..." npx tsx scripts/seed-admin.ts --email <email> --password <password> [--name <name>]');
		process.exit(1);
	}

	const client = new MongoClient(uri, {
		serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: true }
	});

	try {
		await client.connect();
		const db = client.db('youtube_data');

		// Create TTL index on sessions
		await db.collection('admin_sessions').createIndex(
			{ expires_at: 1 },
			{ expireAfterSeconds: 0 }
		);
		console.log('Created TTL index on admin_sessions.expires_at');

		// Create unique index on admin users email
		await db.collection('admin_users').createIndex(
			{ email: 1 },
			{ unique: true }
		);
		console.log('Created unique index on admin_users.email');

		// Create unique index on sessions token
		await db.collection('admin_sessions').createIndex(
			{ token: 1 },
			{ unique: true }
		);
		console.log('Created unique index on admin_sessions.token');

		// Create audit log indexes
		await db.collection('audit_log').createIndex({ timestamp: -1 });
		await db.collection('audit_log').createIndex({ user_id: 1, timestamp: -1 });
		console.log('Created indexes on audit_log');

		// Check if user exists
		const existing = await db.collection('admin_users').findOne({ email: email.toLowerCase() });
		if (existing) {
			console.log(`Admin user with email ${email} already exists. Updating password...`);
			const hash = await bcrypt.hash(password, 12);
			await db.collection('admin_users').updateOne(
				{ email: email.toLowerCase() },
				{ $set: { password_hash: hash, name, is_active: true } }
			);
			console.log('Password updated successfully.');
		} else {
			const hash = await bcrypt.hash(password, 12);
			await db.collection('admin_users').insertOne({
				email: email.toLowerCase(),
				password_hash: hash,
				name,
				role: 'superadmin',
				created_at: new Date(),
				last_login: null,
				is_active: true
			});
			console.log(`Created admin user: ${email} (superadmin)`);
		}
	} finally {
		await client.close();
	}
}

main().catch((err) => {
	console.error('Seed failed:', err);
	process.exit(1);
});
