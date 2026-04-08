import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';

const CONTENT_TYPE_BY_FORMAT: Record<string, string> = {
  edifact: 'application/edifact',
  xml: 'application/xml',
  json: 'application/json',
  csv: 'text/csv',
};

interface UploadBody {
  formatCode?: string;
  description?: string;
  /** Comma-separated list of tags. Multipart bodies don't natively carry arrays. */
  tags?: string;
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('formatCode') formatCode?: string,
    @Query('search') search?: string,
  ) {
    return this.documentsService.findAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      formatCode,
      search,
    });
  }

  /**
   * Multipart upload endpoint.
   *
   * Form field name: `file` (the document binary)
   * Optional form fields: `formatCode`, `description`, `tags` (comma-separated)
   */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadBody,
  ) {
    if (!file) {
      throw new Error('No file uploaded — send the file under the form field name "file".');
    }
    const tags = body.tags
      ? body.tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0)
      : [];
    return this.documentsService.create({
      filename: file.originalname,
      buffer: file.buffer,
      formatCode: body.formatCode,
      description: body.description,
      tags,
    });
  }

  @Delete(':code')
  async remove(@Param('code') code: string) {
    return this.documentsService.remove(code);
  }

  @Get(':code')
  async findOne(@Param('code') code: string) {
    return this.documentsService.findByCode(code);
  }

  @Get(':code/content')
  async getContent(@Param('code') code: string, @Res() res: Response) {
    const { content, filename, format } = await this.documentsService.getContent(code);
    const baseContentType = CONTENT_TYPE_BY_FORMAT[format] ?? 'application/octet-stream';
    // The service already decoded the original encoding (e.g. ISO 8859-1
    // for European EDIFACT) to a UTF-8 string, so we always announce
    // charset=utf-8 to the browser.
    res.setHeader('Content-Type', `${baseContentType}; charset=utf-8`);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(content);
  }

  @Get(':code/download-url')
  async getDownloadUrl(@Param('code') code: string) {
    return this.documentsService.getDownloadUrl(code);
  }
}
