import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { RutaService } from './ruta.service';
import { CreateRutaDto } from './dto/create-ruta.dto';
import { UpdateRutaDto } from './dto/update-ruta.dto';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';
import { GlobalParams } from '../common/dto/global-params.dto';
import { UserEntity } from 'src/auth/entities/user.entity';

// rutas 
// post / crear una ruta  -- ya 
// get / obtener rutas o ruta
// get /:idRuta optener una ruta por un id
// put /:idRuta actualizar
// put /add-empleado/:idRuta
// put /close/:idruta
// put /admin/close/:id
// put /close/:idRuta
// put /add-ruta-admin/:idRuta
// delete /delete/:idruta

@Auth()
@Controller('ruta')
export class RutaController {
  constructor(private readonly rutaService: RutaService) {}

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
    return this.rutaService.findAll();
  }


  @Get(':id')
  async findOne(
    @Param('id', ParseMongoIdPipe) id: string
  ) {
    return this.rutaService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseMongoIdPipe) id: string, 
    @Body() updateRutaDto: UpdateRutaDto
  ) {
    return this.rutaService.update(id, updateRutaDto);
  }

  @Delete(":id")
  async remove(
    @Param("id", ParseMongoIdPipe) id: string,
    @Query() globalParams: GlobalParams
  ) {
    return this.rutaService.delete(id, globalParams);
  }

  @Patch("open/:id")
  async openRuta(
    @Param("id", ParseMongoIdPipe) id: string,
  ) {
    return this.rutaService.openRuta(id);
  }

  @Patch("close/:id")
  async closeRuta(
    @Param("id", ParseMongoIdPipe) id: string,
  ) {
    return this.rutaService.closeRuta(id)
  }

}
