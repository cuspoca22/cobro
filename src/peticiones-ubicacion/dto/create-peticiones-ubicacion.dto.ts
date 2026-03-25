import { IsArray, IsMongoId, IsNumber, IsOptional, IsIn } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreatePeticionesUbicacionDto {

  @ApiProperty({
    description: 'Coordenadas antiguas [longitud, latitud]',
    type: [Number],
    example: [-90.5123, 14.6349],
    required: false,
  })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  old_ubicacion?: number[];

  @ApiProperty({
    description: 'Coordenadas nuevas [longitud, latitud]',
    type: [Number],
    example: [-90.5125, 14.6351],
    required: true,
  })
  @IsArray()
  @IsNumber({}, { each: true })
  new_ubicacion: number[];

  @ApiProperty({
    description: 'ID del cliente (MongoDB ObjectId)',
    example: '507f1f77bcf86cd799439011',
    required: true,
  })
  @IsMongoId()
  id_cliente: string;

  @ApiProperty({
    description: 'ID del usuario que crea la solicitud (opcional, se toma del token)',
    example: '507f1f77bcf86cd799439012',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  id_usuario?: string;

  @ApiProperty({
    description: 'ID de la ruta (opcional, se toma del usuario si es cobrador)',
    example: '507f1f77bcf86cd799439013',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  id_ruta?: string;

  @ApiProperty({
    description: 'Estado inicial de la solicitud',
    enum: ['pendiente', 'aceptada', 'rechazada'],
    example: 'pendiente',
    required: false,
    default: 'pendiente',
  })
  @IsOptional()
  @IsIn(['pendiente', 'aceptada', 'rechazada'])
  estado?: string;

}
