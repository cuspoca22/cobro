import { Controller, Get, Query } from '@nestjs/common';
import { CajaService } from './caja.service';
import { Auth } from 'src/auth/decorators';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { RutaOwnership } from 'src/common/ownership';

@Auth()
@Controller('caja')
export class CajaController {
  constructor(private readonly cajaService: CajaService) { }

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

}
