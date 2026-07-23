import { IsNumber, IsOptional, Min } from 'class-validator';

/** Campos editables por SUPERADMIN (no recalcula cobro/préstamo derivados). */
export class UpdateCajaDto {
  @IsOptional()
  @IsNumber()
  base?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  inversion?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  retiro?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gasto?: number;
}
