import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../../../shared/infrastructure/base/database/BaseEntity';

@Entity('news_articles')
@Index('IDX_news_articles_publishedAt', ['publishedAt'])
@Index('IDX_news_articles_source_publishedAt', ['source', 'publishedAt'])
@Index('UQ_news_articles_url', ['url'], { unique: true })
export class NewsArticleEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'varchar', length: 1200 })
  url!: string;

  @Column({ type: 'varchar', length: 120 })
  source!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  category!: string | null;

  @Column({ type: 'timestamptz' })
  publishedAt!: Date;

  @Column({ type: 'text', array: true, default: '{}' })
  mentionedTickers!: string[];
}
