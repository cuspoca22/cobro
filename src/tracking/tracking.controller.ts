import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Model } from 'mongoose';

import { Auth } from 'src/auth/decorators';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { UserEntity } from 'src/auth/entities/user.entity';
import { ValidRoles } from 'src/auth/interfaces/valid-roles';
import { User } from 'src/auth/schemas/user.schema';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { TrackingService } from './tracking.service';

@ApiTags('Tracking')
@ApiBearerAuth('bearerAuth')
@Controller('tracking')
@Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor)
export class TrackingController {
  constructor(
    private readonly trackingService: TrackingService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  @Get('empresa/:empresaId/hoy')
  @ApiOperation({ summary: 'Tracking del día de cobradores de la empresa' })
  async getEmpresaHoy(
    @Param('empresaId', ParseMongoIdPipe) empresaId: string,
    @GetUser() user: UserEntity,
  ) {
    this.assertSameEmpresa(user, empresaId);
    const onlineIds = this.trackingService.getOnlineCobradorIds(empresaId);
    return this.trackingService.getEmpresaHoy(empresaId, onlineIds);
  }

  @Get('cobrador/:cobradorId/hoy')
  @ApiOperation({ summary: 'Recorrido del día de un cobrador' })
  async getCobradorHoy(
    @Param('cobradorId', ParseMongoIdPipe) cobradorId: string,
    @GetUser() user: UserEntity,
  ) {
    const cobrador = await this.userModel
      .findById(cobradorId)
      .select('empresa')
      .lean();

    if (!cobrador) {
      throw new NotFoundException(`Cobrador ${cobradorId} no existe`);
    }

    const cobradorEmpresa = cobrador.empresa?.toString();
    if (!cobradorEmpresa) {
      throw new ForbiddenException('Cobrador sin empresa asignada');
    }

    this.assertSameEmpresa(user, cobradorEmpresa);

    const online = this.trackingService.isCobradorOnline(cobradorId);
    return this.trackingService.getCobradorHoy(cobradorId, online);
  }

  private assertSameEmpresa(user: UserEntity, empresaId: string): void {
    if (user.rol === ValidRoles.superAdmin) return;
    if (user.empresa !== empresaId) {
      throw new ForbiddenException('No puedes ver tracking de otra empresa');
    }
  }
}
