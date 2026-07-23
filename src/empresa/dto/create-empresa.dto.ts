import { IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
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

   @IsInt()
   @IsOptional()
   @Min(1)
   @Max(31)
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
   isSubscriptionPaid?: boolean;

   @IsInt()
   @IsOptional()
   @Min(0)
   @Max(31)
   subscriptionGraceDays?: number;

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
