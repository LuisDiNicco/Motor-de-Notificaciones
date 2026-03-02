import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateAssetCatalogSeed1760000000012 implements MigrationInterface {
  name = 'UpdateAssetCatalogSeed1760000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "assets"
      SET "maturityDate" = '2030-07-09',
          "lastCatalogCheck" = NOW()
      WHERE "ticker" = 'AL30'
    `);

    await queryRunner.query(`
      UPDATE "assets"
      SET "maturityDate" = '2030-01-09',
          "lastCatalogCheck" = NOW()
      WHERE "ticker" = 'GD30'
    `);

    await queryRunner.query(`
      INSERT INTO "assets" (
        "ticker",
        "name",
        "assetType",
        "sector",
        "yahooTicker",
        "isActive",
        "maturityDate",
        "lastCatalogCheck"
      )
      VALUES
        ('S31M4', 'LECAP Vto Mar-2024', 'LECAP', 'Renta Fija', 'S31M4.BA', false, '2024-03-31', NOW()),
        ('TDA24', 'BONCAP Vto Dic-2024', 'BONCAP', 'Renta Fija', 'TDA24.BA', false, '2024-12-31', NOW())
      ON CONFLICT ("ticker") DO UPDATE
      SET
        "assetType" = EXCLUDED."assetType",
        "isActive" = EXCLUDED."isActive",
        "maturityDate" = EXCLUDED."maturityDate",
        "lastCatalogCheck" = EXCLUDED."lastCatalogCheck"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "assets"
      SET "maturityDate" = NULL,
          "lastCatalogCheck" = NULL
      WHERE "ticker" IN ('AL30', 'GD30')
    `);

    await queryRunner.query(`
      DELETE FROM "assets"
      WHERE "ticker" IN ('S31M4', 'TDA24')
    `);
  }
}
