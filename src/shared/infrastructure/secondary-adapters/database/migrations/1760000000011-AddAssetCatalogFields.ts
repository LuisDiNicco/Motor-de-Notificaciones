import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssetCatalogFields1760000000011 implements MigrationInterface {
  name = 'AddAssetCatalogFields1760000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "assets"
      ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      ALTER TABLE "assets"
      ADD COLUMN IF NOT EXISTS "maturityDate" date
    `);

    await queryRunner.query(`
      ALTER TABLE "assets"
      ADD COLUMN IF NOT EXISTS "lastCatalogCheck" TIMESTAMP
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_assets_maturity_date"
      ON "assets" ("maturityDate")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_assets_is_active"
      ON "assets" ("isActive")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_assets_is_active"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_assets_maturity_date"');

    await queryRunner.query(`
      ALTER TABLE "assets"
      DROP COLUMN IF EXISTS "lastCatalogCheck"
    `);

    await queryRunner.query(`
      ALTER TABLE "assets"
      DROP COLUMN IF EXISTS "maturityDate"
    `);
  }
}
