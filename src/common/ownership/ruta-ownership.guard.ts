import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RUTA_OWNERSHIP_KEY,
  RutaOwnershipOptions,
  IdSource,
} from './ruta-ownership.decorator';
import { RutaOwnershipService } from './ruta-ownership.service';

@Injectable()
export class RutaOwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly ownershipService: RutaOwnershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RutaOwnershipOptions>(
      RUTA_OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) {
      return false;
    }

    const ids = {
      rutaId: this.readId(req, options.rutaId),
      creditoId: this.readId(req, options.creditoId),
      clienteId: this.readId(req, options.clienteId),
      movimientoId: this.readId(req, options.movimientoId),
    };

    await this.ownershipService.assertAccessFromIds(user, ids);
    return true;
  }

  private readId(req: any, source?: IdSource): string | null {
    if (!source) return null;
    const container = req[source.in];
    if (!container) return null;
    const value = container[source.key];
    return this.ownershipService.toId(value);
  }
}
