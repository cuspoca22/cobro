import { IsBoolean } from 'class-validator';

export class SetClienteStateDto {
  @IsBoolean()
  state: boolean;
}
