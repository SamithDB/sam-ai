/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import type { Env } from './config/env';

async function listenWithFallback(app: Awaited<ReturnType<typeof NestFactory.create>>, startPort: number) {
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const port = startPort + attempt;

    try {
      await app.listen(port);
      return port;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (!message.includes('EADDRINUSE')) {
        throw error;
      }

      Logger.warn(`Port ${port} is already in use, trying ${port + 1}...`);
    }
  }

  throw new Error(`Unable to find a free port starting at ${startPort}`);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('API_PORT', { infer: true });
  // Opt-in: when the port is busy, try the next ones. Off by default so the UI's
  // UI_API_BASE_URL never silently points at the wrong port.
  const boundPort = config.get('API_PORT_FALLBACK', { infer: true })
    ? await listenWithFallback(app, port)
    : (await app.listen(port), port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${boundPort}/${globalPrefix}`,
  );
}

bootstrap();
