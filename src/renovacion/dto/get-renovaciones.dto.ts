import { IsMongoId, IsOptional, IsString } from "class-validator";
import { Transform } from "class-transformer";

export class GetRenovacionesDto {
  @IsString()
  fecha: string;

  @IsMongoId()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  rutaId?: string;
}
