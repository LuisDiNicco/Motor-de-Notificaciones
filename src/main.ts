import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { CustomExceptionsFilter } from './shared/infrastructure/primary-adapters/http/filters/CustomExceptionsFilter';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { RequestLoggingInterceptor } from './shared/infrastructure/primary-adapters/http/interceptors/RequestLoggingInterceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  const configService = app.get(ConfigService);

  const loggerWithFilter = logger as unknown as {
    warn: (...args: unknown[]) => void;
  };
  const originalWarn = loggerWithFilter.warn.bind(loggerWithFilter);
  loggerWithFilter.warn = (...args: unknown[]) => {
    const [message] = args;
    if (
      typeof message === 'string' &&
      message.includes('Unsupported route path: "/api/v1/*"')
    ) {
      return;
    }

    originalWarn(...args);
  };

  app.useLogger(logger);

  // Security headers
  app.use(helmet());

  // CORS configuration
  const corsOrigins = configService.get<string[]>('app.cors.origins', [
    'http://localhost:3001',
  ]);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type,Authorization,X-Correlation-ID',
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new CustomExceptionsFilter());

  const enableHttpRequestLogging =
    String(configService.get('HTTP_REQUEST_LOGGING', 'false')).toLowerCase() ===
    'true';

  if (enableHttpRequestLogging) {
    app.useGlobalInterceptors(new RequestLoggingInterceptor());
  }

  app.setGlobalPrefix('api/v1');

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('NotiFinance API')
    .setDescription('Financial tracking and event-driven notification API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Connect RabbitMQ Microservices for Consumers
  const rmqUrl = configService.get<string>('integrations.rabbitmq.url');

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl as string],
      queue: 'alert-evaluation-queue',
      noAck: false,
      queueOptions: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': 'alert-evaluation-queue.dlq',
        },
      },
      exchange: 'notifinance.events',
      exchangeType: 'topic',
      routingKey: 'market.#',
      wildcards: true,
    },
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl as string],
      queue: 'notification-events-queue',
      noAck: false, // Strict Acking required
      queueOptions: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': 'notification-events-queue.dlq',
        },
      },
      exchange: 'notifinance.events',
      exchangeType: 'topic',
      routingKey: 'alert.#',
      wildcards: true,
    },
  });

  await app.startAllMicroservices();

  const port = configService.get<number>('app.port', 3000);
  await app.listen(port);
  logger.log(`Application is running on http://localhost:${port}`);
  logger.log(`API Documentation available at http://localhost:${port}/api`);
  logger.log(
    `RabbitMQ Microservice connected and polling from 'alert-evaluation-queue'`,
  );
  logger.log(
    `RabbitMQ Microservice connected and polling from 'notification-events-queue'`,
  );
}
void bootstrap();
