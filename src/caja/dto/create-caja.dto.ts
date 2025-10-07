import { IsDate, IsMongoId, IsNumber, IsOptional } from "class-validator";

export class CreateCajaDto {

   @IsOptional()
   @IsDate()
   fecha?: Date;

   @IsOptional()
   @IsNumber()
   base: number;

   @IsOptional()
   @IsNumber()
   inversion: number;

   @IsOptional()
   @IsNumber()
   retiro: number;

   @IsOptional()
   @IsNumber()
   prestamo: number;

   @IsOptional()
   @IsNumber()
   total_clientes: number;

   @IsOptional()
   @IsNumber()
   renovaciones: number;

   @IsOptional()
   @IsNumber()
   gasto: number;

   @IsOptional()
   @IsNumber()
   caja_final: number;

   @IsOptional()
   @IsNumber()
   cobro: number;

   @IsOptional()
   @IsNumber()
   extra: number;

   @IsOptional()
   @IsNumber()
   clientes_pendientes: number;

   @IsOptional()
   @IsNumber()
   pretendido: number;  

   @IsMongoId()
   ruta: string; 
   
}
