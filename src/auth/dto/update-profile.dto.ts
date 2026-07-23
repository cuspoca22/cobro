import { IsOptional, IsString, MinLength } from 'class-validator';

/** Auto-edición de perfil: solo datos de acceso personales. */
export class UpdateProfileDto {
  @IsString()
  @MinLength(3)
  @IsOptional()
  nombre?: string;

  @IsString()
  @MinLength(3)
  @IsOptional()
  username?: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;
}
