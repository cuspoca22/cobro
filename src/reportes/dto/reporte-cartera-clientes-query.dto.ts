import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { ClasificacionCliente } from '../../credito/interfaces/clasificacion-cliente.enum';

export class ReporteCarteraClientesQueryDto {
  @ApiPropertyOptional({
    description: 'ID de la ruta. Si se omite, se incluyen todas las rutas de la empresa',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  rutaId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por clasificación recalculada del crédito',
    enum: ClasificacionCliente,
    example: ClasificacionCliente.MALO,
  })
  @IsEnum(ClasificacionCliente)
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  clasificacion?: ClasificacionCliente;
}
