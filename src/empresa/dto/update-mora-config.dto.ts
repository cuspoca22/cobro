import { IsBoolean, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { BaseCalculoMora } from '../interfaces';

export class UpdateMoraConfigDto {
  @IsOptional()
  @IsBoolean()
  cobraMora?: boolean;

  @IsOptional()
  @IsBoolean()
  permiteMoraVoluntaria?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  porcentajeMora?: number;

  @IsOptional()
  @IsEnum(BaseCalculoMora)
  baseCalculoMora?: BaseCalculoMora;
}
