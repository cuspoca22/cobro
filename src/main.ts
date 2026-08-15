import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import Decimal from 'decimal.js';
import { firstForwardedIp } from './common/helpers';
const express = require('express');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const server = express();
  // Cloudflare solo → 1; Cloudflare + nginx → 2 (TRUST_PROXY_HOPS).
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  server.set(
    'trust proxy',
    Number.isFinite(trustProxyHops) && trustProxyHops > 0 ? trustProxyHops : 1,
  );
  // Antes de Nest: Cloudflare pone la IP real aquí; X-Forwarded-For se puede falsear.
  server.use((req: Request, _res: Response, next: NextFunction) => {
    const cfIp = firstForwardedIp(req.headers['cf-connecting-ip']);
    if (cfIp) {
      req.headers['x-forwarded-for'] = cfIp;
    }
    next();
  });

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
  );

  app.setGlobalPrefix("api");

  const corsOrigins = process.env.CORS_ORIGINS
    ?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Sin Origin (curl/Postman) o lista vacía en dev → permitir
      if (!origin || !corsOrigins?.length) {
        return callback(null, true);
      }
      if (corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true
      }
    })
  )

  // Swagger Configuration - Only enable in non-production environments
  const enableSwagger = process.env.ENABLE_SWAGGER !== 'false' && process.env.NODE_ENV !== 'production';

  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('PayFlow API')
      .setDescription('API para gestión de cobros, clientes y reportes administrativos')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'bearerAuth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  await app.listen(+process.env.PORT);
}
bootstrap();
