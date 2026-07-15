import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RutaService } from '../../ruta/ruta.service';
import { UserEntity } from '../../auth/entities/user.entity';
import { ValidRoles } from '../../auth/interfaces';

/**
 * FIX [P2]: valida solo status/isLocked con getEstadoApertura (barato).
 * Antes llamaba findOne() completo (counts + aggregation de cartera) en cada pago.
 */
@Injectable()
export class RutaAbiertaInterceptor implements NestInterceptor {
  constructor(
    @Inject(forwardRef(() => RutaService))
    private readonly rutaService: RutaService,
  ) { }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as UserEntity;

    if (!user) {
      throw new BadRequestException('Usuario no autenticado');
    }

    // Cobrador debe tener ruta. Admin/supervisor/superadmin pueden operar
    // sin user.ruta (ownership ya acota el tenant por rutaId del request).
    const isElevated =
      user.rol === ValidRoles.admin ||
      user.rol === ValidRoles.superAdmin ||
      user.rol === ValidRoles.supervisor;

    if (!user.ruta) {
      if (isElevated) {
        return next.handle();
      }
      throw new BadRequestException('El usuario no tiene una ruta asignada');
    }

    const rutaId = user.ruta.toString();

    try {
      const ruta = await this.rutaService.getEstadoApertura(rutaId);

      if (!ruta.status) {
        throw new BadRequestException('La ruta está cerrada. No se pueden realizar operaciones.');
      }

      if (ruta.isLocked) {
        throw new BadRequestException('La ruta está bloqueada. No se pueden realizar operaciones.');
      }

      request.ruta = ruta;

    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Error al validar la ruta: ${error.message}`);
    }

    return next.handle();
  }
}
