import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_QUANTITY,
  MAX_REMARKS,
  MAX_TEXT,
} from '../operations.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Every field is optional: Operations saves a partial draft and comes back to it. complete()
// enforces which fields are actually required before the PO can move on to Weighment.
export class OperationsLineInputDto {
  @IsMongoId({ message: 'Invalid line id' })
  id!: string;

  @IsOptional()
  @Max(MAX_QUANTITY, { message: 'Actual Quantity is too large' })
  @Min(0, { message: 'Actual Quantity cannot be negative' })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Enter a number (up to 3 decimal places)' },
  )
  actualQuantity?: number | null;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_REMARKS, {
    message: `Remarks must be ${MAX_REMARKS} characters or fewer`,
  })
  @IsString()
  remarks?: string;
}

export class SaveOperationsDto {
  @IsOptional()
  @IsBoolean()
  acknowledged?: boolean;

  @IsOptional()
  @IsISO8601({}, { message: 'Enter a valid pickup date' })
  pickupDate?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_TEXT)
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Enter a valid invoice date' })
  invoiceDate?: string;

  @IsOptional()
  @Max(MAX_QUANTITY, { message: 'Invoice Amount is too large' })
  @Min(0, { message: 'Invoice Amount cannot be negative' })
  @IsNumber({ maxDecimalPlaces: 2 })
  invoiceAmount?: number | null;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_TEXT)
  @IsString()
  ewayBillNumber?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_TEXT)
  @IsString()
  form6Number?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_TEXT)
  @IsString()
  lrNumber?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_TEXT)
  @IsString()
  mplNumber?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_TEXT)
  @IsString()
  vehicleNumber?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_TEXT)
  @IsString()
  weighmentSlipEmptyNumber?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_TEXT)
  @IsString()
  weighmentSlipLoadNumber?: string;

  @IsOptional()
  @Max(MAX_QUANTITY, { message: 'Empty Weight is too large' })
  @Min(0, { message: 'Empty Weight cannot be negative' })
  @IsNumber({ maxDecimalPlaces: 2 })
  weighmentEmptyKg?: number | null;

  @IsOptional()
  @Max(MAX_QUANTITY, { message: 'Loaded Weight is too large' })
  @Min(0, { message: 'Loaded Weight cannot be negative' })
  @IsNumber({ maxDecimalPlaces: 2 })
  weighmentLoadedKg?: number | null;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_TEXT)
  @IsString()
  padlockSerialNumber?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OperationsLineInputDto)
  lines?: OperationsLineInputDto[];
}
