import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Auth, GetUser } from '../auth/decorators';
import { GetUserDto } from '../auth/dto';
import { ValidRoles } from '../auth/interfaces/valid-roles';
import { ReportesService } from './reportes.service';
import { ReporteCarteraQueryDto, ReporteRangoQueryDto } from './dto';
import {
  ReporteCajaHistoricoResponseDto,
  ReporteCarteraResponseDto,
  ReporteFinancieroResponseDto,
  ReporteOficinaResponseDto,
} from './responses';

@Controller('reportes')
@ApiTags('Reportes')
@ApiBearerAuth('bearerAuth')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('oficina')
  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @ApiOperation({
    summary: 'Reporte de gastos, retiros e inversiones por periodo',
    description:
      'Consolida los movimientos de oficina de todas las rutas de la empresa en un rango de fechas. ' +
      'Respeta la zona horaria de cada ruta. Filtro opcional por rutaId.',
  })
  @ApiResponse({ status: 200, type: ReporteOficinaResponseDto })
  @ApiResponse({ status: 400, description: 'Rango de fechas inválido o ruta no pertenece a la empresa' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo ADMIN y SUPERADMIN' })
  getReporteOficina(
    @GetUser() user: GetUserDto,
    @Query() query: ReporteRangoQueryDto,
  ): Promise<ReporteOficinaResponseDto> {
    return this.reportesService.getReporteOficina(query, user.empresa);
  }

  @Get('financiero')
  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @ApiOperation({
    summary: 'Reporte financiero por periodo',
    description:
      'Calcula el interés cobrado (ganancia por fecha) a partir de pagos de crédito en el rango seleccionado. ' +
      'Incluye cobros, préstamos otorgados, gastos, retiros, inversiones y series diarias para gráficos. ' +
      'El campo interesCobrado difiere de ganancia_total en GET /ruta/:id, que representa ganancia potencial en cartera activa.',
  })
  @ApiResponse({ status: 200, type: ReporteFinancieroResponseDto })
  @ApiResponse({ status: 400, description: 'Rango de fechas inválido o ruta no pertenece a la empresa' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo ADMIN y SUPERADMIN' })
  getReporteFinanciero(
    @GetUser() user: GetUserDto,
    @Query() query: ReporteRangoQueryDto,
  ): Promise<ReporteFinancieroResponseDto> {
    return this.reportesService.getReporteFinanciero(query, user.empresa);
  }

  @Get('cartera')
  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @ApiOperation({
    summary: 'Snapshot de cartera y riesgo',
    description:
      'Métricas actuales de cartera: saldo pendiente, capital prestado, ganancia potencial, ' +
      'distribución por estado (BUENO/REGULAR/MALO) y porcentaje de morosidad. No depende de un rango de fechas.',
  })
  @ApiResponse({ status: 200, type: ReporteCarteraResponseDto })
  @ApiResponse({ status: 400, description: 'Ruta no pertenece a la empresa' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo ADMIN y SUPERADMIN' })
  getReporteCartera(
    @GetUser() user: GetUserDto,
    @Query() query: ReporteCarteraQueryDto,
  ): Promise<ReporteCarteraResponseDto> {
    return this.reportesService.getReporteCartera(query, user.empresa);
  }

  @Get('caja-historico')
  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @ApiOperation({
    summary: 'Histórico de caja por periodo',
    description:
      'Tendencia operativa diaria a partir de snapshots de caja: cobros, préstamos, gastos, ' +
      'caja final, pretendido y eficiencia de cobro (cobro/pretendido).',
  })
  @ApiResponse({ status: 200, type: ReporteCajaHistoricoResponseDto })
  @ApiResponse({ status: 400, description: 'Rango de fechas inválido o ruta no pertenece a la empresa' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo ADMIN y SUPERADMIN' })
  getReporteCajaHistorico(
    @GetUser() user: GetUserDto,
    @Query() query: ReporteRangoQueryDto,
  ): Promise<ReporteCajaHistoricoResponseDto> {
    return this.reportesService.getReporteCajaHistorico(query, user.empresa);
  }
}
