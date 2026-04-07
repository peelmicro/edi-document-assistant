import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FormatsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.format.findMany({ orderBy: { code: 'asc' } });
  }
}
