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

    // Si el usuario no tiene ruta asignada, no se puede validar
    if (!user.ruta) {
      throw new BadRequestException('El usuario no tiene una ruta asignada');
    }

    // Obtener la ruta del usuario
    const rutaId = user.ruta.toString();

    try {
      // Obtener información de la ruta
      const ruta = await this.rutaService.findOne(rutaId);

      // Verificar si la ruta está abierta (status === true)
      if (!ruta.status) {
        throw new BadRequestException('La ruta está cerrada. No se pueden realizar operaciones.');
      }

      // También verificar si la ruta está bloqueada (isLocked)
      if (ruta.isLocked) {
        throw new BadRequestException('La ruta está bloqueada. No se pueden realizar operaciones.');
      }

      // Adjuntar la información de la ruta a la request para uso posterior
      request.ruta = ruta;

    } catch (error) {
      // Si el error ya es BadRequestException, relanzarlo
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Si no se encuentra la ruta u otro error
      throw new BadRequestException(`Error al validar la ruta: ${error.message}`);
    }

    return next.handle();
  }
}