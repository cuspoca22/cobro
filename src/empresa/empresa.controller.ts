import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { EmpresaService } from './empresa.service';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { Auth, GetUser } from 'src/auth/decorators';
import { ValidRoles } from 'src/auth/interfaces';
import { CreateUserDto } from 'src/auth/dto';
import { ToUpperCasePipe } from '../common/pipes/to-upper-case.pipe';
import { CreateRutaDto } from '../ruta/dto/create-ruta.dto';

@Controller('empresa')
export class EmpresaController {
  constructor(private readonly empresaService: EmpresaService) {}

  @Auth()
  @Post()
  create(@Body() createEmpresaDto: CreateEmpresaDto) {
    return this.empresaService.create(createEmpresaDto);
  }

  // ! TRAE LOS EMPLEADOS SEGUN LA EMPRESA
  @Auth()
  @Get('get-empleados')
  findAll(
    @Query('empresa', ParseMongoIdPipe) empresa: string
  ) {
    return this.empresaService.findAll(empresa);
  }

  @Get('get-open-rutas')
  findEmpresaWithRutasOpened(){
    return this.empresaService.findEmpresaWithRutasOpened()
  }

  @Auth()
  @Get()
  findOne(
    @GetUser() user: any,
  ) {
    let { empresa } = user;
    empresa = empresa.toString();

    return this.empresaService.findRutasByEmpresa(empresa);

  }

  @Auth()
  @Get('all')
  findAllEmpresas(){
    return this.empresaService.getAllEmpresas();
  }

  @Auth()
  @Get(':id')
  findById(
    @GetUser() user: any,
    @Param('id', ParseMongoIdPipe) id: string, 
  ) {
    
    let { empresa } = user;
    empresa = empresa.toString();

    return this.empresaService.getEmpresaById(id);

  }

  @Auth()
  @Patch('update/:id')
  update(
    @Param('id', ParseMongoIdPipe) id: string, 
    @Body() updateEmpresaDto: UpdateEmpresaDto
  ) {
    return this.empresaService.update(id, updateEmpresaDto);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Post('add-empleado')
  addEmploye(
    @Body() userDto: CreateUserDto,
  ){
    return this.empresaService.addEmploye(userDto);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Delete('remove-empleado')
  removeEmploye(
    @Query('empresa', ParseMongoIdPipe) empresa: string,
    @Query('empleado', ParseMongoIdPipe) empleado: string
  ){
    return this.empresaService.deleteEmpleado(empresa, empleado);
  }

  @Auth(ValidRoles.admin, ValidRoles.superAdmin)
  @Patch('add-ruta')
  addRuta(
    @Query('empresa', ParseMongoIdPipe) empresaID: string,
    @Body() rutaDto: CreateRutaDto,
  ) {
    return this.empresaService.addRuta(empresaID, rutaDto)
  }

  @Auth()
  @Patch('add-owner')
  addOwner(
    @Query('empresa', ParseMongoIdPipe) empresa: string,
    @Query('user', ParseMongoIdPipe) user: string,
  ) {
    return this.empresaService.addOwner(empresa, user);
  }

  @Auth()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.empresaService.remove(+id);
  }

  //cierres y aperturas de rutas
  // @Auth()
  @Get('ruta/openorclose/:idEmpresa/:idRuta')
  openOrCloseRuta(
    @Param('idEmpresa', ParseMongoIdPipe) idEmpresa: string,
    @Param('idRuta', ParseMongoIdPipe) idRuta: string,
    @Query('action', ToUpperCasePipe) action: string,
  ){
    return true;
  }
}
