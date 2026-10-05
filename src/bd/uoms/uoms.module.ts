import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../common/auth/auth.module.js';
import { UomOption, UomOptionSchema } from './schemas/uom-option.schema.js';
import { UomsController } from './uoms.controller.js';
import { UomsService } from './uoms.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UomOption.name, schema: UomOptionSchema },
    ]),
    AuthModule,
  ],
  controllers: [UomsController],
  providers: [UomsService],
  exports: [UomsService],
})
export class UomsModule {}
