import { IsDate, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { CategoriaGasto, SubTipo, TipoMovimiento } from "../interfaces";

export class CreateMovimientoCajaDto {

  @IsMongoId()
  @IsOptional()
  caja?: string;

  @IsMongoId()
  rutaId: string;

  @IsString()
  @IsOptional()
  concepto?: string;

  @IsOptional()
  @IsString()
  comentario?: string;

  @IsNumber()
  monto: number;

  /** Monto de mora a cobrar dentro del mismo pago (desglose). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  montoMora?: number;

  @IsOptional()
  @IsEnum(CategoriaGasto)
  categoriaGasto?: CategoriaGasto;

  @IsEnum(TipoMovimiento)
  @IsOptional()
  tipoMovimiento?: TipoMovimiento

  @IsEnum(SubTipo)
  @IsOptional()
  subTipo?: SubTipo;

  @IsOptional()
  @IsDate()
  createdAt?: Date;

  @IsOptional()
  @IsDate()
  updatedAt?: Date;

  @IsMongoId()
  @IsOptional()
  creditoId?: string;

  @IsMongoId()
  @IsOptional()
  clienteId?: string;

}
