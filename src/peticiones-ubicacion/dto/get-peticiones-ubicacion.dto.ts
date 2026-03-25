import { IsOptional, IsIn, IsMongoId, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetPeticionesUbicacionDto {
  @ApiProperty({
    description: 'Estado de la solicitud',
    enum: ['pendiente', 'aceptada', 'rechazada'],
    required: false,
  })
  @IsOptional()
  @IsIn(['pendiente', 'aceptada', 'rechazada'])
  estado?: string;

  @ApiProperty({
    description: 'ID del cliente (MongoDB ObjectId)',
    example: '507f1f77bcf86cd799439011',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  id_cliente?: string;

  @ApiProperty({
    description: 'ID de la ruta (MongoDB ObjectId)',
    example: '507f1f77bcf86cd799439012',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  id_ruta?: string;

  @ApiProperty({
    description: 'ID de la empresa (MongoDB ObjectId)',
    example: '507f1f77bcf86cd799439013',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  id_empresa?: string;

  @ApiProperty({
    description: 'Fecha desde (formato ISO 8601)',
    example: '2024-01-01T00:00:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  fecha_desde?: string;

  @ApiProperty({
    description: 'Fecha hasta (formato ISO 8601)',
    example: '2024-12-31T23:59:59.999Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  fecha_hasta?: string;
}