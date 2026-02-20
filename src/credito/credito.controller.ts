import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';

import { CreditoService } from './credito.service';
import { Auth, GetUser } from '../auth/decorators';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { GetUserDto } from '../auth/dto/get-user.dto';
import { UpdateCreditoDto } from './dto';

@Auth()
@Controller('credito')
export class CreditoController {

  constructor(private readonly creditoService: CreditoService) { }

  // Este sera el enpoint que se llamara para la parte de rutero en el cliente
  @Get('get-creditos-by-ruta')
  async getCreditosByRuta(
    @GetUser() user: GetUserDto
  ) {
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

  @Patch('turno/:creditoId')
  async updateTurno(
    @Param('creditoId', ParseMongoIdPipe) creditoId: string,
    @Body() updateCreditoDto: UpdateCreditoDto,
  ) {
    return await this.creditoService.updateTurno(creditoId, updateCreditoDto);
  }

}
