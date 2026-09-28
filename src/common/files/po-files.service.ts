import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 10;

/** Where a file lives under a PO: `uploads/purchase-orders/<poNumber>/<folder>/`. */
export type FileFolder =
  'documents' | 'inspection' | 'quotation' | 'operations';

/** attachment = PDF, JPG or PNG; photo = JPG or PNG only. */
export type FileKind = 'attachment' | 'photo';

const KINDS: Record<FileKind, { extensions: Set<string>; label: string }> = {
  attachment: {
    extensions: new Set(['pdf', 'jpg', 'jpeg', 'png']),
    label: 'PDF, JPG or PNG',
  },
  photo: { extensions: new Set(['jpg', 'jpeg', 'png']), label: 'JPG or PNG' },
};

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function detectType(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') {
    return { ext: 'pdf', mime: 'application/pdf' };
  }
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { ext: 'png', mime: 'image/png' };
  }
  return null;
}

export interface PreparedFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  ext: string;
  size: number;
}

export interface SavedFile {
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class PoFilesService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(
      config.get<string>('UPLOADS_DIR', './uploads'),
      'purchase-orders',
    );
  }

  /** Validates by file content (not just the claimed type) and normalises the name. */
  prepare(
    files: Express.Multer.File[] = [],
    kind: FileKind = 'attachment',
  ): PreparedFile[] {
    const { extensions, label } = KINDS[kind];
    return files.map((file) => {
      const originalName = decodeName(file.originalname);
      const claimedExt = originalName.includes('.')
        ? originalName.split('.').pop()!.toLowerCase()
        : '';

      if (!extensions.has(claimedExt)) {
        throw new BadRequestException(
          `"${originalName}" is not allowed. Only ${label} files can be uploaded.`,
        );
      }
      const detected = detectType(file.buffer);
      if (!detected || !extensions.has(detected.ext)) {
        throw new BadRequestException(
          `"${originalName}" is not a valid ${label} file.`,
        );
      }
      return {
        buffer: file.buffer,
        originalName,
        mimeType: detected.mime,
        ext: detected.ext,
        size: file.size,
      };
    });
  }

  async save(
    poNumber: string,
    folder: FileFolder,
    files: PreparedFile[],
  ): Promise<SavedFile[]> {
    if (files.length === 0) return [];
    const dir = this.dirFor(poNumber, folder);
    await mkdir(dir, { recursive: true });
    const saved: SavedFile[] = [];
    for (const file of files) {
      const storedName = `${randomUUID()}.${file.ext}`;
      await writeFile(join(dir, storedName), file.buffer);
      saved.push({
        originalName: file.originalName,
        storedName,
        mimeType: file.mimeType,
        size: file.size,
      });
    }
    return saved;
  }

  remove(poNumber: string, folder: FileFolder, storedName: string) {
    return rm(this.pathFor(poNumber, folder, storedName), { force: true });
  }

  removeAll(poNumber: string) {
    const dir = resolve(this.root, poNumber);
    if (!dir.startsWith(this.root + sep)) throw new NotFoundException();
    return rm(dir, { recursive: true, force: true });
  }

  pathFor(poNumber: string, folder: FileFolder, storedName: string): string {
    const dir = this.dirFor(poNumber, folder);
    const full = resolve(dir, storedName);
    if (!full.startsWith(dir + sep)) throw new NotFoundException();
    return full;
  }

  private dirFor(poNumber: string, folder: FileFolder): string {
    const dir = resolve(this.root, poNumber, folder);
    if (!dir.startsWith(this.root + sep)) throw new NotFoundException();
    return dir;
  }
}

/** busboy hands multipart filenames over as latin1; recover the real UTF-8 name. */
export function decodeName(raw: string): string {
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  return decoded.split(/[\\/]/).pop()!.slice(0, 200) || 'file';
}
