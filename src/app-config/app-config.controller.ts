import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { Auth } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { AppConfigService } from './app-config.service';
import { UpdateAppConfigDto } from './dto';

@Controller('app-config')
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  /** Público: la app cobrador consulta al arrancar/reanudar. */
  @Get()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  getPublic() {
    return this.appConfigService.getOrCreate();
  }

  @Auth(ValidRoles.superAdmin)
  @Get('admin')
  getAdmin() {
    return this.appConfigService.getOrCreate();
  }

  @Auth(ValidRoles.superAdmin)
  @Patch()
  update(@Body() dto: UpdateAppConfigDto) {
    return this.appConfigService.update(dto);
  }
}
