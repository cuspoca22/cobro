import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiQuery,
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

/** Alias `reports` para el admin legacy; `reportes` es el path canónico. */
@Controller(['reportes', 'reports'])
@ApiTags('Reportes')
@ApiBearerAuth('bearerAuth')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  private resolveEmpresaId(user: GetUserDto, empresaQuery?: string): string {
    const empresaId = (empresaQuery || user.empresa || '').toString();
    if (!empresaId) {
      throw new ForbiddenException('Empresa no disponible en la sesión');
    }
    if (
      user.rol !== ValidRoles.superAdmin &&
      empresaId !== user.empresa?.toString()
    ) {
      throw new ForbiddenException('No puedes exportar otra empresa');
    }
    return empresaId;
  }

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
      'Calcula el interés cobrado (prorrateo sobre montoAbono, sin mora) a partir de pagos de crédito. ' +
      'Incluye cobros, préstamos otorgados, gastos, retiros, inversiones, resultado del periodo ' +
      '(interesCobrado - gastos) y series diarias para gráficos. ' +
      'El campo interesCobrado difiere de interesContractual/gananciaPotencial en cartera.',
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
    summary: 'Snapshot de cartera, riesgo y liquidez',
    description:
      'Métricas actuales: cartera, capital prestado, interés contractual/pendiente/cobrado, ' +
      'caja actual por ruta, liquidez operativa (caja + cartera), ' +
      'distribución por estado y morosidad sobre créditos activos. Sin rango de fechas.',
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
      'caja final, pretendido, eficiencia de cobro y cajaFinalUltimoDia del periodo.',
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

  @Get('backup')
  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="empresa_backup.csv"')
  @ApiOperation({
    summary: 'Descargar copia de seguridad CSV',
    description:
      'Exporta créditos de la empresa (con datos de cliente y ruta) en CSV. ' +
      'Columnas: ruta, cliente, alias, dpi, telefono, valor_credito, total_pagar, ' +
      'valor_cuota, status, fecha_inicio, dueDate, state, frecuencia_cobro, ' +
      'mora_adeudada, mora_cobrada.',
  })
  @ApiQuery({ name: 'empresa', required: false, description: 'ID de empresa (debe coincidir con la sesión salvo SUPERADMIN)' })
  @ApiProduces('text/csv')
  @ApiResponse({ status: 200, description: 'CSV de backup' })
  @ApiResponse({ status: 403, description: 'Sin permiso sobre la empresa' })
  async getBackup(
    @GetUser() user: GetUserDto,
    @Query('empresa') empresa?: string,
  ): Promise<StreamableFile> {
    const empresaId = this.resolveEmpresaId(user, empresa);
    const buffer = await this.reportesService.buildEmpresaBackupCsv(empresaId);
    return new StreamableFile(buffer);
  }

  @Get('send-backup')
  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @ApiOperation({
    summary: 'Enviar copia de seguridad por email',
    description:
      'Genera el mismo CSV que /backup y lo envía por SMTP al destinatario indicado. ' +
      'Requiere variables SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (y opcional SMTP_FROM).',
  })
  @ApiQuery({ name: 'empresa', required: false })
  @ApiQuery({ name: 'to', required: false, description: 'Email destino; por defecto el email de la empresa' })
  @ApiResponse({ status: 200, description: 'true si el correo se envió' })
  @ApiResponse({ status: 400, description: 'SMTP no configurado o email inválido' })
  sendBackup(
    @GetUser() user: GetUserDto,
    @Query('empresa') empresa?: string,
    @Query('to') to?: string,
  ): Promise<boolean> {
    const empresaId = this.resolveEmpresaId(user, empresa);
    return this.reportesService.sendEmpresaBackupEmail(empresaId, to);
  }
}
