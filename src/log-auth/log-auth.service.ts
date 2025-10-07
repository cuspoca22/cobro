import { Injectable } from '@nestjs/common';
import { CreateLogAuthDto } from './dto/create-log-auth.dto';
import { UpdateLogAuthDto } from './dto/update-log-auth.dto';

@Injectable()
export class LogAuthService {
  create(createLogAuthDto: CreateLogAuthDto) {
    return 'This action adds a new logAuth';
  }

  findAll() {
    return `This action returns all logAuth`;
  }

  findOne(id: number) {
    return `This action returns a #${id} logAuth`;
  }

  update(id: number, updateLogAuthDto: UpdateLogAuthDto) {
    return `This action updates a #${id} logAuth`;
  }

  remove(id: number) {
    return `This action removes a #${id} logAuth`;
  }
}
