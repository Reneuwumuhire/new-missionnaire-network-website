import { MongoClient } from 'mongodb';
const MONGODB_URI =
	'mongodb+srv://renefrontend:MScHkNSaPKCwn0lN@cluster0.z9vgqkr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

if (!MONGODB_URI) {
	console.error('MONGODB_URI is not defined in .env.local');
	process.exit(1);
}

async function verifyDb() {
	const client = new MongoClient(MONGODB_URI);
	try {
		await client.connect();
		console.log('Connected to MongoDB');
		const db = client.db('youtube_data');
		const collections = await db.listCollections().toArray();
		console.log(
			'Collections:',
			collections.map((c) => c.name)
		);

		const videosCount = await db.collection('videos').countDocuments();
		console.log('Videos count:', videosCount);

		if (videosCount > 0) {
			const sample = await db
				.collection('videos')
				.findOne({ pdfInfo: { $exists: true, $not: { $size: 0 } } });
			if (sample) {
				console.log('Sample video title:', sample.title);
				console.log('Sample video pdfInfo:', JSON.stringify(sample.pdfInfo, null, 2));
			} else {
				console.log('No video with pdfInfo found');
			}
		}
	} catch (err) {
		console.error('Error:', err);
	} finally {
		await client.close();
	}
}

verifyDb();
