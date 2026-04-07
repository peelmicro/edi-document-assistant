import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';

const CONTENT_TYPE_BY_FORMAT: Record<string, string> = {
  edifact: 'application/edifact',
  xml: 'application/xml',
  json: 'application/json',
  csv: 'text/csv',
};

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  async findAll() {
    return this.documentsService.findAll();
  }

  @Get(':code')
  async findOne(@Param('code') code: string) {
    return this.documentsService.findByCode(code);
  }

  @Get(':code/content')
  async getContent(@Param('code') code: string, @Res() res: Response) {
    const { content, filename, format } = await this.documentsService.getContent(code);
    const contentType = CONTENT_TYPE_BY_FORMAT[format] ?? 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(content);
  }

  @Get(':code/download-url')
  async getDownloadUrl(@Param('code') code: string) {
    return this.documentsService.getDownloadUrl(code);
  }
}
