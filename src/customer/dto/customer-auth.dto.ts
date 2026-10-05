import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class TokenQueryDto {
  @IsString()
  @IsNotEmpty({ message: 'This link is invalid or has expired.' })
  @MaxLength(200)
  token!: string;
}

export class SetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'This link is invalid or has expired.' })
  @MaxLength(200)
  token!: string;

  @MaxLength(128, { message: 'Password must be 128 characters or fewer' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @IsString()
  password!: string;
}

export class ForgotPasswordDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail({}, { message: 'Enter a valid email address' })
  email!: string;
}
