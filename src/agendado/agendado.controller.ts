import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Auth, GetUser } from 'src/auth/decorators';
import { GetUserDto } from 'src/auth/dto';
import { ValidRoles } from 'src/auth/interfaces';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { RutaOwnership } from 'src/common/ownership/ruta-ownership.decorator';
import { AgendadoService } from './agendado.service';
import { CreateAgendadoDto } from './dto/create-agendado.dto';
import { GetAgendadosDto } from './dto/get-agendados.dto';
import { UpdateAgendadoDto } from './dto/update-agendado.dto';

@Auth()
@Controller('agendados')
export class AgendadoController {
  constructor(private readonly agendadoService: AgendadoService) {}

  @Get()
  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor, ValidRoles.cobrador)
  list(@GetUser() user: GetUserDto, @Query() query: GetAgendadosDto) {
    return this.agendadoService.list(user, query);
  }

  @Post()
  @Auth(ValidRoles.cobrador)
  @RutaOwnership({
    rutaId: { in: 'body', key: 'rutaId' },
    clienteId: { in: 'body', key: 'clienteId' },
  })
  create(@GetUser() user: GetUserDto, @Body() dto: CreateAgendadoDto) {
    return this.agendadoService.create(user, dto);
  }

  @Patch(':id')
  @Auth(ValidRoles.cobrador)
  update(
    @GetUser() user: GetUserDto,
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateAgendadoDto,
  ) {
    return this.agendadoService.update(user, id, dto);
  }

  @Post(':id/cancelar')
  @Auth(ValidRoles.cobrador)
  cancelar(
    @GetUser() user: GetUserDto,
    @Param('id', ParseMongoIdPipe) id: string,
  ) {
    return this.agendadoService.cancelar(user, id);
  }
}
