import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { INewsFeedClient } from '../../../../application/INewsFeedClient';
import { NewsArticle } from '../../../../domain/entities/NewsArticle';
import { AssetEntity } from '../../../../../market-data/infrastructure/secondary-adapters/database/entities/AssetEntity';

interface FeedSource {
  source: string;
  url: string;
}

@Injectable()
export class RSSFeedClient implements INewsFeedClient {
  private readonly logger = new Logger(RSSFeedClient.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AssetEntity)
    private readonly assetRepository: Repository<AssetEntity>,
  ) {}

  public async fetchLatestNews(): Promise<NewsArticle[]> {
    const sources = this.getSources();
    const timeoutMs = this.configService.get<number>(
      'market.newsHttpTimeoutMs',
      8000,
    );
    const maxPerFeed = this.configService.get<number>(
      'market.newsMaxItemsPerFeed',
      30,
    );

    const catalogTickers = await this.getCatalogTickers();
    const articles: NewsArticle[] = [];

    for (const source of sources) {
      try {
        const xml = await this.fetchFeedXml(source.url, timeoutMs);
        const parsed = this.parseFeed(xml, source.source, catalogTickers).slice(
          0,
          maxPerFeed,
        );
        articles.push(...parsed);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(
          `RSS source ${source.source} failed (${source.url}): ${message}`,
        );
      }
    }

    return articles;
  }

  private async fetchFeedXml(url: string, timeoutMs: number): Promise<string> {
    const response = await axios.get<string>(url, {
      timeout: timeoutMs,
      responseType: 'text',
      headers: {
        'User-Agent': 'NotiFinance/2.0 (news-aggregator)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml',
      },
    });

    return response.data;
  }

  private parseFeed(
    xml: string,
    source: string,
    catalogTickers: Set<string>,
  ): NewsArticle[] {
    const normalizedXml = xml.replace(/\r\n/g, '\n');
    const items = this.extractRssItems(normalizedXml);

    if (items.length > 0) {
      return items
        .map((itemXml) =>
          this.mapRssItemToArticle(itemXml, source, catalogTickers),
        )
        .filter((article): article is NewsArticle => article !== null);
    }

    const entries = this.extractAtomEntries(normalizedXml);
    return entries
      .map((entryXml) =>
        this.mapAtomEntryToArticle(entryXml, source, catalogTickers),
      )
      .filter((article): article is NewsArticle => article !== null);
  }

  private extractRssItems(xml: string): string[] {
    const matches = xml.match(/<item[\s\S]*?<\/item>/gi);
    return matches ?? [];
  }

  private extractAtomEntries(xml: string): string[] {
    const matches = xml.match(/<entry[\s\S]*?<\/entry>/gi);
    return matches ?? [];
  }

  private mapRssItemToArticle(
    itemXml: string,
    source: string,
    catalogTickers: Set<string>,
  ): NewsArticle | null {
    const title = this.decodeText(this.extractTagValue(itemXml, 'title') ?? '');
    const rawUrl = this.decodeText(this.extractTagValue(itemXml, 'link') ?? '');
    const category = this.decodeText(
      this.extractTagValue(itemXml, 'category') ?? '',
    );
    const publishedRaw =
      this.extractTagValue(itemXml, 'pubDate') ??
      this.extractTagValue(itemXml, 'published') ??
      this.extractTagValue(itemXml, 'updated');

    const publishedAt = this.parseDate(publishedRaw);
    const url = this.normalizeUrl(rawUrl);

    if (!title || !url) {
      return null;
    }

    return new NewsArticle(
      title,
      url,
      publishedAt,
      source,
      category || null,
      this.detectTickers(title, catalogTickers),
    );
  }

  private mapAtomEntryToArticle(
    entryXml: string,
    source: string,
    catalogTickers: Set<string>,
  ): NewsArticle | null {
    const title = this.decodeText(
      this.extractTagValue(entryXml, 'title') ??
        this.extractTagValue(entryXml, 'summary') ??
        '',
    );
    const url =
      this.normalizeUrl(this.extractAttributeValue(entryXml, 'link', 'href')) ??
      this.normalizeUrl(this.extractTagValue(entryXml, 'id') ?? '');
    const category = this.decodeText(
      this.extractAttributeValue(entryXml, 'category', 'term') ??
        this.extractTagValue(entryXml, 'category') ??
        '',
    );
    const publishedRaw =
      this.extractTagValue(entryXml, 'published') ??
      this.extractTagValue(entryXml, 'updated');

    const publishedAt = this.parseDate(publishedRaw);

    if (!title || !url) {
      return null;
    }

    return new NewsArticle(
      title,
      url,
      publishedAt,
      source,
      category || null,
      this.detectTickers(title, catalogTickers),
    );
  }

  private extractTagValue(xmlBlock: string, tagName: string): string | null {
    const regex = new RegExp(
      `<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
      'i',
    );
    const match = xmlBlock.match(regex);
    if (!match) {
      return null;
    }

    return this.stripCdata(match[1]?.trim() ?? '');
  }

  private extractAttributeValue(
    xmlBlock: string,
    tagName: string,
    attributeName: string,
  ): string {
    const regex = new RegExp(
      `<${tagName}[^>]*${attributeName}=["']([^"']+)["'][^>]*>`,
      'i',
    );
    const match = xmlBlock.match(regex);
    return match?.[1]?.trim() ?? '';
  }

  private stripCdata(value: string): string {
    return value
      .replace(/^<!\[CDATA\[/, '')
      .replace(/\]\]>$/, '')
      .trim();
  }

  private decodeText(value: string): string {
    return value
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeUrl(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    if (
      !normalized.startsWith('http://') &&
      !normalized.startsWith('https://')
    ) {
      return null;
    }

    return normalized.toLowerCase();
  }

  private parseDate(value?: string | null): Date {
    if (!value) {
      return new Date();
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }

    return parsed;
  }

  private detectTickers(title: string, catalogTickers: Set<string>): string[] {
    const upperTitle = title.toUpperCase();
    const matches = upperTitle.match(/\b[A-Z]{2,8}\b/g) ?? [];
    const tickers = new Set<string>();

    for (const token of matches) {
      if (catalogTickers.has(token)) {
        tickers.add(token);
      }
    }

    return Array.from(tickers);
  }

  private async getCatalogTickers(): Promise<Set<string>> {
    const assets = await this.assetRepository.find({
      select: { ticker: true },
      where: { isActive: true },
    });

    return new Set(assets.map((asset) => asset.ticker.toUpperCase()));
  }

  private getSources(): FeedSource[] {
    return [
      {
        source: 'ambito',
        url: this.configService.get<string>(
          'market.newsFeeds.ambito',
          'https://www.ambito.com/rss/pages/mercados.xml',
        ),
      },
      {
        source: 'cronista',
        url: this.configService.get<string>(
          'market.newsFeeds.cronista',
          'https://www.cronista.com/files/rss/news.xml',
        ),
      },
      {
        source: 'infobae',
        url: this.configService.get<string>(
          'market.newsFeeds.infobae',
          'https://www.infobae.com/arc/outboundfeeds/rss/',
        ),
      },
    ];
  }
}
