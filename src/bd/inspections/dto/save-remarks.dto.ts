import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_LINES, MAX_REMARKS } from '../inspection.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class LineRemarkDto {
  @IsMongoId({ message: 'Invalid line id' })
  @IsNotEmpty({ message: 'Line id is required' })
  id!: string;

  @Transform(trim)
  @MaxLength(MAX_REMARKS, {
    message: `Remarks must be ${MAX_REMARKS} characters or fewer`,
  })
  @IsString()
  remarks!: string;
}

export class SaveRemarksDto {
  @ValidateNested({ each: true })
  @Type(() => LineRemarkDto)
  @ArrayMaxSize(MAX_LINES)
  @IsArray()
  lines!: LineRemarkDto[];
}
