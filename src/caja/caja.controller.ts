import { Controller, Get, Query } from '@nestjs/common';
import { CajaService } from './caja.service';
import { Auth } from 'src/auth/decorators';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';

@Auth()
@Controller('caja')
export class CajaController {
  constructor(private readonly cajaService: CajaService) { }

  @Get()
  async findAll(
    @Query('ruta', ParseMongoIdPipe) ruta: string,
    @Query('fecha') fecha: string
  ) {
    return this.cajaService.findAll(ruta, fecha);
  }

  @Get("current")
  async findCurrentCaja(
    @Query("ruta", ParseMongoIdPipe) ruta: string,
  ) {
    return this.cajaService.currentCaja(ruta);
  }

}
