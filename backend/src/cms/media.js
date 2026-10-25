import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fail } from './validation.js';
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export async function verifyImage(bytes, contentType) {
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES)
    fail(400, 'INVALID_MEDIA', 'Image size is invalid.');
  const signature =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? 'image/jpeg'
      : bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'image/png'
        : bytes.subarray(0, 4).toString() === 'RIFF' &&
            bytes.subarray(8, 12).toString() === 'WEBP'
          ? 'image/webp'
          : null;
  if (signature !== contentType)
    fail(400, 'INVALID_MEDIA', 'Image type does not match its contents.');
  try {
    const image = sharp(bytes, {
      limitInputPixels: 20_000_000,
      failOn: 'warning',
      animated: true,
    });
    const metadata = await image.metadata();
    if (
      (metadata.pages || 1) !== 1 ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > 20_000_000
    )
      throw Error();
    await image.raw().toBuffer();
  } catch {
    fail(400, 'INVALID_MEDIA', 'Image could not be safely decoded.');
  }
  return Buffer.from(bytes);
}
export function memoryMedia(origin = 'http://127.0.0.1:8787/api') {
  const incoming = new Map(),
    verified = new Map(),
    grants = new Map();
  return {
    async grant(id, type, size) {
      const token = randomUUID();
      grants.set(token, { id, type, size, expires: Date.now() + 120000 });
      return {
        uploadUrl: `${origin}/dev/uploads/${token}`,
        headers: { 'Content-Type': type },
        expiresIn: 120,
      };
    },
    async upload(token, bytes, type) {
      const grant = grants.get(token);
      if (!grant || grant.expires < Date.now())
        fail(403, 'FORBIDDEN', 'Upload grant expired.');
      if (type !== grant.type || bytes.length !== grant.size)
        fail(400, 'INVALID_MEDIA', 'Upload differs from grant.');
      incoming.set(grant.id, Buffer.from(bytes));
    },
    async readIncoming(id) {
      const bytes = incoming.get(id);
      if (!bytes) fail(400, 'INVALID_MEDIA', 'Upload has not completed.');
      return Buffer.from(bytes);
    },
    async writeVerified(id, bytes, type) {
      if (!verified.has(id))
        verified.set(id, { bytes: Buffer.from(bytes), type });
    },
    async sign(id) {
      if (!verified.has(id)) fail(404, 'NOT_FOUND', 'Media unavailable.');
      const token = randomUUID();
      grants.set(token, { verified: id, expires: Date.now() + 60000 });
      return `${origin}/dev/media/${token}`;
    },
    async readSigned(token) {
      const grant = grants.get(token);
      if (!grant?.verified || grant.expires < Date.now())
        fail(404, 'NOT_FOUND', 'Media unavailable.');
      return verified.get(grant.verified);
    },
  };
}
export function s3Media(
  bucket,
  client = new S3Client({ requestChecksumCalculation: 'WHEN_REQUIRED' }),
) {
  return {
    async grant(id, type, size) {
      return {
        uploadUrl: await getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: bucket,
            Key: `incoming/${id}`,
            ContentType: type,
            ContentLength: size,
          }),
          { expiresIn: 120 },
        ),
        headers: { 'Content-Type': type },
        expiresIn: 120,
      };
    },
    async readIncoming(id) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: `incoming/${id}` }),
      );
      if (result.ContentLength > MAX_MEDIA_BYTES)
        fail(400, 'INVALID_MEDIA', 'Image is too large.');
      const chunks = [];
      let size = 0;
      for await (const chunk of result.Body) {
        size += chunk.length;
        if (size > MAX_MEDIA_BYTES)
          fail(400, 'INVALID_MEDIA', 'Image is too large.');
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    },
    async writeVerified(id, bytes, type) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `verified/${id}`,
            Body: bytes,
            ContentType: type,
            CacheControl: 'private, no-store',
            IfNoneMatch: '*',
          }),
        );
      } catch (error) {
        if (error.$metadata?.httpStatusCode !== 412) throw error;
      }
    },
    async sign(id) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: `verified/${id}`,
          ResponseCacheControl: 'private, no-store',
        }),
        { expiresIn: 60 },
      );
    },
  };
}
