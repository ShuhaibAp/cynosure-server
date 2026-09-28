import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ClientDecision } from '../../../common/enums/client-decision.enum.js';
import { MAX_NOTE } from '../quotation.constants.js';

export class ClientResponseDto {
  @IsEnum(ClientDecision, { message: "Select the client's decision" })
  decision!: ClientDecision;

  // Required only for a Rejected decision; the service checks that (a single
  // conditional field is awkward to express as a class-validator decorator).
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
