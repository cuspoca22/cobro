import { Type } from 'class-transformer';
import { IsMongoId, IsOptional, Matches, ValidateNested } from 'class-validator';
import { CondicionesAgendadoDto } from './condiciones-agendado.dto';

export class CreateAgendadoDto {
  @IsMongoId()
  clienteId: string;

  /** Si no llega, el servicio usa la ruta del cliente. */
  @IsOptional()
  @IsMongoId()
  rutaId?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaVisita: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  horaRecordatorio: string;

  @ValidateNested()
  @Type(() => CondicionesAgendadoDto)
  condiciones: CondicionesAgendadoDto;
}
