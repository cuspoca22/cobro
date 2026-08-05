import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { ConvertLeadDto, CreateLeadDto, UpdateLeadDto } from './dto';
import { LeadsService } from './leads.service';
import { LeadStatus } from './schemas/lead.schema';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }

  @Auth(ValidRoles.superAdmin)
  @Get()
  findAll(@Query('status') status?: LeadStatus) {
    return this.leadsService.findAll(status);
  }

  @Auth(ValidRoles.superAdmin)
  @Get(':id')
  findOne(@Param('id', ParseMongoIdPipe) id: string) {
    return this.leadsService.findOne(id);
  }

  @Auth(ValidRoles.superAdmin)
  @Patch(':id')
  update(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadsService.update(id, dto);
  }

  @Auth(ValidRoles.superAdmin)
  @Post(':id/convert')
  convert(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: ConvertLeadDto,
    @GetUser() user: any,
  ) {
    return this.leadsService.convert(id, dto, user);
  }

  @Auth(ValidRoles.superAdmin)
  @Delete(':id')
  remove(@Param('id', ParseMongoIdPipe) id: string) {
    return this.leadsService.remove(id);
  }
}
