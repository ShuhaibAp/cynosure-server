import { Module } from '@nestjs/common';
import { PoFilesService } from './po-files.service.js';

@Module({
  providers: [PoFilesService],
  exports: [PoFilesService],
})
export class FilesModule {}
