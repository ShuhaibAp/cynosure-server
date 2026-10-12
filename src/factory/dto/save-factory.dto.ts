import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
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
  MAX_QUANTITY,
  MAX_REMARKS,
  MAX_TEARDOWN_ROWS,
  MAX_TEXT,
} from '../factory.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Every field is optional: Factory saves a partial draft and comes back to it. complete()
// enforces what is actually required before the PO can move on.
export class FactoryLineInputDto {
  @IsMongoId({ message: 'Invalid line id' })
  id!: string;

  @IsOptional()
  @Max(MAX_QUANTITY, { message: 'Processed Quantity is too large' })
  @Min(0, { message: 'Processed Quantity cannot be negative' })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Enter a number (up to 3 decimal places)' },
  )
  processedQuantity?: number | null;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_REMARKS, {
    message: `Remarks must be ${MAX_REMARKS} characters or fewer`,
  })
  @IsString()
  remarks?: string;
}

export class SaveFactoryDto {
  @IsOptional()
  @Max(MAX_QUANTITY, { message: 'Empty Weight is too large' })
  @Min(0, { message: 'Empty Weight cannot be negative' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Enter a weight in kg (up to 2 decimal places)' },
  )
  weighmentEmptyKg?: number;

  @IsOptional()
  @Max(MAX_QUANTITY, { message: 'Loaded Weight is too large' })
  @Min(0, { message: 'Loaded Weight cannot be negative' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Enter a weight in kg (up to 2 decimal places)' },
  )
  weighmentLoadedKg?: number;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => FactoryLineInputDto)
  @IsArray()
  lines?: FactoryLineInputDto[];
}

export class TeardownEntryInputDto {
  @Transform(trim)
  @MaxLength(MAX_TEXT, {
    message: `Component name must be ${MAX_TEXT} characters or fewer`,
  })
  @IsString()
  @IsNotEmpty({ message: 'Component name is required' })
  componentName!: string;

  @Max(MAX_QUANTITY, { message: 'Quantity is too large' })
  @Min(0, { message: 'Quantity cannot be negative' })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Enter a number (up to 3 decimal places)' },
  )
  quantity!: number;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_TEXT, {
    message: `Condition must be ${MAX_TEXT} characters or fewer`,
  })
  @IsString()
  condition?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Enter a valid date' })
  date?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_TEXT, {
    message: `Technician must be ${MAX_TEXT} characters or fewer`,
  })
  @IsString()
  technician?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_REMARKS, {
    message: `Remarks must be ${MAX_REMARKS} characters or fewer`,
  })
  @IsString()
  remarks?: string;
}

// The whole log is replaced on every save, like the Operations expense tables.
export class SaveTeardownLogDto {
  @ValidateNested({ each: true })
  @Type(() => TeardownEntryInputDto)
  @ArrayMaxSize(MAX_TEARDOWN_ROWS, {
    message: `The Teardown Log can have at most ${MAX_TEARDOWN_ROWS} rows`,
  })
  @IsArray()
  entries!: TeardownEntryInputDto[];
}
