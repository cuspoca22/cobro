import { IsDate, IsMongoId, IsNumber, IsOptional } from "class-validator";

/**
 * DTO para la creación de una nueva Caja.
 * Valida los datos necesarios para registrar un corte de caja.
 * @class CreateCajaDto
 */
export class CreateCajaDto {

   @IsDate({
      message: 'La fecha debe ser una fecha válida'
   })
   fecha: Date;

   @IsNumber()
   base: number;

   @IsOptional()
   @IsNumber()
   inversion?: number;

   @IsOptional()
   @IsNumber()
   retiro?: number;

   @IsOptional()
   @IsNumber()
   prestamo?: number;

   @IsOptional()
   @IsNumber()
   total_clientes?: number;

   @IsOptional()
   @IsNumber()
   renovaciones?: number;

   @IsOptional()
   @IsNumber()
   gasto?: number;

   @IsOptional()
   @IsNumber()
   caja_final?: number;

   @IsOptional()
   @IsNumber()
   cobro?: number;

   @IsOptional()
   @IsNumber()
   clientes_pendientes?: number;

   @IsOptional()
   @IsNumber()
   pretendido?: number;

   @IsMongoId()
   rutaId: string;
}
