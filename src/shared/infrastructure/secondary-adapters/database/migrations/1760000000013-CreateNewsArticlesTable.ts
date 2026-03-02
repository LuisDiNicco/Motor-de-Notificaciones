import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNewsArticlesTable1760000000013 implements MigrationInterface {
  name = 'CreateNewsArticlesTable1760000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "news_articles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        "title" character varying(500) NOT NULL,
        "url" character varying(1200) NOT NULL,
        "source" character varying(120) NOT NULL,
        "category" character varying(120),
        "publishedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "mentionedTickers" text[] NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_news_articles_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_news_articles_url" UNIQUE ("url")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_news_articles_publishedAt"
      ON "news_articles" ("publishedAt")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_news_articles_source_publishedAt"
      ON "news_articles" ("source", "publishedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_news_articles_source_publishedAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_news_articles_publishedAt"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "news_articles"`);
  }
}
