import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findAll() {
    return this.prisma.document.findMany({
      orderBy: { code: 'asc' },
      include: { format: { select: { code: true, name: true } } },
    });
  }

  async findByCode(code: string) {
    const doc = await this.prisma.document.findUnique({
      where: { code },
      include: { format: { select: { code: true, name: true } } },
    });
    if (!doc) {
      throw new NotFoundException(`Document not found: ${code}`);
    }
    return doc;
  }

  async getContent(code: string): Promise<{ content: Buffer; filename: string; format: string }> {
    const doc = await this.findByCode(code);
    const content = await this.storage.download(doc.storagePath);
    return { content, filename: doc.filename, format: doc.format.code };
  }

  async getDownloadUrl(code: string): Promise<{ url: string; filename: string }> {
    const doc = await this.findByCode(code);
    const url = await this.storage.getPresignedUrl(doc.storagePath);
    return { url, filename: doc.filename };
  }
}
