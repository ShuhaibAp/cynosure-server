import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_AMOUNT,
  MAX_EXPENSE_LINES,
  MAX_TEXT,
} from '../operations.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ExpenseLineInputDto {
  @Transform(trim)
  @MaxLength(MAX_TEXT, {
    message: `Description must be ${MAX_TEXT} characters or fewer`,
  })
  @IsString()
  @IsNotEmpty({ message: 'Description is required' })
  description!: string;

  @Max(MAX_AMOUNT, { message: 'Amount is too large' })
  @Min(0, { message: 'Amount cannot be negative' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Enter an amount (up to 2 decimal places)' },
  )
  amount!: number;
}

// Used for both collection and logistics expenses (BR-06.02: two independent tables, never
// merged - the controller routes each to its own array, this DTO just shapes one array).
export class SaveExpensesDto {
  @ValidateNested({ each: true })
  @Type(() => ExpenseLineInputDto)
  @ArrayMaxSize(MAX_EXPENSE_LINES, {
    message: `An expense table can have at most ${MAX_EXPENSE_LINES} rows`,
  })
  @IsArray()
  lines!: ExpenseLineInputDto[];
}
