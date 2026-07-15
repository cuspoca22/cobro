import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';

import { CreditoService } from './credito.service';
import { Auth, GetUser } from '../auth/decorators';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { GetUserDto } from '../auth/dto/get-user.dto';
import { UpdateCreditoDto } from './dto';
import { RutaOwnership, RutaOwnershipService } from 'src/common/ownership';

@Auth()
@Controller('credito')
export class CreditoController {

  constructor(
    private readonly creditoService: CreditoService,
    private readonly ownershipService: RutaOwnershipService,
  ) { }

  // Cobrador: su ruta. Admin con ruta asignada también.
  @Get('get-creditos-by-ruta')
  async getCreditosByRuta(
    @GetUser() user: GetUserDto
  ) {
    return await this.creditoService.getCreditosByRuta(user.ruta)
  }

  @RutaOwnership({ clienteId: { in: 'query', key: 'clienteId' } })
  @Get('historial')
  async getHistorial(
    @Query('clienteId', ParseMongoIdPipe) clienteId: string,
  ) {
    return this.creditoService.getHistorialCreditos(clienteId);
  }

  @RutaOwnership({ creditoId: { in: 'params', key: 'creditId' } })
  @Get(':creditId')
  async findOne(
    @Param('creditId', ParseMongoIdPipe) creditId: string,
  ) {
    // Usa la ruta real del crédito (admins sin user.ruta también funcionan)
    const rutaId = await this.ownershipService.resolveRutaId({ creditoId: creditId });
    return this.creditoService.getCreditoById(creditId, rutaId);
  }

  @RutaOwnership({ creditoId: { in: 'params', key: 'creditoId' } })
  @Patch('turno/:creditoId')
  async updateTurno(
    @Param('creditoId', ParseMongoIdPipe) creditoId: string,
    @Body() updateCreditoDto: UpdateCreditoDto,
  ) {
    return await this.creditoService.updateTurno(creditoId, updateCreditoDto);
  }

}
