import { Expose } from "class-transformer";
import { UserEntity } from "../entities/user.entity";

export class LoginResponseDto {

  @Expose()
  token: string;

  @Expose()
  user: UserEntity

}