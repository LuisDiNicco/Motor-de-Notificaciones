import { Injectable } from '@nestjs/common';
import { type IAssetRepository } from '../../../../application/IAssetRepository';
import { Asset } from '../../../../domain/entities/Asset';
import { AssetType } from '../../../../domain/enums/AssetType';

@Injectable()
export class StaticAssetRepository implements IAssetRepository {
  private readonly assets: Asset[] = [
    new Asset(
      'GGAL',
      'Grupo Financiero Galicia',
      AssetType.STOCK,
      'Financiero',
      'GGAL.BA',
    ),
    new Asset('YPFD', 'YPF', AssetType.STOCK, 'Energía', 'YPFD.BA'),
    new Asset('PAMP', 'Pampa Energía', AssetType.STOCK, 'Energía', 'PAMP.BA'),
    new Asset(
      'AAPL',
      'Apple (CEDEAR)',
      AssetType.CEDEAR,
      'Tecnología',
      'AAPL.BA',
    ),
    new Asset(
      'MSFT',
      'Microsoft (CEDEAR)',
      AssetType.CEDEAR,
      'Tecnología',
      'MSFT.BA',
    ),
    new Asset('AL30', 'Bonares 2030', AssetType.BOND, 'Renta Fija', 'AL30.BA'),
    new Asset('GD30', 'Globales 2030', AssetType.BOND, 'Renta Fija', 'GD30.BA'),
  ];

  public findAll(type?: AssetType, includeInactive = false): Promise<Asset[]> {
    void includeInactive;

    if (!type) {
      return Promise.resolve(this.assets);
    }

    return Promise.resolve(
      this.assets.filter((asset) => asset.assetType === type),
    );
  }

  public findPaginated(params: {
    type?: AssetType;
    page: number;
    limit: number;
    includeInactive?: boolean;
  }): Promise<{ data: Asset[]; total: number }> {
    void params.includeInactive;

    const filtered = params.type
      ? this.assets.filter((asset) => asset.assetType === params.type)
      : this.assets;
    const start = (params.page - 1) * params.limit;
    const end = start + params.limit;

    return Promise.resolve({
      data: filtered.slice(start, end),
      total: filtered.length,
    });
  }

  public findByTicker(ticker: string): Promise<Asset | null> {
    const normalizedTicker = ticker.trim().toUpperCase();
    return Promise.resolve(
      this.assets.find((asset) => asset.ticker === normalizedTicker) ?? null,
    );
  }

  public search(query: string, limit: number): Promise<Asset[]> {
    const normalizedQuery = query.trim().toLowerCase();

    return Promise.resolve(
      this.assets
        .filter(
          (asset) =>
            asset.ticker.toLowerCase().includes(normalizedQuery) ||
            asset.name.toLowerCase().includes(normalizedQuery),
        )
        .slice(0, limit),
    );
  }
}
