import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { type IDollarProvider } from '../../../../application/IDollarProvider';
import { ProviderHealthTracker } from '../../../../application/ProviderHealthTracker';
import { DollarQuote } from '../../../../domain/entities/DollarQuote';
import { DollarType } from '../../../../domain/enums/DollarType';
import { ArgentinaDatosClient } from './ArgentinaDatosClient';
import { BCRAClient } from './BCRAClient';

interface DolarApiResponse {
  casa: string;
  compra: number | string;
  venta: number | string;
  fechaActualizacion: string;
}

interface BluelyticsQuote {
  value_sell?: number;
  value_buy?: number;
}

interface BluelyticsResponse {
  oficial?: BluelyticsQuote;
  blue?: BluelyticsQuote;
  last_update?: string;
}

interface CriptoYaValue {
  ask?: number;
  bid?: number;
  price?: number;
  timestamp?: number;
}

interface CriptoYaSpreadValue {
  ci?: CriptoYaValue;
  '24hs'?: CriptoYaValue;
}

interface CriptoYaResponse {
  oficial?: CriptoYaValue;
  blue?: CriptoYaValue;
  tarjeta?: CriptoYaValue;
  cripto?: {
    usdt?: CriptoYaValue;
  };
  mep?: {
    al30?: CriptoYaSpreadValue;
    gd30?: CriptoYaSpreadValue;
  };
  ccl?: {
    al30?: CriptoYaSpreadValue;
    gd30?: CriptoYaSpreadValue;
  };
}

interface ConsensusResult {
  quote: DollarQuote;
  sourceCount: number;
}

@Injectable()
export class MultiSourceDollarClient implements IDollarProvider {
  private readonly logger = new Logger(MultiSourceDollarClient.name);
  private readonly sourcePriority = [
    'dolarapi.com',
    'argentinadatos.com',
    'criptoya.com',
    'bluelytics.com',
  ];
  private readonly officialBcraThresholdPct: number;
  private readonly consensusMaxDeviationPct: number;
  private readonly maxSourceAgeMinutes: number;
  private readonly dolarApiUrl: string;
  private readonly bluelyticsUrl: string;
  private readonly criptoYaUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly providerHealthTracker: ProviderHealthTracker,
    private readonly argentinaDatosClient: ArgentinaDatosClient,
    private readonly bcraClient: BCRAClient,
  ) {
    this.officialBcraThresholdPct = this.configService.get<number>(
      'market.dollarCrossValidationThresholdPercent',
      2,
    );
    this.consensusMaxDeviationPct = this.configService.get<number>(
      'market.dollarConsensusMaxDeviationPct',
      8,
    );
    this.maxSourceAgeMinutes = this.configService.get<number>(
      'market.dollarSourceMaxAgeMinutes',
      2880,
    );
    this.dolarApiUrl = this.configService.get<string>(
      'market.dolarApiUrl',
      'https://dolarapi.com/v1',
    );
    this.bluelyticsUrl = this.configService.get<string>(
      'market.bluelyticsUrl',
      'https://api.bluelytics.com.ar/v2',
    );
    this.criptoYaUrl = this.configService.get<string>(
      'market.criptoYaUrl',
      'https://criptoya.com/api',
    );
  }

  public async fetchAllDollarQuotes(): Promise<DollarQuote[]> {
    const [
      dolarApiResult,
      argentinaDatosResult,
      bluelyticsResult,
      criptoYaResult,
    ] = await Promise.allSettled([
      this.fetchFromDolarApi(),
      this.argentinaDatosClient.fetchDollarQuotes(),
      this.fetchFromBluelytics(),
      this.fetchFromCriptoYa(),
    ]);

    const sourceQuotes = [
      this.unwrapSourceResult('dolarapi.com', dolarApiResult),
      this.unwrapSourceResult('argentinadatos.com', argentinaDatosResult),
      this.unwrapSourceResult('bluelytics.com', bluelyticsResult),
      this.unwrapSourceResult('criptoya.com', criptoYaResult),
    ];

    const allQuotes = sourceQuotes.flatMap((result) => result.quotes);
    const byType = new Map<DollarType, DollarQuote[]>();

    for (const quote of allQuotes) {
      const list = byType.get(quote.type) ?? [];
      list.push(quote);
      byType.set(quote.type, list);
    }

    const consensusQuotes: DollarQuote[] = [];
    const sourceCountByType = new Map<DollarType, number>();
    for (const type of Object.values(DollarType)) {
      const candidates = byType.get(type) ?? [];
      const consensus = this.buildConsensusQuote(type, candidates);

      if (consensus) {
        consensusQuotes.push(consensus.quote);
        sourceCountByType.set(type, consensus.sourceCount);
      }
    }

    await this.validateOfficialAgainstBcra(consensusQuotes, sourceCountByType);

    if (consensusQuotes.length === 0) {
      throw new Error(
        'No reliable dollar quotes available from configured providers',
      );
    }

    return consensusQuotes;
  }

  private unwrapSourceResult(
    source: string,
    result: PromiseSettledResult<DollarQuote[]>,
  ): { source: string; quotes: DollarQuote[] } {
    if (result.status === 'fulfilled') {
      return { source, quotes: result.value };
    }

    this.logger.warn(`${source} dollar provider failed`);
    return { source, quotes: [] };
  }

  private buildConsensusQuote(
    type: DollarType,
    candidates: DollarQuote[],
  ): ConsensusResult | null {
    const now = Date.now();
    const maxAgeMs = this.maxSourceAgeMinutes * 60 * 1000;
    const freshCandidates = candidates.filter((quote) => {
      const ageMs = now - quote.timestamp.getTime();
      return ageMs <= maxAgeMs;
    });

    if (freshCandidates.length < 2) {
      if (freshCandidates.length === 1) {
        this.logger.warn(
          `Skipping ${type}: requires at least 2 fresh sources, got 1`,
        );
      }
      return null;
    }

    const medianBuy = this.median(
      freshCandidates.map((quote) => quote.buyPrice),
    );
    const medianSell = this.median(
      freshCandidates.map((quote) => quote.sellPrice),
    );

    const inRangeCandidates = freshCandidates.filter((quote) => {
      return (
        this.isWithinDeviation(quote.buyPrice, medianBuy) &&
        this.isWithinDeviation(quote.sellPrice, medianSell)
      );
    });

    const filtered =
      inRangeCandidates.length >= 2 ? inRangeCandidates : freshCandidates;

    const chosenSourceQuote = [...filtered].sort((left, right) => {
      const sourcePriorityDiff =
        this.sourcePriority.indexOf(left.source) -
        this.sourcePriority.indexOf(right.source);

      if (sourcePriorityDiff !== 0) {
        return sourcePriorityDiff;
      }

      const leftDistance =
        Math.abs(left.buyPrice - medianBuy) +
        Math.abs(left.sellPrice - medianSell);
      const rightDistance =
        Math.abs(right.buyPrice - medianBuy) +
        Math.abs(right.sellPrice - medianSell);
      return leftDistance - rightDistance;
    })[0];

    if (!chosenSourceQuote) {
      return null;
    }

    const latestTimestamp = [...filtered]
      .map((quote) => quote.timestamp)
      .sort((left, right) => right.getTime() - left.getTime())[0]!;

    return {
      quote: new DollarQuote(
        type,
        this.roundToTwo(medianBuy),
        this.roundToTwo(medianSell),
        latestTimestamp,
        `${chosenSourceQuote.source}+consensus`,
      ),
      sourceCount: filtered.length,
    };
  }

  private async validateOfficialAgainstBcra(
    consensusQuotes: DollarQuote[],
    sourceCountByType: Map<DollarType, number>,
  ): Promise<void> {
    const officialConsensus = consensusQuotes.find(
      (quote) => quote.type === DollarType.OFICIAL,
    );

    if (!officialConsensus) {
      return;
    }

    const officialSourceCount = sourceCountByType.get(DollarType.OFICIAL) ?? 0;
    if (officialSourceCount < 2) {
      return;
    }

    try {
      const bcraReference = await this.bcraClient.fetchOfficialReference();
      if (bcraReference <= 0) {
        return;
      }

      const consensusMidPrice =
        (officialConsensus.buyPrice + officialConsensus.sellPrice) / 2;
      if (consensusMidPrice <= 0) {
        return;
      }

      const deviationPct =
        (Math.abs(consensusMidPrice - bcraReference) / bcraReference) * 100;

      if (deviationPct > this.officialBcraThresholdPct) {
        this.logger.warn(
          `Official dollar cross-validation deviation ${deviationPct.toFixed(2)}% exceeds ${this.officialBcraThresholdPct}% (consensus=${consensusMidPrice.toFixed(2)}, bcra=${bcraReference.toFixed(2)})`,
        );
      }
    } catch {
      const isProduction =
        this.configService.get<string>('NODE_ENV') === 'production';

      if (isProduction) {
        this.logger.warn('BCRA official reference validation failed');
      } else {
        this.logger.debug('BCRA official reference validation failed');
      }
    }
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((left, right) => left - right);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1]! + sorted[mid]!) / 2;
    }

    return sorted[mid]!;
  }

  private isWithinDeviation(value: number, target: number): boolean {
    if (target <= 0) {
      return true;
    }

    const deviationPct = (Math.abs(value - target) / target) * 100;
    return deviationPct <= this.consensusMaxDeviationPct;
  }

  private roundToTwo(value: number): number {
    return Number(value.toFixed(2));
  }

  private parseDate(input?: string | number): Date {
    if (typeof input === 'number' && Number.isFinite(input)) {
      const parsed = new Date(input * 1000);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    if (typeof input === 'string' && input.length > 0) {
      const parsed = new Date(input);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return new Date();
  }

  private parseNumber(value: number | string | undefined): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
      const normalized = value.includes(',')
        ? value.replace(/\./g, '').replace(',', '.').trim()
        : value.trim();
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  private createQuote(
    type: DollarType,
    buyPrice: number,
    sellPrice: number,
    timestamp: Date,
    source: string,
  ): DollarQuote | null {
    if (
      !Number.isFinite(buyPrice) ||
      !Number.isFinite(sellPrice) ||
      buyPrice <= 0 ||
      sellPrice <= 0
    ) {
      return null;
    }

    return new DollarQuote(type, buyPrice, sellPrice, timestamp, source);
  }

  private async fetchFromDolarApi(): Promise<DollarQuote[]> {
    const response = await this.providerHealthTracker.track(
      'dolarapi.com',
      '/dolares',
      () =>
        axios.get<DolarApiResponse[]>(`${this.dolarApiUrl}/dolares`, {
          timeout: 5000,
        }),
    );

    return response.data
      .map((item) => {
        const type = this.toDolarApiType(item.casa);
        if (!type) {
          return null;
        }

        return this.createQuote(
          type,
          this.parseNumber(item.compra),
          this.parseNumber(item.venta),
          this.parseDate(item.fechaActualizacion),
          'dolarapi.com',
        );
      })
      .filter((quote): quote is DollarQuote => quote !== null);
  }

  private async fetchFromBluelytics(): Promise<DollarQuote[]> {
    const response = await this.providerHealthTracker.track(
      'bluelytics.com',
      '/latest',
      () =>
        axios.get<BluelyticsResponse>(`${this.bluelyticsUrl}/latest`, {
          timeout: 5000,
        }),
    );

    const timestamp = this.parseDate(response.data.last_update);
    const quotes: Array<DollarQuote | null> = [
      this.createQuote(
        DollarType.OFICIAL,
        this.parseNumber(response.data.oficial?.value_buy),
        this.parseNumber(response.data.oficial?.value_sell),
        timestamp,
        'bluelytics.com',
      ),
      this.createQuote(
        DollarType.BLUE,
        this.parseNumber(response.data.blue?.value_buy),
        this.parseNumber(response.data.blue?.value_sell),
        timestamp,
        'bluelytics.com',
      ),
    ];

    return quotes.filter((quote): quote is DollarQuote => quote !== null);
  }

  private async fetchFromCriptoYa(): Promise<DollarQuote[]> {
    const response = await this.providerHealthTracker.track(
      'criptoya.com',
      '/dolar',
      () =>
        axios.get<CriptoYaResponse>(`${this.criptoYaUrl}/dolar`, {
          timeout: 5000,
        }),
    );

    const oficialTs = this.parseDate(response.data.oficial?.timestamp);
    const blueTs = this.parseDate(response.data.blue?.timestamp);
    const tarjetaTs = this.parseDate(response.data.tarjeta?.timestamp);
    const criptoTs = this.parseDate(response.data.cripto?.usdt?.timestamp);
    const mepValue = response.data.mep?.al30?.ci ?? response.data.mep?.gd30?.ci;
    const cclValue = response.data.ccl?.al30?.ci ?? response.data.ccl?.gd30?.ci;

    const quotes: Array<DollarQuote | null> = [
      this.createQuote(
        DollarType.OFICIAL,
        this.parseNumber(response.data.oficial?.bid),
        this.parseNumber(response.data.oficial?.ask),
        oficialTs,
        'criptoya.com',
      ),
      this.createQuote(
        DollarType.BLUE,
        this.parseNumber(response.data.blue?.bid),
        this.parseNumber(response.data.blue?.ask),
        blueTs,
        'criptoya.com',
      ),
      this.createQuote(
        DollarType.TARJETA,
        this.parseNumber(response.data.tarjeta?.price),
        this.parseNumber(response.data.tarjeta?.price),
        tarjetaTs,
        'criptoya.com',
      ),
      this.createQuote(
        DollarType.CRIPTO,
        this.parseNumber(response.data.cripto?.usdt?.bid),
        this.parseNumber(response.data.cripto?.usdt?.ask),
        criptoTs,
        'criptoya.com',
      ),
      this.createQuote(
        DollarType.MEP,
        this.parseNumber(mepValue?.price),
        this.parseNumber(mepValue?.price),
        this.parseDate(mepValue?.timestamp),
        'criptoya.com',
      ),
      this.createQuote(
        DollarType.CCL,
        this.parseNumber(cclValue?.price),
        this.parseNumber(cclValue?.price),
        this.parseDate(cclValue?.timestamp),
        'criptoya.com',
      ),
    ];

    return quotes.filter((quote): quote is DollarQuote => quote !== null);
  }

  private toDolarApiType(casa: string): DollarType | null {
    switch (casa.toLowerCase()) {
      case 'oficial':
        return DollarType.OFICIAL;
      case 'blue':
        return DollarType.BLUE;
      case 'bolsa':
        return DollarType.MEP;
      case 'contadoconliqui':
        return DollarType.CCL;
      case 'tarjeta':
        return DollarType.TARJETA;
      case 'cripto':
        return DollarType.CRIPTO;
      default:
        return null;
    }
  }
}
