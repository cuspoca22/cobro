import { Module, forwardRef } from '@nestjs/common';

import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';
import { MovimientoCajaModule } from '../movimientoCaja/movimiento-caja.module';
import { EmpresaModule } from '../empresa/empresa.module';
import { RutaModule } from '../ruta/ruta.module';
import { ClienteModule } from '../cliente/cliente.module';
import { CreditoModule } from '../credito/credito.module';
import { CajaModule } from '../caja/caja.module';

/**
 * Reportes P2: sin forFeature ajenos — solo módulos dueños + facades.
 */
@Module({
  imports: [
    EmpresaModule,
    forwardRef(() => RutaModule),
    forwardRef(() => ClienteModule),
    forwardRef(() => CreditoModule),
    forwardRef(() => CajaModule),
    forwardRef(() => MovimientoCajaModule),
  ],
  controllers: [ReportesController],
  providers: [ReportesService, DateFnsAdapter],
})
export class ReportesModule {}
