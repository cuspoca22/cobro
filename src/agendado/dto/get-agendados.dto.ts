import { IsMongoId, IsOptional } from 'class-validator';

export class GetAgendadosDto {
  @IsOptional()
  @IsMongoId()
  rutaId?: string;
}
