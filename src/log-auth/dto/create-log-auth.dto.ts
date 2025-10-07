import { IsBoolean, IsDate, IsOptional, IsString } from "class-validator";

export class CreateLogAuthDto {
  @IsString()
  @IsOptional()
  user: string;

  @IsBoolean()
  isSuccessful: boolean;

  @IsDate()
  @IsOptional()
  date: Date;

  @IsString()
  @IsOptional()
  ipAddress: string;

  @IsString()
  @IsOptional() 
  userAgent: string;

  @IsString()
  reason: string; 
}
