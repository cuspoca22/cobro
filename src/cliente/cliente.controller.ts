import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseBoolPipe } from '@nestjs/common';
import { ClienteService } from './cliente.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { SetClienteStateDto } from './dto/set-cliente-state.dto';
import { Auth, GetUser } from '../auth/decorators';
import { ValidRoles } from '../auth/interfaces';
import { GetUserDto } from '../auth/dto';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { RutaAbierta } from 'src/common/decorators';
import { RutaOwnership } from 'src/common/ownership';

@Auth()
@Controller('cliente')
export class ClienteController {
  constructor(private readonly clienteService: ClienteService) { }

  @RutaAbierta()
  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor, ValidRoles.cobrador)
  @RutaOwnership({ rutaId: { in: 'body', key: 'ruta' } })
  @Post()
  async create(
    @Body() createClienteDto: CreateClienteDto
  ) {
    return this.clienteService.create(createClienteDto);
  }

  @RutaOwnership({ rutaId: { in: 'query', key: 'idRuta' } })
  @Get()
  async findAll(
    @Query('status', ParseBoolPipe) status: boolean,
    @Query('idRuta', ParseMongoIdPipe) idRuta: string,
  ) {
    return this.clienteService.findAll(status, idRuta);
  }

  @RutaOwnership({ rutaId: { in: 'query', key: 'idRuta' } })
  @Get("admin")
  async findAllByAdmin(
    @Query('idRuta', ParseMongoIdPipe) idRuta: string,
    @Query('includeInactive') includeInactive: string | undefined,
    @GetUser() user: GetUserDto,
  ) {
    const allowInactive =
      user.rol === ValidRoles.superAdmin && includeInactive === 'true';
    return this.clienteService.findByAdmin(idRuta, allowInactive);
  }

  // Obtener informacion del cliente con el historial de sus creditos
  @RutaOwnership({ clienteId: { in: 'params', key: 'termino' } })
  @Get(':termino')
  async findOne(
    @Param('termino') termino: string,
    @GetUser() user: GetUserDto,
  ) {
    return this.clienteService.findOne(
      termino,
      user.rol === ValidRoles.superAdmin,
    );
  }

  @Auth(ValidRoles.superAdmin)
  @RutaOwnership({ clienteId: { in: 'params', key: 'id' } })
  @Patch(':id/state')
  setState(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: SetClienteStateDto,
  ) {
    return this.clienteService.setState(id, dto.state);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor, ValidRoles.cobrador)
  @RutaOwnership({ clienteId: { in: 'params', key: 'id' } })
  @Patch(':id')
  update(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() updateClienteDto: UpdateClienteDto
  ) {
    return this.clienteService.update(id, updateClienteDto);
  }

  @Auth(ValidRoles.superAdmin)
  @RutaOwnership({ clienteId: { in: 'params', key: 'id' } })
  @Delete(':id')
  async remove(@Param('id', ParseMongoIdPipe) id: string) {
    return this.clienteService.remove(id);
  }
}
