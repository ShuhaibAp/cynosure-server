import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrderRequestDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @MaxLength(1000, { message: 'Note must be 1000 characters or fewer' })
  @IsString()
  note?: string;
}
