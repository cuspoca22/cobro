import { IsBoolean } from 'class-validator';

export class UpdatePeticionesImagenDto {
  @IsBoolean()
  esAprobado: boolean;
}
