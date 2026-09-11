import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReordenarClienteItemDto {
  @IsMongoId()
  id: string;

  @IsNumber()
  @Min(1)
  turno: number;
}

export class ReordenarClientesDto {
  @IsMongoId()
  rutaId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReordenarClienteItemDto)
  items: ReordenarClienteItemDto[];
}
