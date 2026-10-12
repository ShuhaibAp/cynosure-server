import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../../common/enums/role.enum.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Roles an Admin can hand out. Customers get theirs through the customer-app invite. */
export const STAFF_ROLES = [
  Role.BdTeam,
  Role.Operations,
  Role.Factory,
  Role.Admin,
] as const;

// Decorators run bottom-up: the "required" check is listed last so it reports first.
export class CreateUserDto {
  @Transform(trim)
  @MaxLength(100, { message: 'Name must be 100 characters or fewer' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name!: string;

  @Transform(trim)
  @MaxLength(254, { message: 'Email address is too long' })
  @IsEmail({}, { message: 'Enter a valid email address' })
  @IsNotEmpty({ message: 'Email address is required' })
  email!: string;

  @ArrayMaxSize(STAFF_ROLES.length)
  @ArrayUnique({ message: 'Each role can only be picked once' })
  @IsEnum(STAFF_ROLES, {
    each: true,
    message: 'Pick BD Team, Operations Team, Factory Team or Admin',
  })
  @ArrayMinSize(1, { message: 'Pick at least one role' })
  @IsArray({ message: 'Pick at least one role' })
  roles!: Role[];

  @MaxLength(128, { message: 'Password must be 128 characters or fewer' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @IsString()
  password!: string;
}

export class UpdateUserDto {
  @Transform(trim)
  @IsOptional()
  @MaxLength(100, { message: 'Name must be 100 characters or fewer' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name?: string;

  @IsOptional()
  @ArrayMaxSize(STAFF_ROLES.length)
  @ArrayUnique({ message: 'Each role can only be picked once' })
  @IsEnum(STAFF_ROLES, {
    each: true,
    message: 'Pick BD Team, Operations Team, Factory Team or Admin',
  })
  @ArrayMinSize(1, { message: 'Pick at least one role' })
  @IsArray({ message: 'Pick at least one role' })
  roles?: Role[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ResetPasswordDto {
  @MaxLength(128, { message: 'Password must be 128 characters or fewer' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @IsString()
  password!: string;
}
