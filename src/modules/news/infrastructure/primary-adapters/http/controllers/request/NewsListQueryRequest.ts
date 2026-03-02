import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class NewsListQueryRequest {
  @ApiPropertyOptional({
    description: 'Ticker filter (e.g. GGAL)',
    example: 'GGAL',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,10}$/)
  @IsOptional()
  ticker?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 20;
}
