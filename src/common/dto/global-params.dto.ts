import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsMongoId, IsOptional, IsString, Validate } from "class-validator";

export class GlobalParams {

   @IsMongoId()
   @IsOptional()
   ruta?: string;

   @IsMongoId()
   @IsOptional()
   caja?: string;

   @IsMongoId()
   @IsOptional()
   userId?: string;

   @IsString()
   @IsOptional()
   fecha?: string;

   @IsString()
   @IsOptional()
   fechaInicio?: string;

   @IsString()
   @IsOptional()
   fechaFin?: string;

   @IsString()
   @IsOptional()
   status?: string;

}