import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @MinLength(2)
  nombre: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(7)
  phone: string;

  @IsString()
  @MinLength(2)
  empresaNombre: string;

  /** Honeypot: bots lo llenan; humanos lo dejan vacío. */
  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  origen?: string;
}
