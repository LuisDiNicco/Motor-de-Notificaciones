import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { NewsController } from '../src/modules/news/infrastructure/primary-adapters/http/controllers/NewsController';
import { GetNewsByTickerUseCase } from '../src/modules/news/application/GetNewsByTickerUseCase';
import { NewsArticle } from '../src/modules/news/domain/entities/NewsArticle';

describe('News endpoints (e2e)', () => {
  let app: INestApplication;

  const getNewsByTickerUseCaseMock = {
    execute: jest.fn(
      async (request: { ticker?: string; page: number; limit: number }) => {
        const articles = [
          new NewsArticle(
            'GGAL sube 3% en BYMA',
            'https://news.test/ggal',
            new Date('2026-03-02T12:00:00.000Z'),
            'ambito',
            'mercados',
            ['GGAL'],
          ),
        ];

        const filtered = request.ticker
          ? articles.filter((article) =>
              article.mentionedTickers.includes(request.ticker as string),
            )
          : articles;

        return {
          data: filtered,
          total: filtered.length,
          page: request.page,
          totalPages: 1,
        };
      },
    ),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [NewsController],
      providers: [
        {
          provide: GetNewsByTickerUseCase,
          useValue: getNewsByTickerUseCaseMock,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/news (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/news?page=1&limit=10')
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body).toHaveProperty('meta');
    expect(response.body.data[0].mentionedTickers).toContain('GGAL');
  });

  it('/api/v1/news?ticker=GGAL (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/news?ticker=GGAL&page=1&limit=10')
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].mentionedTickers).toContain('GGAL');
  });
});
