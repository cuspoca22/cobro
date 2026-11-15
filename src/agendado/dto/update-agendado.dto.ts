import { Type } from 'class-transformer';
import { IsOptional, Matches, ValidateNested } from 'class-validator';
import { CondicionesAgendadoDto } from './condiciones-agendado.dto';

export class UpdateAgendadoDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaVisita?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  horaRecordatorio?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CondicionesAgendadoDto)
  condiciones?: CondicionesAgendadoDto;
}
