import { IsArray, IsBoolean, IsMongoId, IsNumber, IsOptional, IsString, MinLength } from "class-validator";
import { IsHttpsImageUrl } from "src/common/validators/is-https-image-url.validator";

export class CreateClienteDto {

   @IsString()
   @IsOptional()
   id?: string;
   
   @IsBoolean()
   @IsOptional()
   status?: boolean;

   @IsString()
   @MinLength(6)
   dpi: string;

   @IsString()
   @MinLength(5)
   nombre: string;

   @IsString()
   @MinLength(4)
   alias: string; 

   @IsString()
   @MinLength(4)
   ciudad: string;

   @IsString()
   direccion: string;

   @IsArray()
   @IsNumber({}, { each: true })
   @IsOptional()
   ubication?: number[];
   
   @IsString()
   telefono: string;
   
   @IsString()
   @IsOptional()
   img?: string;
   
   @IsMongoId()
   ruta: string; 

   @IsMongoId({
      each: true
   })
   @IsArray()
   @IsOptional()
   creditos?: string[];

   @IsOptional()
   @IsHttpsImageUrl()
   document_image?: string;

   @IsOptional()
   @IsHttpsImageUrl()
   business_image?: string;

   @IsOptional()
   @IsHttpsImageUrl()
   house_image?: string;

   @IsNumber()
   @IsOptional()
   turno: number;
}
