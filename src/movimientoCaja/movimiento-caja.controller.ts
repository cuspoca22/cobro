import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";

import { Auth, GetUser } from '../auth/decorators';
import { UserEntity } from '../auth/entities/user.entity';
import { ValidRoles } from '../auth/interfaces';
import { MovimientoCajaService } from "./movimiento-caja.service";
import { CreateMovimientoCajaDto, UpdateMovimientoCajaDto, ResumenOficinaQueryDto } from "./dto";
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';
import { CreateCreditoDto, UpdateCreditoDto } from "src/credito/dto";
import { RutaAbierta } from "src/common/decorators";
import { RutaOwnership } from "src/common/ownership";
import { getScopedRutaIds, normalizeId } from "src/common/helpers";

@Auth()
@Controller("movimiento-caja")
export class MovimientoCajaController {

  constructor(
    private movimientoCajaService: MovimientoCajaService,
  ) { }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor, ValidRoles.cobrador)
  @RutaOwnership({
    rutaId: { in: 'query', key: 'rutaId' },
    creditoId: { in: 'query', key: 'creditoId' },
  })
  @Get('historial-pagos')
  async historialPagos(
    @Query('rutaId') rutaId: string,
    @Query('creditoId') creditoId: string,
  ) {
    return this.movimientoCajaService.getHistorialPagos(rutaId, creditoId);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor, ValidRoles.cobrador)
  @RutaOwnership({ rutaId: { in: 'query', key: 'rutaId' } })
  @Get("resumen-por-ruta")
  async getResumenDiarioPorRuta(
    @Query('rutaId') rutaId: string,
    @Query('fecha') fecha: string,
  ) {
    return await this.movimientoCajaService.getResumenDiario(rutaId, fecha);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor)
  @Get('pagos-ubicacion')
  async getPagosConUbicacion(
    @Query('empresaId', ParseMongoIdPipe) empresaId: string,
    @GetUser() user: UserEntity,
    @Query('fecha') fecha?: string,
  ) {
    if (user.rol !== ValidRoles.superAdmin && normalizeId(user.empresa) !== empresaId) {
      throw new ForbiddenException(
        'No puedes ver ubicaciones de pagos de otra empresa',
      );
    }
    const rutaIds = getScopedRutaIds(user);
    return this.movimientoCajaService.getPagosConUbicacionEmpresa(
      empresaId,
      fecha,
      rutaIds ?? undefined,
    );
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor, ValidRoles.cobrador)
  @RutaAbierta()
  @RutaOwnership({ rutaId: { in: 'body', key: 'rutaId' } })
  @Post('add')
  async createPago(
    @Body() createMovimientoCajaDto: CreateMovimientoCajaDto
  ) {
    return this.movimientoCajaService.addPago(createMovimientoCajaDto);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor, ValidRoles.cobrador)
  @RutaAbierta()
  @RutaOwnership({ rutaId: { in: 'body', key: 'rutaId' } })
  @Post('renovacion')
  addRenovacion(
    @Body() createCreditoDto: CreateCreditoDto
  ) {
    return this.movimientoCajaService.addRenovacion(createCreditoDto);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor, ValidRoles.cobrador)
  @RutaAbierta()
  @RutaOwnership({ movimientoId: { in: 'params', key: 'movimientoId' } })
  @Patch('update-pago/:movimientoId')
  async updatePago(
    @Body() updateMovimientoCajaDto: UpdateMovimientoCajaDto,
    @Param('movimientoId', ParseMongoIdPipe) movimientoId: string,
  ) {
    return await this.movimientoCajaService.updatePago(movimientoId, updateMovimientoCajaDto);
  }

  @RutaAbierta()
  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @RutaOwnership({ movimientoId: { in: 'params', key: 'movimientoId' } })
  @Delete('delete-pago/:movimientoId')
  async deletePago(
    @Param('movimientoId', ParseMongoIdPipe) movimientoId: string,
  ) {
    return this.movimientoCajaService.deletePago(movimientoId);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.cobrador)
  @RutaAbierta()
  @RutaOwnership({ rutaId: { in: 'body', key: 'rutaId' } })
  @Post('oficina')
  async createGasto(
    @Body() createMovimientoDto: CreateMovimientoCajaDto,
  ) {
    return await this.movimientoCajaService.addOficinaMovimiento(createMovimientoDto);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor)
  @RutaOwnership({ rutaId: { in: 'query', key: 'rutaId' } })
  @Get('oficina/resumen')
  async getResumenOficina(@Query() query: ResumenOficinaQueryDto) {
    return this.movimientoCajaService.getResumenOficina(query.rutaId, query.fecha);
  }

  @RutaAbierta()
  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.cobrador)
  @RutaOwnership({ movimientoId: { in: 'params', key: 'movimientoId' } })
  @Patch('update/:movimientoId')
  async updateMovimiento(
    @Body() updateMovimientoCajaDto: UpdateMovimientoCajaDto,
    @Param('movimientoId', ParseMongoIdPipe) movimientoId: string
  ) {
    return this.movimientoCajaService.updateMovimiento(movimientoId, updateMovimientoCajaDto);
  }

  @RutaAbierta()
  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor)
  @RutaOwnership({ creditoId: { in: 'params', key: 'creditoId' } })
  @Patch('update-credito/:creditoId')
  async updateCredito(
    @Body() updateCreditoDto: UpdateCreditoDto,
    @Param('creditoId', ParseMongoIdPipe) creditoId: string,
    @GetUser() user: UserEntity,
  ) {
    return this.movimientoCajaService.updateCredito(creditoId, updateCreditoDto, {
      bypassDayCheck: user.rol === ValidRoles.superAdmin,
    });
  }

  @RutaAbierta()
  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor)
  @RutaOwnership({
    creditoId: { in: 'params', key: 'creditoId' },
    movimientoId: { in: 'params', key: 'movimientoId' },
  })
  @Delete('delete-credito/:creditoId/:movimientoId')
  async deleteCredito(
    @Param('creditoId', ParseMongoIdPipe) creditoId: string,
    @Param('movimientoId', ParseMongoIdPipe) movimientoId: string,
    @GetUser() user: UserEntity,
  ) {
    return this.movimientoCajaService.deleteCredito(creditoId, movimientoId, {
      bypassDayCheck: user.rol === ValidRoles.superAdmin,
    });
  }

  /** SUPERADMIN: elimina crédito resolviendo el movimiento PRESTAMO asociado. */
  @Auth(ValidRoles.superAdmin)
  @RutaOwnership({ creditoId: { in: 'params', key: 'creditoId' } })
  @Delete('delete-credito-sa/:creditoId')
  async deleteCreditoSa(
    @Param('creditoId', ParseMongoIdPipe) creditoId: string,
  ) {
    return this.movimientoCajaService.deleteCreditoAsSuperAdmin(creditoId);
  }

}
