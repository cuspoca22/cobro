import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { FrecuenciaCobro } from 'src/credito/interfaces';

export class CondicionesAgendadoDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  valor_credito: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  total_cuotas: number;

  @IsIn([FrecuenciaCobro.DIARIO, FrecuenciaCobro.SEMANAL])
  frecuencia_cobro: FrecuenciaCobro;

  @IsIn(['automatico', 'manual'])
  modo: 'automatico' | 'manual';

  @ValidateIf((o) => o.modo === 'automatico')
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interes?: number;

  @ValidateIf((o) => o.modo === 'manual')
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  valor_cuota?: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
