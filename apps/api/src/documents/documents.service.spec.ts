import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentsService } from './documents.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import type { CodeGeneratorService } from '../common/code-generator.service';

// Minimal Prisma document shape for test assertions
const makeDoc = (overrides: Record<string, unknown> = {}) => ({
  id: 'uuid-1',
  code: 'DOC-2026-04-000001',
  filename: 'purchase-order-carrefour.edi',
  description: 'EDIFACT purchase order from Carrefour',
  tags: ['purchase order', 'carrefour'],
  storagePath: 'documents/uuid-1.edi',
  createdAt: new Date('2026-04-01T10:00:00Z'),
  updatedAt: new Date('2026-04-01T10:00:00Z'),
  format: { code: 'edifact', name: 'EDIFACT' },
  ...overrides,
});

function makePrisma(docs: ReturnType<typeof makeDoc>[], total = docs.length) {
  const docWithRelations = docs[0]
    ? { ...docs[0], analyses: [], processes: [] }
    : null;
  return {
    document: {
      findMany: vi.fn().mockResolvedValue(docs),
      count: vi.fn().mockResolvedValue(total),
      findFirst: vi.fn().mockResolvedValue(docs[0] ?? null),
      findUnique: vi.fn().mockResolvedValue(docWithRelations),
      delete: vi.fn().mockResolvedValue(docs[0] ?? null),
    },
    format: {
      findFirst: vi.fn().mockResolvedValue({ id: 'fmt-1', code: 'edifact', name: 'EDIFACT' }),
    },
    message: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

const makeStorage = () =>
  ({
    upload: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue(Buffer.from('UNB+UNOC:3+S+R+260401:1200+1')),
    delete: vi.fn().mockResolvedValue(undefined),
  }) as unknown as StorageService;

const makeCodeGen = () =>
  ({
    generate: vi.fn().mockResolvedValue('DOC-2026-04-000001'),
  }) as unknown as CodeGeneratorService;

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: PrismaService;
  let storage: StorageService;

  beforeEach(() => {
    const docs = [makeDoc()];
    prisma = makePrisma(docs);
    storage = makeStorage();
    service = new DocumentsService(prisma, storage, makeCodeGen());
  });

  describe('findAll', () => {
    it('defaults to page 1 with pageSize 20', async () => {
      await service.findAll();
      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('applies pagination correctly', async () => {
      await service.findAll({ page: 3, pageSize: 10 });
      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('applies formatCode filter', async () => {
      await service.findAll({ formatCode: 'edifact' });
      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ format: { code: 'edifact' } }),
        }),
      );
    });

    it('applies search filter across filename, description, and code', async () => {
      await service.findAll({ search: 'carrefour' });
      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ filename: expect.objectContaining({ contains: 'carrefour' }) }),
              expect.objectContaining({ description: expect.objectContaining({ contains: 'carrefour' }) }),
              expect.objectContaining({ code: expect.objectContaining({ contains: 'carrefour' }) }),
            ]),
          }),
        }),
      );
    });

    it('returns paginated result with correct metadata', async () => {
      prisma = makePrisma([makeDoc(), makeDoc({ id: 'uuid-2' })], 25);
      service = new DocumentsService(prisma, storage, makeCodeGen());

      const result = await service.findAll({ page: 2, pageSize: 10 });
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
    });

    it('ignores whitespace-only search terms', async () => {
      await service.findAll({ search: '   ' });
      const call = vi.mocked(prisma.document.findMany).mock.calls[0][0];
      expect((call?.where as Record<string, unknown>)?.OR).toBeUndefined();
    });

    it('caps pageSize at 100', async () => {
      await service.findAll({ pageSize: 9999 });
      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe('getContent', () => {
    it('returns the decoded document content as a string', async () => {
      const result = await service.getContent('DOC-2026-04-000001');
      expect(typeof result.content).toBe('string');
      expect(result.format).toBe('edifact');
    });

    it('throws NotFoundException when the document does not exist', async () => {
      vi.mocked(prisma.document.findUnique).mockResolvedValue(null);
      await expect(service.getContent('DOC-MISSING')).rejects.toThrow();
    });
  });
});
