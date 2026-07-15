import { Injectable, Logger } from '@nestjs/common';
import { CreatePruebaDto } from './dto/create-prueba.dto';
import { UpdatePruebaDto } from './dto/update-prueba.dto';
import { RutaService } from '../ruta/ruta.service';
import { CreditCalculatorService } from 'src/credito/helpers/credit.calculator.service';

@Injectable()
export class PruebasService {

  private logger = new Logger("Migration:AddDueDate");

  constructor(
    private readonly rutaSvc: RutaService,
    private creditCalculatorService: CreditCalculatorService
  ) { }

  create(createPruebaDto: CreatePruebaDto) {
    return 'This action adds a new prueba';
  }

  async findAll(ruta: string) {
   
  }

  findOne(id: number) {
    return `This action returns a #${id} prueba`;
  }

  update(id: number, updatePruebaDto: UpdatePruebaDto) {
    return `This action updates a #${id} prueba`;
  }

  remove(id: number) {
    return `This action removes a #${id} prueba`;
  }

}
