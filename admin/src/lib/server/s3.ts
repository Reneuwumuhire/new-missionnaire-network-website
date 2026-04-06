import {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
	DeleteObjectsCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
	AWS_ACCESS_KEY_ID,
	AWS_SECRET_ACCESS_KEY,
	AWS_S3_BUCKET,
	AWS_S3_REGION
} from '$env/static/private';

const s3 = new S3Client({
	region: AWS_S3_REGION,
	credentials: {
		accessKeyId: AWS_ACCESS_KEY_ID,
		secretAccessKey: AWS_SECRET_ACCESS_KEY
	}
});

function sanitizeFilename(name: string): string {
	return name
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-zA-Z0-9._-]/g, '_')
		.replace(/_+/g, '_')
		.toLowerCase();
}

export function generateS3Key(category: string, filename: string): string {
	const timestamp = Date.now();
	const sanitized = sanitizeFilename(filename);
	return `music-audio/${category}/${timestamp}-${sanitized}`;
}

export function getS3Url(key: string): string {
	return `https://${AWS_S3_BUCKET}.s3.${AWS_S3_REGION}.amazonaws.com/${key}`;
}

export async function generatePresignedUploadUrl(
	key: string,
	contentType: string
): Promise<string> {
	const command = new PutObjectCommand({
		Bucket: AWS_S3_BUCKET,
		Key: key,
		ContentType: contentType
	});
	return getSignedUrl(s3, command, { expiresIn: 900 }); // 15 minutes
}

export async function deleteObject(key: string): Promise<void> {
	await s3.send(
		new DeleteObjectCommand({
			Bucket: AWS_S3_BUCKET,
			Key: key
		})
	);
}

export async function deleteObjects(keys: string[]): Promise<void> {
	if (keys.length === 0) return;

	// S3 DeleteObjects supports max 1000 keys per request
	const batches: string[][] = [];
	for (let i = 0; i < keys.length; i += 1000) {
		batches.push(keys.slice(i, i + 1000));
	}

	for (const batch of batches) {
		await s3.send(
			new DeleteObjectsCommand({
				Bucket: AWS_S3_BUCKET,
				Delete: {
					Objects: batch.map((key) => ({ Key: key })),
					Quiet: true
				}
			})
		);
	}
}
