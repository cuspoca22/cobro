import { Expose } from "class-transformer";
import { GetUserDto } from './';

export class LoginResponseDto {

  @Expose()
  token: string;

  @Expose()
  user: GetUserDto

}