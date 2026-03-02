import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../../../shared/infrastructure/base/database/BaseEntity';
import { ProviderCheckStatus } from '../../../../domain/entities/ProviderHealth';

@Entity('provider_health')
@Index('IDX_provider_health_provider_checked_at', ['providerName', 'checkedAt'])
@Index('IDX_provider_health_checked_at', ['checkedAt'])
export class ProviderHealthEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 120 })
  providerName!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: ProviderCheckStatus;

  @Column({ type: 'int' })
  latencyMs!: number;

  @Column({ type: 'timestamp' })
  checkedAt!: Date;

  @Column({ type: 'varchar', length: 200, nullable: true })
  endpoint!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  errorMessage!: string | null;
}
