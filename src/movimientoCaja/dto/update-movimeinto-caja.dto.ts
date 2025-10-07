import { PartialType } from "@nestjs/mapped-types";
import { CreateMovimientoCajaDto } from "./";
import { IsMongoId, IsOptional } from "class-validator";

export class UpdateMovimientoCajaDto extends PartialType(CreateMovimientoCajaDto) {

  @IsMongoId()
  @IsOptional()
  id: string;
}