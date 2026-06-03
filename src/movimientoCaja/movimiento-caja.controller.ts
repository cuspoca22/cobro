import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";

import { Auth, GetUser } from '../auth/decorators';
import { MovimientoCajaService } from "./movimiento-caja.service";
import { CreateMovimientoCajaDto, UpdateMovimientoCajaDto, ResumenOficinaQueryDto } from "./dto";
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';
import { CreateCreditoDto, UpdateCreditoDto } from "src/credito/dto";
import { RutaAbierta } from "src/common/decorators";

@Auth()
@Controller("movimiento-caja")
export class MovimientoCajaController {

  constructor(
    private movimientoCajaService: MovimientoCajaService
  ) { }

  @Get('historial-pagos')
  async historialPagos(
    @Query('rutaId') rutaId: string,
    @Query('creditoId') creditoId: string,
  ) {
    return this.movimientoCajaService.getHistorialPagos(rutaId, creditoId);
  }

  @Get("resumen-por-ruta")
  async getResumenDiarioPorRuta(
    @Query('rutaId') rutaId: string,
    @Query('fecha') fecha: string,
  ) {
    return await this.movimientoCajaService.getResumenDiario(rutaId, fecha);
  }

  @RutaAbierta()
  @Post('add')
  async createPago(
    @Body() createMovimientoCajaDto: CreateMovimientoCajaDto
  ) {
    return this.movimientoCajaService.addPago(createMovimientoCajaDto);
  }

  @RutaAbierta()
  @Post('renovacion')
  addRenovacion(
    @Body() createCreditoDto: CreateCreditoDto
  ) {
    return this.movimientoCajaService.addRenovacion(createCreditoDto);
  }

  @RutaAbierta()
  @Patch('update-pago/:movimentoId')
  async updatePago(
    @Body() updateMovimientoCajaDto: UpdateMovimientoCajaDto,
    @Param('movimentoId', ParseMongoIdPipe) movimentoId: string,
  ) {
    return await this.movimientoCajaService.updatePago(movimentoId, updateMovimientoCajaDto);
  }

  @RutaAbierta()
  @Post('oficina')
  async createGasto(
    @Body() createMovimientoDto: CreateMovimientoCajaDto,
  ) {
    return await this.movimientoCajaService.addOficinaMovimiento(createMovimientoDto);
  }

  @Get('oficina/resumen')
  async getResumenOficina(@Query() query: ResumenOficinaQueryDto) {
    return this.movimientoCajaService.getResumenOficina(query.rutaId, query.fecha);
  }

  @Patch('update/:movimientoId')
  async updateMovimiento(
    @Body() updateMovimientoCajaDto: UpdateMovimientoCajaDto,
    @Param('movimientoId', ParseMongoIdPipe) movimientoId: string
  ) {
    return this.movimientoCajaService.updateMovimiento(movimientoId, updateMovimientoCajaDto);
  }

  @Patch('update-credito/:creditoId')
  async updateCredito(
    @Body() updateCreditoDto: UpdateCreditoDto,
    @Param('creditoId', ParseMongoIdPipe) creditoId: string,
  ) {
    return this.movimientoCajaService.updateCredito(creditoId, updateCreditoDto);
  }

  @Delete('delete-credito/:creditoId/:movimientoId')
  async deleteCredito(
    @Param('creditoId', ParseMongoIdPipe) creditoId: string,
    @Param('movimientoId', ParseMongoIdPipe) movimientoId: string,
  ) {
    return this.movimientoCajaService.deleteCredito(creditoId, movimientoId);
  }

}