import { BadRequestException, Controller, Get, Logger } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MarketDataService } from '../../../../application/MarketDataService';
import { DollarQuote } from '../../../../domain/entities/DollarQuote';
import { CountryRisk } from '../../../../domain/entities/CountryRisk';
import { MarketQuote } from '../../../../domain/entities/MarketQuote';
import { Asset } from '../../../../domain/entities/Asset';
import { AssetNotFoundError } from '../../../../domain/errors/AssetNotFoundError';
import { TopMoversQueryRequest } from './request/TopMoversQueryRequest';
import { Param, Query } from '@nestjs/common';
import { DollarType } from '../../../../domain/enums/DollarType';
import { MarketHistoryQueryRequest } from './request/MarketHistoryQueryRequest';

@ApiTags('Market')
@Controller('market')
export class MarketController {
  private readonly logger = new Logger(MarketController.name);

  constructor(private readonly marketDataService: MarketDataService) {}

  private toArgentinaDate(date: Date): Date {
    return new Date(
      date.toLocaleString('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires',
      }),
    );
  }

  private buildNextOpenAndClose(isOpen: boolean): {
    closesAt: string | null;
    nextOpen: string | null;
  } {
    const nowAr = this.toArgentinaDate(new Date());
    const weekday = nowAr.getDay();

    if (weekday === 0 || weekday === 6) {
      const daysUntilMonday = weekday === 0 ? 1 : 2;
      const mondayOpen = new Date(nowAr);
      mondayOpen.setDate(mondayOpen.getDate() + daysUntilMonday);
      mondayOpen.setHours(10, 0, 0, 0);
      return {
        closesAt: null,
        nextOpen: mondayOpen.toISOString(),
      };
    }

    const todayOpen = new Date(nowAr);
    todayOpen.setHours(10, 0, 0, 0);
    const todayClose = new Date(nowAr);
    todayClose.setHours(17, 0, 0, 0);

    if (isOpen) {
      return {
        closesAt: todayClose.toISOString(),
        nextOpen: null,
      };
    }

    if (nowAr < todayOpen) {
      return {
        closesAt: null,
        nextOpen: todayOpen.toISOString(),
      };
    }

    const nextOpen = new Date(nowAr);
    nextOpen.setDate(nextOpen.getDate() + 1);
    if (nextOpen.getDay() === 6) {
      nextOpen.setDate(nextOpen.getDate() + 2);
    }
    if (nextOpen.getDay() === 0) {
      nextOpen.setDate(nextOpen.getDate() + 1);
    }
    nextOpen.setHours(10, 0, 0, 0);

    return {
      closesAt: null,
      nextOpen: nextOpen.toISOString(),
    };
  }

  private resolveMarketPhase(isOpen: boolean): string {
    if (isOpen) {
      return 'CONTINUOUS_TRADING';
    }

    const nowAr = this.toArgentinaDate(new Date());
    const weekday = nowAr.getDay();
    const hour = nowAr.getHours();
    if (weekday === 0 || weekday === 6) {
      return 'CLOSED_WEEKEND';
    }

    if (hour < 10) {
      return 'PRE_OPEN';
    }

    if (hour >= 17) {
      return 'POST_CLOSE';
    }

    return 'CLOSED';
  }

  private buildDollarPoint(quote: DollarQuote): {
    type: DollarType;
    buyPrice: number | null;
    sellPrice: number | null;
    spread: number | null;
    source: string;
    timestamp: string;
  } {
    const buyPrice = quote.buyPrice;
    const sellPrice = quote.sellPrice;
    const spread =
      typeof buyPrice === 'number' &&
      buyPrice > 0 &&
      typeof sellPrice === 'number'
        ? ((sellPrice - buyPrice) / buyPrice) * 100
        : null;

    return {
      type: quote.type,
      buyPrice,
      sellPrice,
      spread,
      source: quote.source,
      timestamp: quote.timestamp.toISOString(),
    };
  }

  @Get('dollar')
  @ApiOperation({ summary: 'Get all dollar quotes' })
  @ApiResponse({ status: 200 })
  public async getDollarQuotes(): Promise<{
    data: Array<{
      type: DollarType;
      buyPrice: number | null;
      sellPrice: number | null;
      spread: number | null;
      source: string;
      timestamp: string;
    }>;
    updatedAt: string;
  }> {
    const quotes = await this.marketDataService.getDollarQuotes();
    const updatedAt =
      quotes.length > 0
        ? quotes
            .map((quote) => quote.timestamp)
            .sort((a, b) => b.getTime() - a.getTime())[0]!
            .toISOString()
        : new Date().toISOString();

    return {
      data: quotes.map((quote) => this.buildDollarPoint(quote)),
      updatedAt,
    };
  }

  @Get('dollar/:type')
  @ApiOperation({ summary: 'Get latest quote for a dollar type' })
  @ApiParam({ name: 'type', enum: DollarType })
  @ApiResponse({ status: 200 })
  public async getDollarQuoteByType(
    @Param('type') type: DollarType,
  ): Promise<DollarQuote | null> {
    const quotes = await this.marketDataService.getDollarQuotes();
    return quotes.find((quote) => quote.type === type) ?? null;
  }

  @Get('dollar/history/:type')
  @ApiOperation({ summary: 'Get historical quotes for a dollar type' })
  @ApiParam({ name: 'type', enum: DollarType })
  @ApiResponse({ status: 200 })
  public async getDollarHistory(
    @Param('type') type: DollarType,
    @Query() query: MarketHistoryQueryRequest,
  ): Promise<{
    type: DollarType;
    data: Array<{
      date: string;
      buyPrice: number | null;
      sellPrice: number | null;
    }>;
  }> {
    const quotes = await this.marketDataService.getDollarHistory(
      type,
      query.days ?? 30,
    );
    return {
      type,
      data: quotes.map((quote) => ({
        date: quote.timestamp.toISOString().slice(0, 10),
        buyPrice: quote.buyPrice,
        sellPrice: quote.sellPrice,
      })),
    };
  }

  @Get('dollar/history')
  @ApiOperation({ summary: 'Get historical quotes for a dollar type (query)' })
  @ApiResponse({ status: 200 })
  public async getDollarHistoryByQuery(
    @Query() query: MarketHistoryQueryRequest,
  ): Promise<{
    type: DollarType;
    data: Array<{
      date: string;
      buyPrice: number | null;
      sellPrice: number | null;
    }>;
  }> {
    if (!query.type) {
      throw new BadRequestException(
        'Query parameter "type" is required for dollar history',
      );
    }

    const quotes = await this.marketDataService.getDollarHistory(
      query.type,
      query.days ?? 30,
    );

    return {
      type: query.type,
      data: quotes.map((quote) => ({
        date: quote.timestamp.toISOString().slice(0, 10),
        buyPrice: quote.buyPrice,
        sellPrice: quote.sellPrice,
      })),
    };
  }

  @Get('risk')
  @ApiOperation({ summary: 'Get current country risk' })
  @ApiResponse({ status: 200 })
  public async getCountryRisk(): Promise<{
    value: number;
    changePct: number;
    previousValue: number | null;
    timestamp: string;
  }> {
    const [risk, history] = await Promise.all([
      this.marketDataService.getCountryRisk(),
      this.marketDataService.getCountryRiskHistory(2),
    ]);

    const sortedHistory = [...history].sort(
      (left, right) => right.timestamp.getTime() - left.timestamp.getTime(),
    );
    const previousValue = sortedHistory[1]?.value ?? null;

    return {
      value: risk.value,
      changePct: risk.changePct,
      previousValue,
      timestamp: risk.timestamp.toISOString(),
    };
  }

  @Get('risk/history')
  @ApiOperation({ summary: 'Get country risk history' })
  @ApiResponse({ status: 200 })
  public async getCountryRiskHistory(
    @Query() query: MarketHistoryQueryRequest,
  ): Promise<CountryRisk[]> {
    return this.marketDataService.getCountryRiskHistory(query.days ?? 30);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get market summary' })
  @ApiResponse({ status: 200 })
  public async getMarketSummary(): Promise<{
    merval: {
      value: number | null;
      changePct: number | null;
      volume: number | null;
    };
    dollar: {
      official: { sell: number | null; changePct: number | null };
      blue: { sell: number | null; changePct: number | null };
      mep: { sell: number | null; changePct: number | null };
    };
    risk: {
      value: number;
      changePct: number;
    };
    marketStatus: {
      isOpen: boolean;
      closesAt: string | null;
      nextOpen: string | null;
    };
  }> {
    const summary = await this.marketDataService.getMarketSummary();
    const riskHistory = await this.marketDataService.getCountryRiskHistory(2);
    const dollarByType = new Map(
      summary.dollar.map((quote) => [quote.type, quote]),
    );
    const statusFields = this.buildNextOpenAndClose(
      summary.marketStatus.marketOpen,
    );

    let mervalValue: number | null = null;
    let mervalChangePct: number | null = null;

    try {
      const mervalStats = await this.marketDataService.getAssetStats('MERV', 2);
      mervalValue = mervalStats.latestClose;
      mervalChangePct = mervalStats.changePctFromPeriodStart;
    } catch (error) {
      if (!(error instanceof AssetNotFoundError)) {
        const message =
          error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(
          `Unable to enrich market summary with MERV stats: ${message}`,
        );
      }
      mervalValue = null;
      mervalChangePct = null;
    }

    const latestRisk = riskHistory
      .sort(
        (left, right) => right.timestamp.getTime() - left.timestamp.getTime(),
      )
      .at(0);
    const previousRisk = riskHistory
      .sort(
        (left, right) => right.timestamp.getTime() - left.timestamp.getTime(),
      )
      .at(1);
    const riskChangePct =
      latestRisk && previousRisk && previousRisk.value !== 0
        ? ((latestRisk.value - previousRisk.value) / previousRisk.value) * 100
        : summary.risk.changePct;

    return {
      merval: {
        value: mervalValue,
        changePct: mervalChangePct,
        volume: null,
      },
      dollar: {
        official: {
          sell: dollarByType.get(DollarType.OFICIAL)?.sellPrice ?? null,
          changePct: null,
        },
        blue: {
          sell: dollarByType.get(DollarType.BLUE)?.sellPrice ?? null,
          changePct: null,
        },
        mep: {
          sell: dollarByType.get(DollarType.MEP)?.sellPrice ?? null,
          changePct: null,
        },
      },
      risk: {
        value: summary.risk.value,
        changePct: riskChangePct,
      },
      marketStatus: {
        isOpen: summary.marketStatus.marketOpen,
        closesAt: statusFields.closesAt,
        nextOpen: statusFields.nextOpen,
      },
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get market data refresh status' })
  @ApiResponse({ status: 200 })
  public async getMarketStatus(): Promise<{
    isOpen: boolean;
    currentPhase: string;
    closesAt: string | null;
    nextOpen: string | null;
    timezone: string;
  }> {
    const status = await this.marketDataService.getMarketStatus();
    const statusFields = this.buildNextOpenAndClose(status.marketOpen);

    return {
      isOpen: status.marketOpen,
      currentPhase: this.resolveMarketPhase(status.marketOpen),
      closesAt: statusFields.closesAt,
      nextOpen: statusFields.nextOpen,
      timezone: 'America/Argentina/Buenos_Aires',
    };
  }

  @Get('top-movers')
  @ApiOperation({ summary: 'Get top gainers and losers by asset type' })
  @ApiResponse({ status: 200 })
  public async getTopMovers(@Query() query: TopMoversQueryRequest): Promise<{
    gainers: Array<{ asset: Asset; quote: MarketQuote }>;
    losers: Array<{ asset: Asset; quote: MarketQuote }>;
  }> {
    return this.marketDataService.getTopMovers(query.type, query.limit ?? 5);
  }
}
