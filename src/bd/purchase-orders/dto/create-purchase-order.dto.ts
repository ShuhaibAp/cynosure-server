import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Decorators run bottom-up: the "required" check is listed last so it reports first.
export class CreatePurchaseOrderDto {
  @Transform(trim)
  @MaxLength(200, { message: 'Customer name must be 200 characters or fewer' })
  @IsString()
  @IsNotEmpty({ message: 'Customer name is required' })
  customerName!: string;

  @Transform(trim)
  @MaxLength(500, { message: 'Address must be 500 characters or fewer' })
  @IsString()
  @IsNotEmpty({ message: 'Address is required' })
  address!: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(200, { message: 'Location must be 200 characters or fewer' })
  @IsString()
  location?: string;

  @Transform(trim)
  @MaxLength(30, { message: 'Phone number must be 30 characters or fewer' })
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  phone!: string;

  @Transform(trim)
  @MaxLength(254, { message: 'Email address is too long' })
  @IsEmail({}, { message: 'Enter a valid email address' })
  @IsNotEmpty({ message: 'Email address is required' })
  email!: string;

  @Transform(trim)
  @MaxLength(60, { message: 'Service type must be 60 characters or fewer' })
  @IsString()
  @IsNotEmpty({ message: 'Service type is required' })
  serviceType!: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(5000, {
    message: 'PO instructions must be 5000 characters or fewer',
  })
  @IsString()
  poInstructions?: string;

  // Set when BD picks a returning customer: their record is reused instead of a new one.
  @IsOptional()
  @IsMongoId({ message: 'Choose a valid customer' })
  existingCustomerId?: string;

  // Set when the PO is created from a customer-app order request.
  @IsOptional()
  @IsMongoId()
  orderRequestId?: string;
}
