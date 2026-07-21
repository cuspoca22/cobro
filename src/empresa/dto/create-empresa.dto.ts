import { IsArray, IsBoolean, IsEmail, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { BaseCalculoMora } from "../interfaces";

export class CreateEmpresaDto {

   @IsString()
   name: string;

   @IsEmail()
   @IsOptional()
   email?: string;

   @IsString()
   @IsOptional()
   phone?: string;

   @IsNumber()
   @IsOptional()
   dayOfPay?: number;

   @IsString()
   country: string;

   @IsMongoId()
   @IsOptional()
   owner: string;

   @IsMongoId({
      each: true
   })
   @IsArray()
   @IsOptional()
   employes: string[]

   @IsMongoId({
      each: true
   })
   @IsArray()
   @IsOptional()
   rutas: string[]

   @IsBoolean()
   @IsOptional()
   isSubscriptionPaid: boolean;

   @IsBoolean()
   @IsOptional()
   cobraMora?: boolean;

   @IsBoolean()
   @IsOptional()
   permiteMoraVoluntaria?: boolean;

   @IsNumber()
   @IsOptional()
   @Min(0)
   porcentajeMora?: number;

   @IsEnum(BaseCalculoMora)
   @IsOptional()
   baseCalculoMora?: BaseCalculoMora;

}
