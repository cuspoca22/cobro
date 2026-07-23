import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RutaService } from './ruta.service';
import { CreateRutaDto } from './dto/create-ruta.dto';
import { UpdateRutaDto } from './dto/update-ruta.dto';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';
import { UserEntity } from 'src/auth/entities/user.entity';
import { RutaOwnership } from 'src/common/ownership';

@Auth()
@Controller('ruta')
export class RutaController {
  constructor(private readonly rutaService: RutaService) { }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Post()
  async create(
    @Body() createRutaDto: CreateRutaDto,
  ) {
    return this.rutaService.create(createRutaDto);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Get()
  async findAll(
    @GetUser() user: UserEntity
  ) {
    if (user.rol === ValidRoles.superAdmin) {
      return this.rutaService.findAll();
    }
    const empresaId =
      (user.empresa as any)?.toString?.() ?? user.empresa?.toString?.() ?? user.empresa;
    if (!empresaId) return [];
    return this.rutaService.findAllByEmpresa(String(empresaId));
  }

  // open/close ANTES de :id para no capturar "open"/"close" como ObjectId
  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor, ValidRoles.cobrador)
  @RutaOwnership({ rutaId: { in: 'params', key: 'id' } })
  @Patch("open/:id")
  async openRuta(
    @Param("id", ParseMongoIdPipe) id: string,
  ) {
    return this.rutaService.openRuta(id);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor, ValidRoles.cobrador)
  @RutaOwnership({ rutaId: { in: 'params', key: 'id' } })
  @Patch("close/:id")
  async closeRuta(
    @Param("id", ParseMongoIdPipe) id: string,
  ) {
    return this.rutaService.closeRuta(id)
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor)
  @RutaOwnership({ rutaId: { in: 'params', key: 'id' } })
  @Patch('lock/:id')
  async lockRuta(
    @Param('id', ParseMongoIdPipe) id: string,
  ) {
    return this.rutaService.lockRuta(id);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor)
  @RutaOwnership({ rutaId: { in: 'params', key: 'id' } })
  @Patch('unlock/:id')
  async unlockRuta(
    @Param('id', ParseMongoIdPipe) id: string,
  ) {
    return this.rutaService.unlockRuta(id);
  }

  @RutaOwnership({ rutaId: { in: 'params', key: 'id' } })
  @Get(':id')
  async findOne(
    @Param('id', ParseMongoIdPipe) id: string
  ) {
    return this.rutaService.findOne(id);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor)
  @RutaOwnership({ rutaId: { in: 'params', key: 'id' } })
  @Patch(':id')
  async update(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() updateRutaDto: UpdateRutaDto
  ) {
    return this.rutaService.update(id, updateRutaDto);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @RutaOwnership({ rutaId: { in: 'params', key: 'id' } })
  @Delete(":id")
  async remove(
    @Param("id", ParseMongoIdPipe) id: string,
  ) {
    return this.rutaService.delete(id);
  }

}
