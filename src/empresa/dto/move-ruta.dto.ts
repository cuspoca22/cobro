import { IsMongoId } from 'class-validator';

export class MoveRutaDto {
  @IsMongoId()
  rutaId: string;

  @IsMongoId()
  fromEmpresaId: string;

  @IsMongoId()
  toEmpresaId: string;
}
