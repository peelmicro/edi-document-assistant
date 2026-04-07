import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';

/**
 * Wraps MinIO with the operations the rest of the API needs:
 * upload, download (as Buffer), delete, and presigned URL generation.
 *
 * On startup it ensures the configured bucket exists, creating it if not.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: MinioClient;
  readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const endPoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = Number(this.config.get<string>('MINIO_PORT', '9000'));
    const accessKey = this.config.get<string>('MINIO_ROOT_USER', 'minioadmin');
    const secretKey = this.config.get<string>('MINIO_ROOT_PASSWORD', 'minioadmin');
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'documents');

    this.client = new MinioClient({
      endPoint,
      port,
      useSSL: false,
      accessKey,
      secretKey,
    });
  }

  async onModuleInit() {
    await this.ensureBucket();
  }

  /**
   * Creates the configured bucket if it doesn't already exist.
   * Safe to call multiple times.
   */
  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Created MinIO bucket: ${this.bucket}`);
    } else {
      this.logger.log(`MinIO bucket ready: ${this.bucket}`);
    }
  }

  /**
   * Uploads a buffer to MinIO at the given object key.
   * Returns the storage path (key) used.
   */
  async uploadBuffer(
    objectKey: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.client.putObject(this.bucket, objectKey, buffer, buffer.length, {
      'Content-Type': contentType,
    });
    return objectKey;
  }

  /**
   * Downloads an object from MinIO and returns its full content as a Buffer.
   */
  async download(objectKey: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Deletes an object from MinIO.
   */
  async delete(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey);
  }

  /**
   * Generates a time-limited presigned URL for downloading an object.
   * Default expiry: 1 hour.
   */
  async getPresignedUrl(objectKey: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(this.bucket, objectKey, expirySeconds);
  }
}
