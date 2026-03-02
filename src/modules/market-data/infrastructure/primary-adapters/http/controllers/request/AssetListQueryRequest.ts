import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AssetType } from '../../../../../domain/enums/AssetType';

export class AssetListQueryRequest {
  @ApiPropertyOptional({ enum: AssetType })
  @IsOptional()
  @IsEnum(AssetType)
  public readonly type?: AssetType;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  public readonly limit?: number;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  public readonly page?: number;

  @ApiPropertyOptional({ example: false })
  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') {
      return true;
    }

    if (
      value === false ||
      value === 'false' ||
      value === 0 ||
      value === '0' ||
      value == null
    ) {
      return false;
    }

    return value;
  })
  @IsOptional()
  @IsBoolean()
  public readonly includeInactive?: boolean;
}
