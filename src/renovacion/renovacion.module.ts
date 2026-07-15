import { Module } from '@nestjs/common';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { RenovacionController } from './renovacion.controller';
import { RenovacionService } from './renovacion.service';
import { MovimientoCajaModule } from '../movimientoCaja/movimiento-caja.module';
import { EmpresaModule } from '../empresa/empresa.module';

/** V4b: sin forFeature(Empresa); lectura vía EmpresaService. */
@Module({
  imports: [
    MovimientoCajaModule,
    EmpresaModule,
  ],
  controllers: [RenovacionController],
  providers: [RenovacionService, DateFnsAdapter],
})
export class RenovacionModule { }
