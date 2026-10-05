import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AddUomDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @MaxLength(30, { message: 'Unit must be 30 characters or fewer' })
  @IsString()
  @IsNotEmpty({ message: 'Unit is required' })
  name!: string;
}
