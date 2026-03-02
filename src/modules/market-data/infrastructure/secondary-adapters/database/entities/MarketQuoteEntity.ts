import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../../../shared/infrastructure/base/database/BaseEntity';

@Entity('market_quotes')
@Index('IDX_market_quotes_asset_date', ['assetId', 'date'])
@Index('UQ_market_quotes_asset_date', ['assetId', 'date'], { unique: true })
export class MarketQuoteEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  assetId!: string;

  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  priceArs!: number | null;

  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  priceUsd!: number | null;

  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  openPrice!: number | null;

  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  highPrice!: number | null;

  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  lowPrice!: number | null;

  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  closePrice!: number | null;

  @Column({ type: 'bigint', nullable: true })
  volume!: string | null;

  @Column({ type: 'numeric', precision: 8, scale: 4, nullable: true })
  changePct!: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  source!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sourceTimestamp!: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  confidence!: string | null;

  @Column({ type: 'date' })
  date!: string;
}
