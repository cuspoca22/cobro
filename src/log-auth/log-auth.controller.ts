import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { LogAuthService } from './log-auth.service';
import { CreateLogAuthDto } from './dto/create-log-auth.dto';
import { UpdateLogAuthDto } from './dto/update-log-auth.dto';

@Controller('log-auth')
export class LogAuthController {
  constructor(private readonly logAuthService: LogAuthService) {}

  @Post()
  create(@Body() createLogAuthDto: CreateLogAuthDto) {
    return this.logAuthService.create(createLogAuthDto);
  }

  @Get()
  findAll() {
    return this.logAuthService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.logAuthService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateLogAuthDto: UpdateLogAuthDto) {
    return this.logAuthService.update(+id, updateLogAuthDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.logAuthService.remove(+id);
  }
}
