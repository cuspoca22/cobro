import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsMongoId, IsOptional } from 'class-validator';

export class ReporteCarteraQueryDto {
  @ApiPropertyOptional({
    description: 'ID de la ruta. Si se omite, se incluyen todas las rutas de la empresa',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  rutaId?: string;
}
