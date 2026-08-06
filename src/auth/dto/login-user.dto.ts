import { IsBoolean, IsOptional, IsString } from "class-validator";

export class LoginDto {
   
   @IsString()
   username: string;

   @IsString()
   password: string;

   /** Si true, revoca la sesión WS viva y crea una nueva (mismo usuario). */
   @IsOptional()
   @IsBoolean()
   force?: boolean;

}
