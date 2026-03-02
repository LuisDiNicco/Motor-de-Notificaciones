import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IncomingMessage } from 'http';

@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction =
          configService.get<string>('NODE_ENV') === 'production';

        const pinoHttpConfig = isProduction
          ? {
              level: 'info' as const,
              autoLogging: false,
              quietReqLogger: true,
              quietResLogger: true,
              customProps: (req: IncomingMessage) => ({
                context: 'HTTP',
                correlationId:
                  req.headers['x-correlation-id'] || 'no-correlation-id',
              }),
            }
          : {
              level: 'info' as const,
              transport: { target: 'pino-pretty', options: { colorize: true } },
              autoLogging: false,
              quietReqLogger: true,
              quietResLogger: true,
              customProps: (req: IncomingMessage) => ({
                context: 'HTTP',
                correlationId:
                  req.headers['x-correlation-id'] || 'no-correlation-id',
              }),
            };

        return { pinoHttp: pinoHttpConfig };
      },
    }),
  ],
  exports: [LoggerModule],
})
export class LoggerConfigModule {}
