import { Controller, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { BotService } from './bot.service';

@Controller('webhook')
export class BotController {
    constructor(private readonly botService: BotService) { }

    @Post('bot')
    async handleWebhook(@Body() update: any, @Res() res: Response) {
        try {
            await this.botService.handleUpdate(update);
            res.status(200).send('OK');
        } catch (error) {
            console.error('Webhook xatosi:', error);
            res.status(200).send('OK'); // Telegram uchun har doim 200 qaytarish
        }
    }
}
