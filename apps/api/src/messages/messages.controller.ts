import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MessagesService } from './messages.service';
import type { ProviderCode } from '../langchain/providers.factory';

interface AskBody {
  parentProcessId: string;
  providerCode: ProviderCode;
  model: string;
  question: string;
}

@Controller('documents/:code/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  async list(
    @Param('code') code: string,
    @Query('parentProcessId') parentProcessId: string,
  ) {
    return this.messagesService.findThread(code, parentProcessId);
  }

  @Post()
  async ask(@Param('code') code: string, @Body() body: AskBody) {
    return this.messagesService.ask({
      documentCode: code,
      parentProcessId: body.parentProcessId,
      providerCode: body.providerCode,
      model: body.model,
      question: body.question,
    });
  }
}
