import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class ConvertLeadDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  country?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfPay?: number;
}
