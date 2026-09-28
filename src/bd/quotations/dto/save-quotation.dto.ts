import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Uom } from '../../../common/enums/inspection.enum.js';
import {
  MAX_LINES,
  MAX_QUANTITY,
  MAX_TEXT,
} from '../../inspections/inspection.constants.js';
import {
  MAX_GST_PERCENT,
  MAX_PRICE,
  MAX_TERMS,
} from '../quotation.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * One quotation row. For an Onsite inspection only `id` and `unitPrice` matter (the material,
 * unit and quantity come from the inspection); for a Virtual one the whole row is typed by BD.
 */
export class QuotationLineDto {
  @IsOptional()
  @IsMongoId({ message: 'Invalid line id' })
  id?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_TEXT, {
    message: `Material name must be ${MAX_TEXT} characters or fewer`,
  })
  @IsString()
  materialName?: string;

  @IsOptional()
  @IsEnum(Uom, { message: 'Select Lots, Numbers or Kilograms' })
  uom?: Uom;

  @IsOptional()
  @Max(MAX_QUANTITY, { message: 'Quantity is too large' })
  @Min(0, { message: 'Quantity cannot be negative' })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'Enter a number (up to 3 decimal places)' },
  )
  quantity?: number;

  @IsOptional()
  @Max(MAX_PRICE, { message: 'Unit price is too large' })
  @Min(0, { message: 'Unit price cannot be negative' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Enter an amount (up to 2 decimal places)' },
  )
  unitPrice?: number | null;
}

export class SaveQuotationDto {
  @ValidateNested({ each: true })
  @Type(() => QuotationLineDto)
  @ArrayMaxSize(MAX_LINES, {
    message: `A quotation can have at most ${MAX_LINES} rows`,
  })
  @IsArray()
  lines!: QuotationLineDto[];

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_TERMS, {
    message: `Terms must be ${MAX_TERMS} characters or fewer`,
  })
  @IsString()
  terms?: string;

  /** Optional; null removes GST from the quotation, omitted keeps the saved rate. */
  @IsOptional()
  @Max(MAX_GST_PERCENT, { message: 'GST cannot be more than 100%' })
  @Min(0, { message: 'GST cannot be negative' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Enter a GST percentage (up to 2 decimal places)' },
  )
  gstPercent?: number | null;
}
