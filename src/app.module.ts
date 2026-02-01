import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './prisma/prisma.module';
import { BotModule } from './bot/bot.module';
import { UserModule } from './user/user.module';
import { ContestModule } from './contest/contest.module';
import { ChannelModule } from './channel/channel.module';
import configuration from './config/configuration';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            load: [configuration],
        }),
        ScheduleModule.forRoot(),
        PrismaModule,
        BotModule,
        UserModule,
        ContestModule,
        ChannelModule,
    ],
})
export class AppModule { }
