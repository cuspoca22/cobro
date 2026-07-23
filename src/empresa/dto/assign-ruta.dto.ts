import { IsMongoId } from 'class-validator';

export class AssignRutaDto {
  @IsMongoId()
  rutaId: string;

  @IsMongoId()
  empresaId: string;
}
