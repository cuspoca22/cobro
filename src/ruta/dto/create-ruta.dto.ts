import { IsString, IsNumber, IsOptional, IsBoolean, IsMongoId } from "class-validator";

export class CreateRutaDto {

   @IsString()
   nombre: string;

   @IsNumber()
   @IsOptional()
   clientes?: number;
  
   @IsNumber()
   @IsOptional()
   clientes_activos?: number; 
  
   @IsNumber()
   @IsOptional()
   gastos?: number;
   
   @IsNumber()
   @IsOptional()
   inversiones?: number;
  
   @IsNumber()
   @IsOptional()
   retiros?: number;
  
   @IsString()
   ciudad: string;
  
   @IsNumber()
   @IsOptional()
   cartera?: number;
  
   @IsNumber()
   @IsOptional()
   total_cobrado?: number;
  
   @IsNumber()
   @IsOptional()
   total_prestado?: number;
  
   @IsBoolean()
   @IsOptional()
   status?: boolean;

   @IsBoolean()
   @IsOptional()
   isLocked?: boolean;
  
   @IsMongoId()
   @IsOptional()
   caja_actual?: string;
  
   @IsMongoId()
   @IsOptional()
   ultima_caja?: string;
  
   @IsMongoId()
   @IsOptional()
   empresa?: string;

   @IsString()
   pais: string;

   @IsBoolean()
   @IsOptional()
   autoOpen: boolean = true;

}
