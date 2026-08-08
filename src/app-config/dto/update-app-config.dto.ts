import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateAppConfigDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minVersionCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  latestVersionCode?: number;

  @IsOptional()
  @IsBoolean()
  forceUpdate?: boolean;

  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  storeUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
