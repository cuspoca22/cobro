import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { AnnouncementService } from './announcement.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Controller('announcements')
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Auth(ValidRoles.superAdmin)
  @Post()
  create(@GetUser() user: any, @Body() dto: CreateAnnouncementDto) {
    return this.announcementService.create(dto, user.id);
  }

  @Auth(ValidRoles.superAdmin)
  @Get()
  findAll() {
    return this.announcementService.findAll();
  }

  @Auth(ValidRoles.admin, ValidRoles.supervisor)
  @Get('me')
  findMine(@GetUser() user: any) {
    return this.announcementService.findMine(user);
  }

  @Auth(ValidRoles.superAdmin)
  @Get(':id')
  findOne(@Param('id', ParseMongoIdPipe) id: string) {
    return this.announcementService.findOne(id);
  }

  @Auth(ValidRoles.superAdmin)
  @Patch(':id')
  update(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcementService.update(id, dto);
  }

  @Auth(ValidRoles.superAdmin)
  @Post(':id/deactivate')
  deactivate(@Param('id', ParseMongoIdPipe) id: string) {
    return this.announcementService.deactivate(id);
  }

  @Auth(ValidRoles.superAdmin)
  @Delete(':id')
  remove(@Param('id', ParseMongoIdPipe) id: string) {
    return this.announcementService.remove(id);
  }

  @Auth(ValidRoles.admin, ValidRoles.supervisor)
  @Post(':id/dismiss')
  dismiss(@GetUser() user: any, @Param('id', ParseMongoIdPipe) id: string) {
    return this.announcementService.dismiss(id, user.id);
  }

  @Auth(ValidRoles.admin, ValidRoles.supervisor)
  @Post(':id/ack')
  acknowledge(@GetUser() user: any, @Param('id', ParseMongoIdPipe) id: string) {
    return this.announcementService.acknowledge(id, user.id);
  }
}
