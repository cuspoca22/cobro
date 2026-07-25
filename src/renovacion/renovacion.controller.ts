import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { RenovacionService } from './renovacion.service';
import { GetRenovacionesDto } from './dto/get-renovaciones.dto';
import { EmpresaReport } from './interfaces';
import { Auth, GetUser } from 'src/auth/decorators';
import { GetUserDto } from 'src/auth/dto';
import { ValidRoles } from 'src/auth/interfaces';
import { getScopedRutaIds, normalizeId } from 'src/common/helpers';

@Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor, ValidRoles.cobrador)
@Controller('renovacion')
export class RenovacionController {
  constructor(private readonly renovacionService: RenovacionService) { }

  @Get('diaria')
  async getRenovacionesDiarias(
    @GetUser() user: GetUserDto,
    @Query() query: GetRenovacionesDto,
  ): Promise<EmpresaReport> {
    const empresa = normalizeId(user.empresa);
    if (!empresa) {
      throw new ForbiddenException('El usuario no tiene una empresa asignada');
    }

    const scoped = getScopedRutaIds(user);
    if (query.rutaId && Array.isArray(scoped) && !scoped.includes(query.rutaId)) {
      throw new ForbiddenException('No tienes permiso para operar sobre esta ruta');
    }

    return await this.renovacionService.getRenovacionesDiarias(
      { ...query },
      empresa,
      scoped ?? undefined,
    );
  }
}
