import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: configService.get<string>('integrations.database.url') as string,
  autoLoadEntities: true,
  synchronize: false, // Strict Requirement: Never True
  migrations: [
    __dirname + '/../../secondary-adapters/database/migrations/*{.ts,.js}',
  ],
  migrationsRun: configService.get<boolean>(
    'integrations.database.runMigrations',
    true,
  ),
  logging:
    String(configService.get('DB_LOGGING', 'false')).toLowerCase() === 'true'
      ? ['query', 'error', 'warn']
      : ['error', 'warn'],
});
