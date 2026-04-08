import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CodeGeneratorService } from '../common/code-generator.service';
import { decodeDocumentBuffer } from '../common/document-encoding';

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  edi: 'application/edifact',
  edifact: 'application/edifact',
  xml: 'application/xml',
  json: 'application/json',
  csv: 'text/csv',
};

const FORMAT_CODE_BY_EXT: Record<string, string> = {
  edi: 'edifact',
  edifact: 'edifact',
  xml: 'xml',
  json: 'json',
  csv: 'csv',
};

export interface FindAllOptions {
  page?: number;
  pageSize?: number;
  formatCode?: string;
  search?: string;
}

export interface UploadDocumentInput {
  filename: string;
  buffer: Buffer;
  /** Optional override; otherwise inferred from the filename extension. */
  formatCode?: string;
  /** Optional list of tags supplied by the uploader. */
  tags?: string[];
  /** Optional human-readable description. */
  description?: string;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly codeGenerator: CodeGeneratorService,
  ) {}

  async findAll(options: FindAllOptions = {}) {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    // Build the where clause incrementally so unsupplied filters drop out
    const where: Record<string, unknown> = {};
    if (options.formatCode) {
      where.format = { code: options.formatCode };
    }
    if (options.search && options.search.trim().length > 0) {
      const term = options.search.trim();
      where.OR = [
        { filename: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { code: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        // Newest first so the home page's "Recent documents" actually shows
        // the most recently uploaded, and the documents list page defaults
        // to the standard newest-first ordering.
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { format: { select: { code: true, name: true } } },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findByCode(code: string) {
    const doc = await this.prisma.document.findUnique({
      where: { code },
      include: {
        format: { select: { code: true, name: true } },
        analyses: {
          orderBy: { createdAt: 'desc' },
          include: {
            process: { include: { aiProvider: { select: { code: true, name: true } } } },
          },
        },
      },
    });
    if (!doc) {
      throw new NotFoundException(`Document not found: ${code}`);
    }

    // Load every message thread for this document. Messages are linked to
    // analyses via `parentProcessId`, so we group them by parent so the UI
    // can render one chat panel per analysis.
    const parentProcessIds = doc.analyses.map((a) => a.processId);
    const messages = await this.prisma.message.findMany({
      where: { parentProcessId: { in: parentProcessIds } },
      orderBy: { createdAt: 'asc' },
      include: {
        process: { include: { aiProvider: { select: { code: true, name: true } } } },
      },
    });

    return { ...doc, messages };
  }

  /**
   * Uploads a new document.
   *
   * 1. Detects the format from the filename extension (or uses the override)
   * 2. Generates a `DOC-YYYY-MM-NNNNNN` code
   * 3. Uploads the file to MinIO under `uploads/<code>-<filename>` so the
   *    object key matches the seed convention but lives in its own folder
   * 4. Persists the row with the real `storagePath`
   */
  async create(input: UploadDocumentInput) {
    const ext = input.filename.split('.').pop()?.toLowerCase() ?? '';
    const formatCode = input.formatCode ?? FORMAT_CODE_BY_EXT[ext];
    if (!formatCode) {
      throw new BadRequestException(
        `Could not detect format from filename "${input.filename}". Pass a formatCode or use one of: .edi, .xml, .json, .csv`,
      );
    }

    const format = await this.prisma.format.findUnique({ where: { code: formatCode } });
    if (!format) {
      throw new BadRequestException(`Unknown format: ${formatCode}`);
    }

    const code = await this.codeGenerator.generate('DOC');
    const objectKey = `uploads/${code}-${input.filename}`;
    const contentType = CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream';
    await this.storage.uploadBuffer(objectKey, input.buffer, contentType);

    return this.prisma.document.create({
      data: {
        code,
        filename: input.filename,
        formatId: format.id,
        tags: input.tags ?? [],
        description: input.description,
        storagePath: objectKey,
      },
      include: { format: { select: { code: true, name: true } } },
    });
  }

  /**
   * Deletes a document and its MinIO object. Idempotent: a 404 from MinIO
   * is swallowed (the DB row is the source of truth).
   */
  async remove(code: string) {
    const doc = await this.findByCode(code);
    try {
      await this.storage.delete(doc.storagePath);
    } catch (error) {
      // Log but don't fail — the storage object may already be gone
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to delete MinIO object ${doc.storagePath}: ${message}`);
    }
    await this.prisma.document.delete({ where: { id: doc.id } });
    return { code, deleted: true };
  }

  /**
   * Returns the document body as a UTF-8 string, decoded from whatever
   * encoding the file actually uses (auto-detected via the EDIFACT UNB
   * header for .edi files; UTF-8 for everything else).
   *
   * Once we hand the string back to the controller, it can serve the
   * response with `charset=utf-8` and the browser will render it
   * correctly even if the original file was Latin-1.
   */
  async getContent(code: string): Promise<{ content: string; filename: string; format: string }> {
    const doc = await this.findByCode(code);
    const buffer = await this.storage.download(doc.storagePath);
    const content = decodeDocumentBuffer(buffer, doc.format.code);
    return { content, filename: doc.filename, format: doc.format.code };
  }

  async getDownloadUrl(code: string): Promise<{ url: string; filename: string }> {
    const doc = await this.findByCode(code);
    const url = await this.storage.getPresignedUrl(doc.storagePath);
    return { url, filename: doc.filename };
  }
}
