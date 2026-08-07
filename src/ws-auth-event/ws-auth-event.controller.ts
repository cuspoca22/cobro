import { Controller, Get, Query } from '@nestjs/common';

import { Auth } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { ListWsAuthEventsDto } from './dto/list-ws-auth-events.dto';
import { WsAuthEventService } from './ws-auth-event.service';

@Controller('ws-auth-events')
export class WsAuthEventController {
  constructor(private readonly wsAuthEventService: WsAuthEventService) {}

  @Auth(ValidRoles.superAdmin)
  @Get()
  findAll(@Query() query: ListWsAuthEventsDto) {
    return this.wsAuthEventService.findAll(query);
  }
}
