import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AssetEntity } from 'src/modules/market-data/infrastructure/secondary-adapters/database/entities/AssetEntity';
import { RSSFeedClient } from 'src/modules/news/infrastructure/secondary-adapters/http/clients/RSSFeedClient';

describe('RSSFeedClient', () => {
  it('parses RSS fixture and detects ticker mentions from catalog', async () => {
    const assetRepository = {
      find: jest
        .fn()
        .mockResolvedValue([{ ticker: 'GGAL' }, { ticker: 'YPFD' }]),
    } as unknown as Repository<AssetEntity>;

    const configService = {
      get: jest.fn((key: string, fallback: unknown) => {
        if (key === 'market.newsFeeds.ambito') {
          return 'https://source.test/ambito.xml';
        }
        if (key === 'market.newsFeeds.cronista') {
          return 'https://source.test/cronista.xml';
        }
        if (key === 'market.newsFeeds.infobae') {
          return 'https://source.test/infobae.xml';
        }
        if (key === 'market.newsHttpTimeoutMs') {
          return 5000;
        }
        if (key === 'market.newsMaxItemsPerFeed') {
          return 10;
        }

        return fallback;
      }),
    } as unknown as ConfigService;

    const rssFixture = `
      <rss version="2.0">
        <channel>
          <item>
            <title><![CDATA[GGAL y YPFD lideran subas del día]]></title>
            <link>https://news.test/article-1</link>
            <pubDate>Mon, 02 Mar 2026 10:00:00 GMT</pubDate>
            <category>Mercados</category>
          </item>
        </channel>
      </rss>
    `;

    const client = new RSSFeedClient(configService, assetRepository);
    jest
      .spyOn(
        client as unknown as { fetchFeedXml: (url: string) => Promise<string> },
        'fetchFeedXml',
      )
      .mockResolvedValue(rssFixture);

    const result = await client.fetchLatestNews();

    expect(result.length).toBe(3);
    expect(result[0]?.title).toContain('GGAL');
    expect(result[0]?.url).toBe('https://news.test/article-1');
    expect(result[0]?.mentionedTickers).toEqual(['GGAL', 'YPFD']);
  });
});
