import { PartialType } from '@nestjs/mapped-types';
import { CreateLogAuthDto } from './create-log-auth.dto';

export class UpdateLogAuthDto extends PartialType(CreateLogAuthDto) {}
