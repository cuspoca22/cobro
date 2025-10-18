import { UserEntity } from '../entities/user.entity';

export interface LoginResponse {
   user: UserEntity,
   token: string
}