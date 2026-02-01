import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        logger: ['error', 'warn', 'log'],
    });

    const configService = app.get(ConfigService);
    const port = configService.get<number>('port', 3000);

    // Graceful shutdown
    app.enableShutdownHooks();

    await app.listen(port);
    console.log(`🚀 Konkurs Bot server ishga tushdi: http://localhost:${port}`);
}

bootstrap();
