import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Sent alongside the file. With no mapping fields at all, the server returns a preview + a
 * suggested mapping ("sniff mode"). Once the BD user confirms/fixes the mapping in the modal,
 * the same endpoint is called again with these fields set ("import mode") to actually produce
 * rows. `-1` for a *Col field means "not mapped to anything in this file"; `headerRow` of `-1`
 * means "no header row, data starts at the first row" - both arrive as plain form fields
 * (multipart bodies carry strings), hence the numeric coercion.
 */
export class ImportListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  headerRow?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  materialNameCol?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  uomCol?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  clientQuantityCol?: number;

  /** True once the mapping has been confirmed - distinguishes "confirm with nothing mapped" from "sniff". */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  confirmed?: number;
}
