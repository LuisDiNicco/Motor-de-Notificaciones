import { Asset } from '../domain/entities/Asset';
import { AssetType } from '../domain/enums/AssetType';

export const ASSET_REPOSITORY = 'IAssetRepository';

export interface IAssetRepository {
  findAll(type?: AssetType, includeInactive?: boolean): Promise<Asset[]>;
  findPaginated(params: {
    type?: AssetType;
    page: number;
    limit: number;
    includeInactive?: boolean;
  }): Promise<{ data: Asset[]; total: number }>;
  findByTicker(ticker: string): Promise<Asset | null>;
  search(query: string, limit: number): Promise<Asset[]>;
}
