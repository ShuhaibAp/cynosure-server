import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ServiceType } from '../../../common/enums/service-type.enum.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const toArray = ({ value }: { value: unknown }) =>
  value === undefined || value === ''
    ? undefined
    : Array.isArray(value)
      ? value
      : [value];

// Same rules as create, but every field is optional (PATCH). Decorators run bottom-up.
export class UpdatePurchaseOrderDto {
  @Transform(trim)
  @IsOptional()
  @MaxLength(200, { message: 'Customer name must be 200 characters or fewer' })
  @IsString()
  @IsNotEmpty({ message: 'Customer name is required' })
  customerName?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(500, { message: 'Address must be 500 characters or fewer' })
  @IsString()
  @IsNotEmpty({ message: 'Address is required' })
  address?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(30, { message: 'Phone number must be 30 characters or fewer' })
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  phone?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(254, { message: 'Email address is too long' })
  @IsEmail({}, { message: 'Enter a valid email address' })
  @IsNotEmpty({ message: 'Email address is required' })
  email?: string;

  @IsOptional()
  @IsEnum(ServiceType, { message: 'Select a valid service type' })
  serviceType?: ServiceType;

  @Transform(trim)
  @IsOptional()
  @MaxLength(5000, {
    message: 'PO instructions must be 5000 characters or fewer',
  })
  @IsString()
  poInstructions?: string;

  @Transform(toArray)
  @IsOptional()
  @IsMongoId({ each: true, message: 'Invalid document id' })
  @IsArray()
  removeDocumentIds?: string[];
}
