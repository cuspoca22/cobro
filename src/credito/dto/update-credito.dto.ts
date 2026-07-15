import { PartialType } from '@nestjs/mapped-types';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { CreateCreditoDto } from './create-credito.dto';

export class UpdateCreditoDto extends PartialType(CreateCreditoDto) {
  /** Orden de cobro del cliente en la ruta (fuente de verdad: Cliente.turno). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  turno?: number;
}
