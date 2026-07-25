import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';

import { ValidRoles } from 'src/auth/interfaces';
import { toRutaId, getScopedRutaIds as getScoped } from 'src/common/helpers';
import { MovimientoCajaService } from 'src/movimientoCaja/movimiento-caja.service';
import { CreditoService } from 'src/credito/credito.service';
import { ClienteService } from 'src/cliente/cliente.service';
import { RutaService } from 'src/ruta/ruta.service';

export type AuthUserLike = {
  rol?: string;
  ruta?: unknown;
  empresa?: unknown;
  /** Rutas asignadas a SUPERVISOR. */
  rutas?: unknown;
};

@Injectable()
export class RutaOwnershipService {
  constructor(
    @Inject(forwardRef(() => RutaService))
    private readonly rutaService: RutaService,
    @Inject(forwardRef(() => CreditoService))
    private readonly creditoService: CreditoService,
    @Inject(forwardRef(() => ClienteService))
    private readonly clienteService: ClienteService,
    @Inject(forwardRef(() => MovimientoCajaService))
    private readonly movimientoCajaService: MovimientoCajaService,
  ) {}

  /** Delega en la función pura compartida. */
  toId(value: unknown): string | null {
    return toRutaId(value);
  }

  /** Delega en la función pura compartida. */
  getScopedRutaIds(user: AuthUserLike): string[] | null {
    return getScoped(user);
  }

  async resolveRutaId(input: {
    rutaId?: string | null;
    creditoId?: string | null;
    clienteId?: string | null;
    movimientoId?: string | null;
  }): Promise<string> {
    if (input.rutaId) return input.rutaId;

    if (input.creditoId) {
      const credito = await this.creditoService.getRutaByCreditoId(input.creditoId);
      if (!credito.exists) throw new NotFoundException(`Crédito ${input.creditoId} no existe`);
      if (!credito.rutaId) throw new BadRequestException('El crédito no tiene ruta asociada');
      return credito.rutaId;
    }

    if (input.clienteId) {
      const cliente = await this.clienteService.getRutaByClienteId(input.clienteId);
      if (!cliente.exists) throw new NotFoundException(`Cliente ${input.clienteId} no existe`);
      if (!cliente.rutaId) throw new BadRequestException('El cliente no tiene ruta asociada');
      return cliente.rutaId;
    }

    if (input.movimientoId) {
      const mov = await this.movimientoCajaService.getRutaByMovimientoId(input.movimientoId);
      if (!mov.exists) throw new NotFoundException(`Movimiento ${input.movimientoId} no existe`);
      if (!mov.rutaId) throw new BadRequestException('El movimiento no tiene ruta asociada');
      return mov.rutaId;
    }

    throw new BadRequestException(
      'No se pudo determinar la ruta a autorizar (falta rutaId / creditoId / clienteId / movimientoId)',
    );
  }

  /**
   * Verifica que el usuario pueda operar sobre la ruta indicada.
   */
  async assertCanAccessRuta(user: AuthUserLike, rutaId: string): Promise<void> {
    const rol = user.rol as ValidRoles | undefined;
    const normalizedRutaId = toRutaId(rutaId);
    if (!normalizedRutaId) {
      throw new BadRequestException('rutaId inválido');
    }

    if (rol === ValidRoles.superAdmin) {
      return;
    }

    const ruta = await this.rutaService.getEmpresaIdByRutaId(normalizedRutaId);
    if (!ruta.exists) {
      throw new NotFoundException(`La ruta con el id ${normalizedRutaId} no existe`);
    }

    if (rol === ValidRoles.cobrador) {
      const userRuta = toRutaId(user.ruta);
      if (!userRuta) {
        throw new ForbiddenException('El cobrador no tiene una ruta asignada');
      }
      if (userRuta !== normalizedRutaId) {
        throw new ForbiddenException('No tienes permiso para operar sobre esta ruta');
      }
      return;
    }

    if (rol === ValidRoles.admin || rol === ValidRoles.supervisor) {
      const userEmpresa = toRutaId(user.empresa);
      const rutaEmpresa = toRutaId(ruta.empresaId);
      if (!userEmpresa || !rutaEmpresa || userEmpresa !== rutaEmpresa) {
        throw new ForbiddenException('No tienes permiso para operar sobre rutas de otra empresa');
      }

      if (rol === ValidRoles.supervisor) {
        const assigned = Array.isArray(user.rutas)
          ? user.rutas
              .map((r) => toRutaId(r))
              .filter((id): id is string => !!id)
          : [];
        if (!assigned.length || !assigned.includes(normalizedRutaId)) {
          throw new ForbiddenException(
            'No tienes permiso para operar sobre esta ruta',
          );
        }
      }
      return;
    }

    throw new ForbiddenException('No tienes permiso para operar sobre esta ruta');
  }

  async assertAccessFromIds(
    user: AuthUserLike,
    ids: {
      rutaId?: string | null;
      creditoId?: string | null;
      clienteId?: string | null;
      movimientoId?: string | null;
    },
  ): Promise<string> {
    const rutaId = await this.resolveRutaId(ids);
    await this.assertCanAccessRuta(user, rutaId);

    if (ids.creditoId) {
      const credito = await this.creditoService.getRutaByCreditoId(ids.creditoId);
      if (!credito.exists) throw new NotFoundException(`Crédito ${ids.creditoId} no existe`);
      if (credito.rutaId !== rutaId) {
        throw new ForbiddenException('El crédito no pertenece a la ruta autorizada');
      }
    }
    if (ids.clienteId) {
      const cliente = await this.clienteService.getRutaByClienteId(ids.clienteId);
      if (!cliente.exists) throw new NotFoundException(`Cliente ${ids.clienteId} no existe`);
      if (cliente.rutaId !== rutaId) {
        throw new ForbiddenException('El cliente no pertenece a la ruta autorizada');
      }
    }
    if (ids.movimientoId) {
      const mov = await this.movimientoCajaService.getRutaByMovimientoId(ids.movimientoId);
      if (!mov.exists) throw new NotFoundException(`Movimiento ${ids.movimientoId} no existe`);
      if (mov.rutaId !== rutaId) {
        throw new ForbiddenException('El movimiento no pertenece a la ruta autorizada');
      }
    }

    return rutaId;
  }
}
