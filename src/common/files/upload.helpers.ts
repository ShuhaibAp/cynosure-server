import { NotFoundException, StreamableFile } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { MAX_FILE_BYTES, MAX_FILES_PER_REQUEST } from './po-files.service.js';

/** Multipart interceptor for several files under one form field (kept in memory for validation). */
export const uploadMany = (field: string) =>
  FilesInterceptor(field, MAX_FILES_PER_REQUEST, {
    limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_REQUEST },
  });

/** Multipart interceptor for a single file with its own size cap. */
export const uploadOne = (field: string, maxBytes: number) =>
  FileInterceptor(field, { limits: { fileSize: maxBytes, files: 1 } });

/** Streams a stored file back inline with safe headers. */
export async function streamStoredFile(
  res: Response,
  file: { path: string; name: string; mimeType: string },
) {
  try {
    await access(file.path);
  } catch {
    throw new NotFoundException('File is missing');
  }
  res.set({
    'Content-Type': file.mimeType,
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'X-Content-Type-Options': 'nosniff',
  });
  return new StreamableFile(createReadStream(file.path));
}
