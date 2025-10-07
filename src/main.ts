import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<INestApplication>(AppModule, new ExpressAdapter());

  app.setGlobalPrefix("api");

  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      // transform: true,
      // transformOptions: {
      //   enableImplicitConversion: true
      // }
    })
  )

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', true);

  await app.listen(+process.env.PORT);
}
bootstrap();
