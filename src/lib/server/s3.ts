import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$env/dynamic/private';

function config() {
	if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_S3_BUCKET || !env.AWS_S3_REGION) {
		throw new Error('S3 upload is not configured');
	}
	return { bucket: env.AWS_S3_BUCKET, region: env.AWS_S3_REGION };
}

function client() {
	const { region } = config();
	return new S3Client({ region, credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID!, secretAccessKey: env.AWS_SECRET_ACCESS_KEY! }, requestChecksumCalculation: 'WHEN_REQUIRED' });
}

export function s3Url(key: string): string {
	const { bucket, region } = config();
	return `https://${bucket}.s3.${region}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export function presignUpload(key: string, contentType: string): Promise<string> {
	const { bucket } = config();
	return getSignedUrl(client(), new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: 900 });
}
