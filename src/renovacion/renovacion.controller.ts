import { Controller, Get, Param, Query, ValidationPipe } from '@nestjs/common';
import { RenovacionService } from './renovacion.service';
import { GetRenovacionesDto } from './dto/get-renovaciones.dto';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { EmpresaReport } from './interfaces';
import { Auth, GetUser } from 'src/auth/decorators';
import { GetUserDto } from 'src/auth/dto';

@Auth()
@Controller('renovacion')
export class RenovacionController {
  constructor(private readonly renovacionService: RenovacionService) { }

  @Get('diaria')
  async getRenovacionesDiarias(
    @GetUser() user: GetUserDto,
    @Query() query: GetRenovacionesDto,
  ): Promise<EmpresaReport> {
    const { empresa } = user;
    return await this.renovacionService.getRenovacionesDiarias({ ...query }, empresa);
  }
}
