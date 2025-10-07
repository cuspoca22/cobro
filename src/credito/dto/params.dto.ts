import { IsBoolean, IsMongoId, IsOptional } from "class-validator";

export class ParamsDto {

  @IsBoolean()
  @IsOptional()
  status: boolean;

  @IsMongoId()
  @IsOptional()
  ruta: string;

  @IsMongoId()
  @IsOptional()
  cliente: string;

}