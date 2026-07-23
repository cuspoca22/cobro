import { Body, Controller, Get, Param, Patch, Query, BadRequestException } from '@nestjs/common';
import { CajaService } from './caja.service';
import { Auth, GetUser } from 'src/auth/decorators';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { RutaOwnership, RutaOwnershipService } from 'src/common/ownership';
import { ValidRoles } from 'src/auth/interfaces';
import { UpdateCajaDto } from './dto';
import { GetUserDto } from 'src/auth/dto';

@Auth()
@Controller('caja')
export class CajaController {
  constructor(
    private readonly cajaService: CajaService,
    private readonly ownershipService: RutaOwnershipService,
  ) { }

  @RutaOwnership({ rutaId: { in: 'query', key: 'ruta' } })
  @Get()
  async findAll(
    @Query('ruta', ParseMongoIdPipe) ruta: string,
    @Query('fecha') fecha: string
  ) {
    return this.cajaService.findAll(ruta, fecha);
  }

  @RutaOwnership({ rutaId: { in: 'query', key: 'ruta' } })
  @Get("current")
  async findCurrentCaja(
    @Query("ruta", ParseMongoIdPipe) ruta: string,
  ) {
    return this.cajaService.currentCaja(ruta);
  }

  @Auth(ValidRoles.superAdmin)
  @Patch(':id')
  async update(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateCajaDto,
    @GetUser() user: GetUserDto,
  ) {
    const cajaInfo = await this.cajaService.getRutaIdByCajaId(id);
    if (!cajaInfo.exists) {
      throw new BadRequestException(`Caja ${id} no existe`);
    }
    if (!cajaInfo.rutaId) {
      throw new BadRequestException('La caja no tiene ruta asociada');
    }
    await this.ownershipService.assertCanAccessRuta(user, cajaInfo.rutaId);
    return this.cajaService.updateById(id, dto);
  }

}
