import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  token: string;

  @IsIn(['android', 'ios', 'web'])
  platform: 'android' | 'ios' | 'web';

  @IsIn(['cobrador', 'admin'])
  app: 'cobrador' | 'admin';
}

export class RevokeDeviceTokenDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  token: string;
}
