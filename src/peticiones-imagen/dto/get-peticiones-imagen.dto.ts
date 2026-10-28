import { IsDateString, IsIn, IsMongoId, IsOptional } from 'class-validator';

export class GetPeticionesImagenDto {
  @IsOptional()
  @IsIn(['pendiente', 'aceptada', 'rechazada'])
  estado?: string;

  @IsOptional()
  @IsMongoId()
  id_cliente?: string;

  @IsOptional()
  @IsMongoId()
  id_ruta?: string;

  @IsOptional()
  @IsMongoId()
  id_empresa?: string;

  @IsOptional()
  @IsDateString()
  fecha_desde?: string;

  @IsOptional()
  @IsDateString()
  fecha_hasta?: string;
}
