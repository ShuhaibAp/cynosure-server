import { BadRequestException, Injectable } from '@nestjs/common';
import { extractRawText } from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { decodeName } from '../../common/files/po-files.service.js';

export interface TermsText {
  text: string;
  fileName: string;
}

const NO_TEXT =
  'No readable text was found in this file. A scanned or image-only file cannot be read - type the terms instead, or upload a text-based PDF or Word file.';

/** Tidies extracted text: unix newlines, no page markers/control characters, at most one blank line in a row. */
function tidy(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/^-- \d+ of \d+ --$/gm, '')
    .replace(/[^\P{Cc}\n\t]/gu, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

@Injectable()
export class TermsReaderService {
  /** Reads a PDF, Word (.docx) or plain-text file, checking the content itself and not just the name. */
  async read(file: Express.Multer.File | undefined): Promise<TermsText> {
    if (!file)
      throw new BadRequestException('Choose a file to read the terms from.');
    const fileName = decodeName(file.originalname);
    const ext = fileName.includes('.')
      ? fileName.split('.').pop()!.toLowerCase()
      : '';
    const buf = file.buffer;

    let raw: string;
    if (ext === 'pdf') {
      if (buf.subarray(0, 4).toString('latin1') !== '%PDF') {
        throw new BadRequestException(`"${fileName}" is not a valid PDF file.`);
      }
      raw = await this.readPdf(buf, fileName);
    } else if (ext === 'docx') {
      if (buf.length < 4 || buf.readUInt32BE(0) !== 0x504b0304) {
        throw new BadRequestException(
          `"${fileName}" is not a valid Word (.docx) file.`,
        );
      }
      raw = await this.readDocx(buf, fileName);
    } else if (ext === 'txt') {
      if (buf.includes(0)) {
        throw new BadRequestException(
          `"${fileName}" is not a plain-text file.`,
        );
      }
      raw = buf.toString('utf8');
    } else {
      throw new BadRequestException(
        `"${fileName}" is not supported. Upload a PDF, Word (.docx) or text (.txt) file.`,
      );
    }

    const text = tidy(raw);
    if (!text) throw new BadRequestException(NO_TEXT);
    return { text, fileName };
  }

  private async readPdf(buf: Buffer, fileName: string): Promise<string> {
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      return (await parser.getText()).text;
    } catch {
      throw new BadRequestException(
        `"${fileName}" could not be read. It may be damaged or password-protected.`,
      );
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  private async readDocx(buf: Buffer, fileName: string): Promise<string> {
    try {
      return (await extractRawText({ buffer: buf })).value;
    } catch {
      throw new BadRequestException(
        `"${fileName}" could not be read. It may be damaged or not a real Word file.`,
      );
    }
  }
}
