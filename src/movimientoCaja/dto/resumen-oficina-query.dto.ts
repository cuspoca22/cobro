import { IsMongoId, IsOptional, IsString } from 'class-validator';

/**
 * DTO para los query params del endpoint GET /movimiento-caja/oficina/resumen.
 * Valida que rutaId sea un MongoId válido y fecha sea un string opcional (YYYY-MM-DD).
 */
export class ResumenOficinaQueryDto {
  @IsMongoId()
  rutaId: string;

  /** Fecha en formato YYYY-MM-DD. Si no se envía, se toma el día actual según la timeZone de la ruta. */
  @IsOptional()
  @IsString()
  fecha?: string;
}
