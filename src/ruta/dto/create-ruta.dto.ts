import { IsString, IsOptional, IsBoolean, IsMongoId } from "class-validator";

export class CreateRutaDto {

   @IsString()
   nombre: string;
  
   @IsString()
   ciudad: string;
  
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

   @IsString()
   timeZone: string;

}
