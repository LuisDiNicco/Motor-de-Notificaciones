import { GetNewsByTickerUseCase } from 'src/modules/news/application/GetNewsByTickerUseCase';
import { INewsRepository } from 'src/modules/news/application/INewsRepository';

describe('GetNewsByTickerUseCase', () => {
  it('returns paginated news filtered by ticker', async () => {
    const repository: INewsRepository = {
      findLatest: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        totalPages: 1,
      }),
      saveMany: jest.fn(),
      findExistingUrls: jest.fn(),
      deleteOlderThan: jest.fn(),
    };

    const useCase = new GetNewsByTickerUseCase(repository);

    await useCase.execute({ ticker: 'GGAL', page: 1, limit: 20 });

    expect(repository.findLatest).toHaveBeenCalledWith({
      ticker: 'GGAL',
      page: 1,
      limit: 20,
    });
  });
});
