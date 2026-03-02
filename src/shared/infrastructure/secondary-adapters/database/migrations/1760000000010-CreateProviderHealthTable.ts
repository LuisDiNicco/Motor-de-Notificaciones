import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProviderHealthTable1760000000010 implements MigrationInterface {
  name = 'CreateProviderHealthTable1760000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "provider_health" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        "providerName" varchar(120) NOT NULL,
        "status" varchar(20) NOT NULL,
        "latencyMs" integer NOT NULL,
        "checkedAt" TIMESTAMP NOT NULL,
        "endpoint" varchar(200),
        "errorMessage" varchar(255),
        CONSTRAINT "PK_provider_health_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_provider_health_provider_checked_at" ON "provider_health" ("providerName", "checkedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_provider_health_checked_at" ON "provider_health" ("checkedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_provider_health_checked_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_provider_health_provider_checked_at"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "provider_health"');
  }
}
