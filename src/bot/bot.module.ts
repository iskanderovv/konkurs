import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { UserModule } from '../user/user.module';
import { ContestModule } from '../contest/contest.module';
import { ChannelModule } from '../channel/channel.module';

@Module({
    imports: [UserModule, ContestModule, ChannelModule],
    controllers: [BotController],
    providers: [BotService],
    exports: [BotService],
})
export class BotModule { }
