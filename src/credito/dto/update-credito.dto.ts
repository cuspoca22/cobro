import { PartialType } from '@nestjs/mapped-types';
import { CreateCreditoDto } from './create-credito.dto';

export class UpdateCreditoDto extends PartialType(CreateCreditoDto) {}
