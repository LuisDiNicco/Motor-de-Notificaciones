import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../../../shared/infrastructure/base/database/BaseEntity';

@Entity('assets')
@Index('IDX_assets_ticker', ['ticker'], { unique: true })
@Index('IDX_assets_asset_type', ['assetType'])
export class AssetEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 20 })
  ticker!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 50 })
  assetType!: string;

  @Column({ type: 'varchar', length: 100, default: 'General' })
  sector!: string;

  @Column({ type: 'varchar', length: 30 })
  yahooTicker!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'date', nullable: true })
  maturityDate!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastCatalogCheck!: Date | null;
}
