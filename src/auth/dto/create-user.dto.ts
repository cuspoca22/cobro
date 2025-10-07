import { IsString, MinLength, IsMongoId, IsOptional, IsArray, IsEnum, IsBoolean } from "class-validator";

export class CreateUserDto {

   @IsBoolean()
   @IsOptional()
   estado?: boolean;

   @IsString()
   @MinLength(3)
   username: string;

   @IsString()
   @MinLength(3)
   nombre: string;

   @IsString()
   @MinLength(4)
   password: string;

   @IsString()
   @IsEnum(['ADMIN', 'SUPERADMIN', 'COBRADOR', 'SUPERVISOR', 'CLIENTE'])
   rol: string;

   @IsMongoId()
   @IsOptional()
   ruta?: string;

   @IsMongoId({each: true})
   @IsArray()
   @IsOptional()
   rutas?: string[];

   @IsMongoId()
   @IsOptional()
   empresa?: string;

   @IsBoolean()
   @IsOptional()
   close_ruta: boolean;
}