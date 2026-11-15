import { Body, Controller, Delete, Post } from '@nestjs/common';
import { Auth, GetUser } from 'src/auth/decorators';
import { GetUserDto } from 'src/auth/dto';
import { ValidRoles } from 'src/auth/interfaces';
import { RegisterDeviceTokenDto, RevokeDeviceTokenDto } from './dto/register-device-token.dto';
import { DeviceTokenService } from './device-token.service';

@Controller('notificaciones')
export class DeviceTokenController {
  constructor(private readonly deviceTokens: DeviceTokenService) {}

  @Post('device-token')
  @Auth(
    ValidRoles.cobrador,
    ValidRoles.admin,
    ValidRoles.supervisor,
    ValidRoles.superAdmin,
  )
  register(@GetUser() user: GetUserDto, @Body() dto: RegisterDeviceTokenDto) {
    return this.deviceTokens.register(user.id, dto);
  }

  @Delete('device-token')
  @Auth(
    ValidRoles.cobrador,
    ValidRoles.admin,
    ValidRoles.supervisor,
    ValidRoles.superAdmin,
  )
  revoke(@GetUser() user: GetUserDto, @Body() dto: RevokeDeviceTokenDto) {
    return this.deviceTokens.revoke(user.id, dto);
  }
}
