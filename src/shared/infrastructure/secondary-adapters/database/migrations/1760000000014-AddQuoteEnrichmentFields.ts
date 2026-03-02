import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuoteEnrichmentFields1760000000014 implements MigrationInterface {
  name = 'AddQuoteEnrichmentFields1760000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market_quotes"
      ADD COLUMN IF NOT EXISTS "source" character varying(120)
    `);

    await queryRunner.query(`
      ALTER TABLE "market_quotes"
      ADD COLUMN IF NOT EXISTS "sourceTimestamp" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      ALTER TABLE "market_quotes"
      ADD COLUMN IF NOT EXISTS "confidence" character varying(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market_quotes"
      DROP COLUMN IF EXISTS "confidence"
    `);

    await queryRunner.query(`
      ALTER TABLE "market_quotes"
      DROP COLUMN IF EXISTS "sourceTimestamp"
    `);

    await queryRunner.query(`
      ALTER TABLE "market_quotes"
      DROP COLUMN IF EXISTS "source"
    `);
  }
}
