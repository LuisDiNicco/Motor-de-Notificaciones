import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Socket } from 'socket.io';
import { DollarQuote } from '../../../domain/entities/DollarQuote';
import { CountryRisk } from '../../../domain/entities/CountryRisk';

@WebSocketGateway({
  namespace: '/market',
  cors: { origin: '*' },
})
@Injectable()
export class MarketGateway {
  @WebSocketServer()
  public server!: Server;

  private readonly logger = new Logger(MarketGateway.name);

  private get socketServer(): Server | null {
    if (!this.server) {
      return null;
    }

    return this.server;
  }

  @SubscribeMessage('join:room')
  public handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room?: string },
  ): void {
    const room = payload.room;
    if (!room || !room.startsWith('market:')) {
      return;
    }

    void client.join(room);
    this.logger.debug(`Client ${client.id} joined room ${room}`);
  }

  @SubscribeMessage('leave:room')
  public handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room?: string },
  ): void {
    const room = payload.room;
    if (!room || !room.startsWith('market:')) {
      return;
    }

    void client.leave(room);
    this.logger.debug(`Client ${client.id} left room ${room}`);
  }

  public emitDollar(payload: DollarQuote[]): void {
    const server = this.socketServer;
    if (!server) {
      return;
    }

    const quotePayload = payload.map((quote) => ({
      type: quote.type,
      buyPrice: quote.buyPrice,
      sellPrice: quote.sellPrice,
    }));
    const eventPayload = {
      quotes: quotePayload,
      timestamp: new Date().toISOString(),
    };

    server.to('market:all').emit('market:dollar', eventPayload);
    server.to('market:dollar').emit('market:dollar', eventPayload);
    server.emit('market:dollar', eventPayload);
    this.logger.log(`Emitted market:dollar to ${payload.length} quotes`);
  }

  public emitRisk(payload: CountryRisk): void {
    const server = this.socketServer;
    if (!server) {
      return;
    }

    server.to('market:all').emit('market:risk', {
      value: payload.value,
      changePct: payload.changePct,
      timestamp: payload.timestamp.toISOString(),
    });
    server.emit('market:risk', {
      value: payload.value,
      changePct: payload.changePct,
      timestamp: payload.timestamp.toISOString(),
    });
    this.logger.log('Emitted market:risk');
  }

  public emitQuoteUpdated(payload: {
    ticker: string;
    priceArs: number;
    changePct: number;
    volume: number;
    timestamp: string;
    source?: string;
    sourceTimestamp?: string;
    confidence?: string;
  }): void {
    const server = this.socketServer;
    if (!server) {
      return;
    }

    server.emit('market:quote', payload);
    this.logger.log(`Emitted market:quote for ${payload.ticker}`);
  }

  public emitMarketStatus(payload: { isOpen: boolean; phase: string }): void {
    const server = this.socketServer;
    if (!server) {
      return;
    }

    server.emit('market:status', payload);
    this.logger.log(
      `Emitted market:status (${payload.phase}, open=${payload.isOpen})`,
    );
  }
}
