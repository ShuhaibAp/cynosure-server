import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListAuditDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @Transform(trim)
  @IsOptional()
  @MaxLength(40)
  @IsString()
  poNumber?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(60)
  @IsString()
  action?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(100)
  @IsString()
  actor?: string;

  @Transform(trim)
  @IsOptional()
  @MaxLength(40)
  @IsString()
  role?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
