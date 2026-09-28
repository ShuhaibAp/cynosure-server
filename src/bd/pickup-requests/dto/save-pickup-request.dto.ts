import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Every field is optional: BD can save a partial draft and come back to it. generate() is
// what enforces which fields are actually required before the report can be produced.
export class SavePickupRequestDto {
  @Transform(trim)
  @IsOptional()
  @IsISO8601({}, { message: 'Enter a valid collection date and time' })
  collectionDateTime?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(120, {
    message: 'Point of contact name must be 120 characters or fewer',
  })
  @IsString()
  contactName?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(30, { message: 'Phone number must be 30 characters or fewer' })
  @IsString()
  contactPhone?: string;

  // Writes back to PurchaseOrder.poInstructions (FR-05.03) - not stored on this doc.
  @Transform(trim)
  @IsOptional()
  @MaxLength(5000, {
    message: 'PO instructions must be 5000 characters or fewer',
  })
  @IsString()
  poInstructions?: string;
}
