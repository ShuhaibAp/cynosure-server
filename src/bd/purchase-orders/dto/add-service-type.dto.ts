import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AddServiceTypeDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @MaxLength(60, { message: 'PO type must be 60 characters or fewer' })
  @IsString()
  @IsNotEmpty({ message: 'PO type is required' })
  name!: string;
}
