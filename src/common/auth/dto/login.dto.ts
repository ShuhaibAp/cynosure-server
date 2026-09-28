import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Role } from '../../enums/role.enum.js';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  // Which of the account's roles to act as for this session - an account can hold more than one.
  @IsEnum(Role)
  role!: Role;
}
