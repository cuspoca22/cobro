import { IsEnum, IsOptional } from 'class-validator';
import { AccessSuspendedReason } from '../interfaces/subscription-status';

export class SuspendEmpresaDto {
  @IsOptional()
  @IsEnum(AccessSuspendedReason)
  reason?: AccessSuspendedReason;
}
