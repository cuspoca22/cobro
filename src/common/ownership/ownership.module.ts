import { Module, forwardRef } from '@nestjs/common';

import { CreditoModule } from 'src/credito/credito.module';
import { ClienteModule } from 'src/cliente/cliente.module';
import { MovimientoCajaModule } from 'src/movimientoCaja/movimiento-caja.module';
import { RutaModule } from 'src/ruta/ruta.module';
import { RutaOwnershipService } from './ruta-ownership.service';
import { RutaOwnershipGuard } from './ruta-ownership.guard';

/**
 * FIX [P0 seguridad]: ownership de ruta/tenant.
 * V4b: sin forFeature(Ruta); lectura vía RutaService (forwardRef ciclo Ownership↔Ruta).
 */
@Module({
  imports: [
    forwardRef(() => MovimientoCajaModule),
    forwardRef(() => CreditoModule),
    forwardRef(() => ClienteModule),
    forwardRef(() => RutaModule),
  ],
  providers: [RutaOwnershipService, RutaOwnershipGuard],
  exports: [RutaOwnershipService, RutaOwnershipGuard],
})
export class OwnershipModule {}
