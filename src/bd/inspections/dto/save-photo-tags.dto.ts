import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_PHOTO_LABEL } from '../inspection.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** One photo's tag: a listed material (`lineId`) or a typed name (`label`), never both. */
export class PhotoTagDto {
  @IsMongoId({ message: 'Invalid photo id' })
  @IsNotEmpty({ message: 'Photo id is required' })
  id!: string;

  @IsOptional()
  @IsMongoId({ message: 'Invalid material id' })
  lineId?: string | null;

  @Transform(trim)
  @IsOptional()
  @MaxLength(MAX_PHOTO_LABEL, {
    message: `A photo name must be ${MAX_PHOTO_LABEL} characters or fewer`,
  })
  @IsString()
  label?: string;
}

export class SavePhotoTagsDto {
  @ValidateNested({ each: true })
  @Type(() => PhotoTagDto)
  @ArrayMaxSize(200)
  @IsArray()
  photos!: PhotoTagDto[];
}
