export class Holding {
  public readonly assetId: string;
  public readonly ticker: string;
  public readonly quantity: number;
  public readonly avgCostBasis: number;
  public readonly currentPrice: number;
  public readonly marketValue: number;
  public readonly costBasis: number;
  public readonly unrealizedPnl: number;
  public readonly unrealizedPnlPct: number;
  public readonly weight: number;
  public readonly priceAge: number | null;
  public readonly isStale: boolean;

  constructor(params: {
    assetId: string;
    ticker: string;
    quantity: number;
    avgCostBasis: number;
    currentPrice: number;
    marketValue: number;
    costBasis: number;
    unrealizedPnl: number;
    unrealizedPnlPct: number;
    weight: number;
    priceAge?: number | null;
    isStale?: boolean;
  }) {
    this.assetId = params.assetId;
    this.ticker = params.ticker;
    this.quantity = params.quantity;
    this.avgCostBasis = params.avgCostBasis;
    this.currentPrice = params.currentPrice;
    this.marketValue = params.marketValue;
    this.costBasis = params.costBasis;
    this.unrealizedPnl = params.unrealizedPnl;
    this.unrealizedPnlPct = params.unrealizedPnlPct;
    this.weight = params.weight;
    this.priceAge = params.priceAge ?? null;
    this.isStale = params.isStale ?? false;
  }
}
