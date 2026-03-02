import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { type IAssetRepository } from '../../../../application/IAssetRepository';
import { Asset } from '../../../../domain/entities/Asset';
import { AssetType } from '../../../../domain/enums/AssetType';
import { AssetEntity } from '../entities/AssetEntity';

@Injectable()
export class TypeOrmAssetRepository implements IAssetRepository {
  constructor(
    @InjectRepository(AssetEntity)
    private readonly repository: Repository<AssetEntity>,
  ) {}

  public async findAll(
    type?: AssetType,
    includeInactive = false,
  ): Promise<Asset[]> {
    const entities = await this.repository.find({
      where: type
        ? { assetType: type, ...(includeInactive ? {} : { isActive: true }) }
        : includeInactive
          ? {}
          : { isActive: true },
      order: { ticker: 'ASC' },
    });

    return entities.map((entity) => this.toDomain(entity));
  }

  public async findPaginated(params: {
    type?: AssetType;
    page: number;
    limit: number;
    includeInactive?: boolean;
  }): Promise<{ data: Asset[]; total: number }> {
    const where = params.type
      ? {
          assetType: params.type,
          ...(params.includeInactive ? {} : { isActive: true }),
        }
      : params.includeInactive
        ? {}
        : { isActive: true };

    const [entities, total] = await this.repository.findAndCount({
      where,
      order: { ticker: 'ASC' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    });

    return {
      data: entities.map((entity) => this.toDomain(entity)),
      total,
    };
  }

  public async findByTicker(ticker: string): Promise<Asset | null> {
    const normalizedTicker = ticker.trim().toUpperCase();
    const entity = await this.repository.findOne({
      where: { ticker: normalizedTicker, isActive: true },
    });

    return entity ? this.toDomain(entity) : null;
  }

  public async search(query: string, limit: number): Promise<Asset[]> {
    const normalizedQuery = query.trim();
    const entities = await this.repository.find({
      where: [
        { ticker: ILike(`%${normalizedQuery}%`), isActive: true },
        { name: ILike(`%${normalizedQuery}%`), isActive: true },
      ],
      order: { ticker: 'ASC' },
      take: limit,
    });

    return entities.map((entity) => this.toDomain(entity));
  }

  private toDomain(entity: AssetEntity): Asset {
    const asset = new Asset(
      entity.ticker,
      entity.name,
      entity.assetType as AssetType,
      entity.sector,
      entity.yahooTicker,
    );

    asset.id = entity.id;
    return asset;
  }
}
