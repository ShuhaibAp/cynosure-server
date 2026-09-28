import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_NOTE } from '../quotation.constants.js';

export class ReturnQuotationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @MaxLength(MAX_NOTE, {
    message: `The note must be ${MAX_NOTE} characters or fewer`,
  })
  @IsString()
  note?: string;
}
