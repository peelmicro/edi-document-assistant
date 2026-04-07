import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.aiProvider.findMany({ orderBy: { code: 'asc' } });
  }
}
