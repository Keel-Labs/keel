import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const s3 = new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT || undefined,
  credentials: process.env.S3_ACCESS_KEY
    ? {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY || '',
      }
    : undefined,
  forcePathStyle: true, // Required for Tigris, R2, MinIO
});

const BUCKET = process.env.S3_BUCKET || 'keel-files';

export async function uploadFile(
  userId: number,
  filename: string,
  contentType: string,
  body: Buffer
): Promise<string> {
  const ext = filename.split('.').pop() || 'bin';
  const key = `${userId}/${crypto.randomUUID()}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return key;
}

export async function getFileUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function getFileStream(key: string): Promise<ReadableStream | null> {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return response.Body as any;
  } catch {
    return null;
  }
}

export async function deleteFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
