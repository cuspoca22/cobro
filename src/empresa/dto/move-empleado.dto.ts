import { IsMongoId, IsOptional } from 'class-validator';

export class MoveEmpleadoDto {
  @IsMongoId()
  empleadoId: string;

  @IsMongoId()
  fromEmpresaId: string;

  @IsMongoId()
  toEmpresaId: string;

  @IsOptional()
  @IsMongoId()
  rutaId?: string;
}
