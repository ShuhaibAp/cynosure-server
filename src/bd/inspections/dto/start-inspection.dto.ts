import { IsEnum, IsNotEmpty } from 'class-validator';
import { InspectionType } from '../../../common/enums/inspection.enum.js';

export class StartInspectionDto {
  @IsEnum(InspectionType, { message: 'Choose Onsite or Virtual inspection' })
  @IsNotEmpty({ message: 'Choose Onsite or Virtual inspection' })
  type!: InspectionType;
}
