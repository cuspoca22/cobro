import { PartialType } from '@nestjs/mapped-types';
import { CreatePeticionesUbicacionDto } from './create-peticiones-ubicacion.dto';
import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePeticionesUbicacionDto extends PartialType(CreatePeticionesUbicacionDto) {
  @ApiProperty({
    description: 'Indica si la solicitud fue aprobada (actualiza ubicación del cliente)',
    example: false,
    default: false,
  })
  @IsBoolean()
  esAprobado: boolean;
}
