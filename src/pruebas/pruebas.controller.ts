import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseIntPipe } from '@nestjs/common';
import { PruebasService } from './pruebas.service';
import { CreatePruebaDto } from './dto/create-prueba.dto';
import { UpdatePruebaDto } from './dto/update-prueba.dto';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';

@Controller('pruebas')
export class PruebasController {
  constructor(private readonly pruebasService: PruebasService) {}

  @Post()
  create(@Body() createPruebaDto: CreatePruebaDto) {
    return this.pruebasService.create(createPruebaDto);
  }

  @Get('getCartera')
  async findAll(
    @Query('ruta', ParseMongoIdPipe) ruta: string
  ) {
    return this.pruebasService.findAll(ruta);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pruebasService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePruebaDto: UpdatePruebaDto) {
    return this.pruebasService.update(+id, updatePruebaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pruebasService.remove(+id);
  }

  // @Get('migrations/add-due-date')
  // migrationsAddDueDate() {
  //   return this.pruebasService.migrationsAddDueDate();
  // }
}
