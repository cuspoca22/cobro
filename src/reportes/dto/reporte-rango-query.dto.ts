import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsMongoId, IsOptional, IsString, Matches } from 'class-validator';

export class ReporteRangoQueryDto {
  @ApiProperty({
    description: 'Fecha de inicio del periodo (inclusive)',
    example: '2026-06-01',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaInicio debe tener formato YYYY-MM-DD' })
  fechaInicio: string;

  @ApiProperty({
    description: 'Fecha de fin del periodo (inclusive)',
    example: '2026-06-30',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaFin debe tener formato YYYY-MM-DD' })
  fechaFin: string;

  @ApiPropertyOptional({
    description: 'ID de la ruta. Si se omite, se incluyen todas las rutas de la empresa',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  rutaId?: string;
}
