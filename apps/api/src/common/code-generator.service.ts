import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Generates human-readable sequential codes scoped per prefix and year-month.
 *
 * Examples: DOC-2026-04-000001, DOC-2026-04-000002, DOC-2026-05-000001
 *
 * Uses Prisma's atomic `upsert` + `increment` so concurrent calls cannot
 * produce duplicate sequences.
 */
@Injectable()
export class CodeGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(prefix: string, date: Date = new Date()): Promise<string> {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yearMonth = `${year}-${month}`;

    const row = await this.prisma.codeSequence.upsert({
      where: { prefix_yearMonth: { prefix, yearMonth } },
      create: { prefix, yearMonth, lastSequence: 1 },
      update: { lastSequence: { increment: 1 } },
    });

    const sequence = String(row.lastSequence).padStart(6, '0');
    return `${prefix}-${yearMonth}-${sequence}`;
  }
}
