import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { type IQuoteRepository } from '../../../../application/IQuoteRepository';
import { MarketQuote } from '../../../../domain/entities/MarketQuote';
import { AssetType } from '../../../../domain/enums/AssetType';
import { MarketQuoteEntity } from '../entities/MarketQuoteEntity';

interface RawLatestQuoteRow {
  id: string;
  assetId: string;
  priceArs: string | null;
  priceUsd: string | null;
  openPrice: string | null;
  highPrice: string | null;
  lowPrice: string | null;
  closePrice: string | null;
  volume: string | null;
  changePct: string | null;
  source: string | null;
  sourceTimestamp: Date | string | null;
  confidence: string | null;
  date: string;
}

@Injectable()
export class TypeOrmQuoteRepository implements IQuoteRepository {
  constructor(
    @InjectRepository(MarketQuoteEntity)
    private readonly repository: Repository<MarketQuoteEntity>,
  ) {}

  public async saveBulkQuotes(quotes: MarketQuote[]): Promise<void> {
    const persistableQuotes = quotes.filter(
      (quote): quote is MarketQuote & { assetId: string } =>
        typeof quote.assetId === 'string',
    );

    if (persistableQuotes.length === 0) {
      return;
    }

    const entities = persistableQuotes.map((quote) =>
      this.repository.create({
        assetId: quote.assetId,
        priceArs: quote.priceArs,
        priceUsd: quote.priceUsd,
        openPrice: quote.openPrice,
        highPrice: quote.highPrice,
        lowPrice: quote.lowPrice,
        closePrice: quote.closePrice,
        volume: quote.volume != null ? String(Math.trunc(quote.volume)) : null,
        changePct: quote.changePct,
        source: quote.source,
        sourceTimestamp: quote.sourceTimestamp,
        confidence: quote.confidence,
        date: this.toDateString(quote.date),
      }),
    );

    await this.repository.upsert(entities, ['assetId', 'date']);
  }

  public async findByAssetAndPeriod(
    assetId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MarketQuote[]> {
    const entities = await this.repository.find({
      where: {
        assetId,
        date: Between(this.toDateString(startDate), this.toDateString(endDate)),
      },
      order: {
        date: 'ASC',
      },
    });

    return entities.map((entity) => this.toDomain(entity));
  }

  public async findLatestByAsset(assetId: string): Promise<MarketQuote | null> {
    const entity = await this.repository.findOne({
      where: { assetId },
      order: { date: 'DESC' },
    });

    return entity ? this.toDomain(entity) : null;
  }

  public async findLatestTimestamp(): Promise<Date | null> {
    const row = await this.repository
      .createQueryBuilder('quote')
      .select('MAX(quote.date)', 'latest')
      .getRawOne<{ latest: string | Date | null }>();

    if (!row?.latest) {
      return null;
    }

    const parsedDate =
      row.latest instanceof Date
        ? new Date(row.latest)
        : /^\d{4}-\d{2}-\d{2}$/.test(row.latest)
          ? new Date(`${row.latest}T00:00:00.000Z`)
          : new Date(row.latest);

    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    return parsedDate;
  }

  public async findTopMovers(
    assetType: AssetType,
    limit: number,
  ): Promise<{ gainers: MarketQuote[]; losers: MarketQuote[] }> {
    const safeLimit = Math.max(1, Math.min(limit, 50));

    const rawRows: unknown = await this.repository.query(
      `
            SELECT DISTINCT ON (mq."assetId")
                mq."id",
                mq."assetId",
                mq."priceArs",
                mq."priceUsd",
                mq."openPrice",
                mq."highPrice",
                mq."lowPrice",
                mq."closePrice",
                mq."volume",
                mq."changePct",
                mq."source",
                mq."sourceTimestamp",
                mq."confidence",
                mq."date"
            FROM "market_quotes" mq
            INNER JOIN "assets" a ON a."id" = mq."assetId"
            WHERE a."assetType" = $1
              AND a."isActive" = true
              AND mq."changePct" IS NOT NULL
            ORDER BY mq."assetId", mq."date" DESC
            `,
      [assetType],
    );

    const latestRows = Array.isArray(rawRows)
      ? (rawRows as RawLatestQuoteRow[])
      : [];

    const asDomain = latestRows.map((row) => {
      const quote = new MarketQuote(new Date(`${row.date}T00:00:00.000Z`), {
        assetId: row.assetId,
        priceArs: this.toNullableRawNumber(row.priceArs),
        priceUsd: this.toNullableRawNumber(row.priceUsd),
        openPrice: this.toNullableRawNumber(row.openPrice),
        highPrice: this.toNullableRawNumber(row.highPrice),
        lowPrice: this.toNullableRawNumber(row.lowPrice),
        closePrice: this.toNullableRawNumber(row.closePrice),
        volume: this.toNullableRawNumber(row.volume),
        changePct: this.toNullableRawNumber(row.changePct),
        source: row.source,
        sourceTimestamp: this.toNullableDate(row.sourceTimestamp),
        confidence: row.confidence,
      });

      quote.id = row.id;
      return quote;
    });

    const sortedByChange = asDomain
      .filter((quote) => typeof quote.changePct === 'number')
      .sort(
        (left, right) =>
          (right.changePct as number) - (left.changePct as number),
      );

    return {
      gainers: sortedByChange.slice(0, safeLimit),
      losers: [...sortedByChange].reverse().slice(0, safeLimit),
    };
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private toDomain(entity: MarketQuoteEntity): MarketQuote {
    const quote = new MarketQuote(new Date(`${entity.date}T00:00:00.000Z`), {
      assetId: entity.assetId,
      priceArs: this.toNullableNumber(entity.priceArs),
      priceUsd: this.toNullableNumber(entity.priceUsd),
      openPrice: this.toNullableNumber(entity.openPrice),
      highPrice: this.toNullableNumber(entity.highPrice),
      lowPrice: this.toNullableNumber(entity.lowPrice),
      closePrice: this.toNullableNumber(entity.closePrice),
      volume: entity.volume != null ? Number(entity.volume) : null,
      changePct: this.toNullableNumber(entity.changePct),
      source: entity.source,
      sourceTimestamp: entity.sourceTimestamp,
      confidence: entity.confidence,
    });

    quote.id = entity.id;
    return quote;
  }

  private toNullableNumber(value: number | null): number | null {
    return value == null ? null : Number(value);
  }

  private toNullableRawNumber(value: string | null): number | null {
    if (value == null) {
      return null;
    }

    return Number(value);
  }

  private toNullableDate(value: string | Date | null): Date | null {
    if (value == null) {
      return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }
}
