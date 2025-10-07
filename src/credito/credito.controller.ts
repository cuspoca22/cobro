import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';

import { CreditoService } from './credito.service';
import { CreateCreditoDto, UpdateCreditoDto } from './dto/';
import { Auth, GetUser } from '../auth/decorators';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { GetUserDto } from '../auth/dto/get-user.dto';

@Auth()
@Controller('credito')
export class CreditoController {
  constructor(private readonly creditoService: CreditoService) {}

  // @Post()
  // create(@Body() createCreditoDto: CreateCreditoDto) {
  //   return this.creditoService.create(createCreditoDto);
  // }

  // Este sera el enpoint que se llamara para la parte de rutero en el cliente
  @Get('get-creditos-by-ruta')
  async getCreditosByRuta(
    @GetUser() user: GetUserDto
  ){
    return await this.creditoService.getCreditosByRuta(user.ruta)
  }

  @Get('historial')
  async getHistorial(
    @Query('clienteId', ParseMongoIdPipe) clienteId: string,
  ) {
    return this.creditoService.getHistorialCreditos(clienteId);
  }

  // Este sera el enpoint para obtener mas detalles de un credito, por ejemplo para saber su historial etc
  @Get(':creditId')
  async findOne(
    @GetUser() user: GetUserDto,
    @Param('creditId', ParseMongoIdPipe) creditId: string,
  ) {
    return this.creditoService.getCreditoById(creditId, user.ruta);
  }

  // @Get()
  // async findAll(
  //   @Query() paramsDto: ParamsDto,
  // ) {
  //   return this.creditoService.getCreditDetailsWithCalculatedData(paramsDto);
  // }

  // @Get('renovaciones')
  // async findRenovaciones(
  //   @Query('fecha') fecha: string,
  //   @GetUser() user: User
  // ) {
  //   return this.creditoService.findRenovaciones(fecha, user);
  // }

  

  // @Patch(':id')
  // async update(
  //   @Param('id') id: string, 
  //   @Body() updateCreditoDto: UpdateCreditoDto,
  //   @Query('fecha') fecha: string,
  // ) {
  //   return await this.creditoService.update(id, updateCreditoDto, fecha);
  // }

  // @Patch('turno/:id')
  // async updateTurno(
  //   @Param('id') id: string, 
  //   @Body() updateCreditoDto: UpdateCreditoDto,
  // ) {
  //   return await this.creditoService.updateTurno( id, updateCreditoDto );
  // }

  // @Delete(':id')
  // remove(
  //   @Param('id', ParseMongoIdPipe) id: string,
  // ) {
  //   return this.creditoService.remove(id);
  // }
}
