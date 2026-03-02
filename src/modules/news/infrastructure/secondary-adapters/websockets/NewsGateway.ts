import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { NewsArticle } from '../../../domain/entities/NewsArticle';

@WebSocketGateway({
  namespace: '/news',
  cors: { origin: '*' },
})
@Injectable()
export class NewsGateway {
  @WebSocketServer()
  public server!: Server;

  private readonly logger = new Logger(NewsGateway.name);

  public emitLatest(articles: NewsArticle[]): void {
    if (!this.server || articles.length === 0) {
      return;
    }

    const payload = {
      count: articles.length,
      timestamp: new Date().toISOString(),
      articles: articles.map((article) => ({
        id: article.id,
        title: article.title,
        url: article.url,
        source: article.source,
        category: article.category,
        publishedAt: article.publishedAt.toISOString(),
        mentionedTickers: article.mentionedTickers,
      })),
    };

    this.server.emit('news:latest', payload);
    this.logger.log(`Emitted news:latest (${articles.length} articles)`);
  }
}
