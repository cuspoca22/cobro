import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { EmpresaService } from './empresa.service';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { UpdateMoraConfigDto } from './dto/update-mora-config.dto';
import { MoveEmpleadoDto } from './dto/move-empleado.dto';
import { MoveRutaDto } from './dto/move-ruta.dto';
import { AssignRutaDto } from './dto/assign-ruta.dto';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { CreateUserDto } from 'src/auth/dto';
import { ToUpperCasePipe } from '../common/pipes/to-upper-case.pipe';
import { CreateRutaDto } from '../ruta/dto/create-ruta.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SuspendEmpresaDto } from './dto/suspend-empresa.dto';
import { AccessSuspendedReason } from './interfaces/subscription-status';

@Controller('empresa')
export class EmpresaController {
  constructor(private readonly empresaService: EmpresaService) {}

  // ─── Static routes FIRST (antes de :id) ───────────────────────────

  @Auth(ValidRoles.superAdmin)
  @Post()
  create(@Body() createEmpresaDto: CreateEmpresaDto) {
    return this.empresaService.create(createEmpresaDto);
  }

  @Auth()
  @Get('get-empleados')
  findAll(
    @GetUser() user: any,
    @Query('empresa', ParseMongoIdPipe) empresa: string,
  ) {
    this.empresaService.assertCanAccessEmpresa(user, empresa);
    return this.empresaService.findAll(empresa);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor)
  @Get('get-open-rutas')
  findEmpresaWithRutasOpened() {
    return this.empresaService.findEmpresaWithRutasOpened();
  }

  @Auth(ValidRoles.superAdmin)
  @Get('all')
  findAllEmpresas() {
    return this.empresaService.getAllEmpresas();
  }

  @Auth(ValidRoles.superAdmin)
  @Get('overdue')
  findOverdueEmpresas(@Query('includeGrace') includeGrace?: string) {
    const withGrace =
      includeGrace === '1' ||
      includeGrace === 'true' ||
      includeGrace === 'yes';
    return this.empresaService.getOverdueEmpresas(withGrace);
  }

  @Auth()
  @Get()
  findOne(@GetUser() user: any) {
    if (!user?.empresa) {
      if (user?.rol === ValidRoles.superAdmin) {
        return {
          id: null,
          name: null,
          rutas: [],
          employes: [],
        };
      }
      throw new BadRequestException('El usuario no tiene una empresa asignada');
    }

    const empresa =
      typeof user.empresa === 'object' && user.empresa?._id
        ? user.empresa._id.toString()
        : user.empresa.toString();
    return this.empresaService.findRutasByEmpresa(empresa);
  }

  @Auth(ValidRoles.superAdmin)
  @Patch('move-empleado')
  moveEmpleado(@Body() dto: MoveEmpleadoDto) {
    return this.empresaService.moveEmpleado(dto);
  }

  @Auth(ValidRoles.superAdmin)
  @Patch('move-ruta')
  moveRuta(@Body() dto: MoveRutaDto) {
    return this.empresaService.moveRuta(dto);
  }

  @Auth(ValidRoles.superAdmin)
  @Patch('assign-ruta')
  assignRuta(@Body() dto: AssignRutaDto) {
    return this.empresaService.assignRuta(dto);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Post('add-empleado')
  addEmploye(@GetUser() user: any, @Body() userDto: CreateUserDto) {
    if (user.rol !== ValidRoles.superAdmin && userDto.empresa) {
      this.empresaService.assertCanAccessEmpresa(user, userDto.empresa);
    }
    return this.empresaService.addEmploye(userDto, user);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Delete('remove-empleado')
  removeEmploye(
    @GetUser() user: any,
    @Query('empresa', ParseMongoIdPipe) empresa: string,
    @Query('empleado', ParseMongoIdPipe) empleado: string,
  ) {
    this.empresaService.assertCanAccessEmpresa(user, empresa);
    return this.empresaService.deleteEmpleado(empresa, empleado);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Patch('add-ruta')
  addRuta(
    @GetUser() user: any,
    @Query('empresa', ParseMongoIdPipe) empresaID: string,
    @Body() rutaDto: CreateRutaDto,
  ) {
    this.empresaService.assertCanAccessEmpresa(user, empresaID);
    return this.empresaService.addRuta(empresaID, rutaDto);
  }

  @Auth(ValidRoles.superAdmin)
  @Patch('add-owner')
  addOwner(
    @Query('empresa', ParseMongoIdPipe) empresa: string,
    @Query('user', ParseMongoIdPipe) user: string,
  ) {
    return this.empresaService.addOwner(empresa, user);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Patch('update/:id')
  update(
    @GetUser() user: any,
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() updateEmpresaDto: UpdateEmpresaDto,
  ) {
    this.empresaService.assertCanAccessEmpresa(user, id);
    return this.empresaService.update(id, updateEmpresaDto);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin, ValidRoles.supervisor)
  @Get('ruta/openorclose/:idEmpresa/:idRuta')
  openOrCloseRuta(
    @GetUser() user: any,
    @Param('idEmpresa', ParseMongoIdPipe) idEmpresa: string,
    @Param('idRuta', ParseMongoIdPipe) idRuta: string,
    @Query('action', ToUpperCasePipe) action: string,
  ) {
    this.empresaService.assertCanAccessEmpresa(user, idEmpresa);
    return true;
  }

  // ─── Parameterized routes (después de estáticas) ──────────────────

  @Auth(ValidRoles.superAdmin)
  @Patch(':id/subscription')
  updateSubscription(
    @GetUser() user: any,
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.empresaService.updateSubscription(id, dto, user.id);
  }

  @Auth(ValidRoles.superAdmin)
  @Post(':id/suspend')
  suspendEmpresa(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: SuspendEmpresaDto,
  ) {
    return this.empresaService.suspendEmpresa(
      id,
      dto.reason ?? AccessSuspendedReason.PAYMENT,
    );
  }

  @Auth(ValidRoles.superAdmin)
  @Post(':id/unsuspend')
  unsuspendEmpresa(
    @Param('id', ParseMongoIdPipe) id: string,
    @Query('markPaid') markPaid?: string,
  ) {
    const paid =
      markPaid === '1' || markPaid === 'true' || markPaid === 'yes';
    return this.empresaService.unsuspendEmpresa(id, paid);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Patch(':id/mora-config')
  updateMoraConfig(
    @GetUser() user: any,
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateMoraConfigDto,
  ) {
    this.empresaService.assertCanAccessEmpresa(user, id);
    return this.empresaService.updateMoraConfig(id, dto);
  }

  /**
   * Detalle de empresa por id.
   * SUPERADMIN no tiene user.empresa: no hacer toString() sobre ella.
   */
  @Auth()
  @Get(':id')
  findById(
    @GetUser() user: any,
    @Param('id', ParseMongoIdPipe) id: string,
  ) {
    this.empresaService.assertCanAccessEmpresa(user, id);
    return this.empresaService.getEmpresaById(id);
  }

  @Auth(ValidRoles.superAdmin)
  @Delete(':id')
  remove(@Param('id', ParseMongoIdPipe) id: string) {
    return this.empresaService.remove(id);
  }
}
