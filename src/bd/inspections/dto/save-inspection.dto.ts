import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_EXPENSE,
  MAX_LINES,
  MAX_QUANTITY,
  MAX_REMARKS,
  MAX_TEXT,
} from '../inspection.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Decorators run bottom-up: the "required" check is listed last so it reports first.
export class InspectionLineDto {
  /** Present for rows that already exist, so line ids stay stable across saves. */
  @IsOptional()
  @IsMongoId({ message: 'Invalid line id' })
  id?: string;

  @Transform(trim)
  @MaxLength(MAX_TEXT, {
    message: `Material name must be ${MAX_TEXT} characters or fewer`,
  })
  @IsString()
  @IsNotEmpty({ message: 'Material name is required' })
  materialName!: string;

  @Transform(trim)
  @MaxLength(30, { message: 'Unit must be 30 characters or fewer' })
  @IsString()
  @IsNotEmpty({ message: 'Select a unit of measure' })
  uom!: string;

  @Max(MAX_QUANTITY, { message: 'Quantity is too large' })
  @Min(0, { message: 'Quantity cannot be negative' })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Enter a number (up to 3 decimal places)' },
  )
  @IsNotEmpty({ message: 'Client quantity is required' })
  clientQuantity!: number;

  @IsOptional()
  @Max(MAX_QUANTITY, { message: 'Quantity is too large' })
  @Min(0, { message: 'Quantity cannot be negative' })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Enter a number (up to 3 decimal places)' },
  )
  inspectedQuantity?: number | null;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_REMARKS, {
    message: `Remarks must be ${MAX_REMARKS} characters or fewer`,
  })
  @IsString()
  remarks?: string;
}

export class SaveInspectionDto {
  @ValidateNested({ each: true })
  @Type(() => InspectionLineDto)
  @ArrayMaxSize(MAX_LINES, {
    message: `An inspection list can have at most ${MAX_LINES} rows`,
  })
  @IsArray()
  lines!: InspectionLineDto[];

  @IsBoolean()
  acknowledged!: boolean;

  @IsOptional()
  @Max(MAX_EXPENSE, { message: 'Expense is too large' })
  @Min(0, { message: 'Expense cannot be negative' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Enter an amount (up to 2 decimal places)' },
  )
  expenseTotal?: number | null;
}
