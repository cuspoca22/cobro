import { IsBoolean, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Min, ValidateIf } from "class-validator";
import { FrecuenciaCobro } from "../interfaces";

export class CreateCreditoDto {

   @IsNumber()
   valor_credito: number;

   @IsNumber()
   @IsOptional()
   total_cuotas?: number

   @IsMongoId()
   clienteId: string;

   @IsMongoId()
   rutaId: string;

   @IsString()
   @IsOptional()
   observaciones?: string;

   @IsNumber()
   @IsOptional()
   turno?: number = 1;

   @IsString()
   @IsEnum(FrecuenciaCobro)
   frecuencia_cobro: FrecuenciaCobro;

   // --- Propiedades para el modo automático o manual ---

   // Interés: Requerido si no se proporciona valor_cuota
   @IsNumber()
   @Min(0)
   @IsOptional() // Hacemos opcional aquí porque se calculará si falta
   @ValidateIf(o => o.valor_cuota === undefined || o.valor_cuota === null) // Requerido si no hay valor_cuota
   interes?: number;

   // Valor de Cuota: Requerido si no se proporciona interés
   @IsNumber()
   @Min(0)
   @IsOptional() // Hacemos opcional aquí porque se calculará si falta
   @ValidateIf(o => o.interes === undefined || o.interes === null) // Requerido si no hay interés
   valor_cuota?: number;

   @IsBoolean()
   se_cobran_domingos: boolean;
}
