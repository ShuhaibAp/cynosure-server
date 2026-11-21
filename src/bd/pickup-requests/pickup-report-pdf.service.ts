import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import PDFDocument from 'pdfkit';

export interface PickupReportPdfData {
  poNumber: string;
  serviceType: string;
  poInstructions: string;
  customer: { name: string; address: string; phone: string; email: string };
  lines: Array<{ materialName: string; uom: string; quantity: number }>;
  collectionDateTime: Date | null;
  contactName: string;
  contactPhone: string;
  generatedAt: Date | null;
  /** Already-loaded image buffers; a photo whose file could not be read is simply skipped. */
  photos: Array<{ buffer: Buffer; caption: string }>;
}

const MARGIN = 48;
const BRAND = '#B44B14';
const INK = '#1F2020';
const MUTED = '#62615D';
const RULE = '#E2E0DC';
const COLUMNS = [
  { key: 'no', label: '#', width: 30, align: 'left' },
  { key: 'material', label: 'Material', width: 260, align: 'left' },
  { key: 'uom', label: 'UoM', width: 100, align: 'left' },
  { key: 'qty', label: 'Inspected Quantity', width: 105, align: 'right' },
] as const;
const CELL_PAD = 6;

const quantity = (n: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(n);
const day = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
const dayTime = (d: Date) =>
  d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  });
// The standard PDF fonts only cover Latin text; drop control characters that would print as junk.
const clean = (s: string) => s.replace(/[^\P{Cc}\n\t]/gu, '');

@Injectable()
export class PickupReportPdfService {
  private readonly logger = new Logger(PickupReportPdfService.name);

  async build(data: PickupReportPdfData): Promise<Buffer> {
    const logo = await readFile(
      resolve(process.cwd(), 'assets', 'cynosure-logo.png'),
    ).catch(() => {
      this.logger.warn(
        'assets/cynosure-logo.png is missing; printing the company name instead',
      );
      return null;
    });

    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: `Inspection Report ${data.poNumber}`,
        Author: 'Cynosure Recycling Private Limited',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolveDone, reject) => {
      doc.on('end', () => resolveDone(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const contentWidth = doc.page.width - MARGIN * 2;
    const pageBottom = doc.page.height - MARGIN;
    const addPageIfNeeded = (needed: number, y: number) => {
      if (y + needed <= pageBottom) return y;
      doc.addPage();
      return MARGIN;
    };

    // ---- header ----
    if (logo) doc.image(logo, MARGIN, MARGIN, { width: 150 });
    else
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor(BRAND)
        .text('CYNOSURE RECYCLING', MARGIN, MARGIN);
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor(INK)
      .text('INSPECTION REPORT', MARGIN, MARGIN, {
        width: contentWidth,
        align: 'right',
      });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(`Ref: ${data.poNumber}`, MARGIN, MARGIN + 24, {
      width: contentWidth,
      align: 'right',
    });
    if (data.generatedAt)
      doc.text(`Date: ${day(data.generatedAt)}`, {
        width: contentWidth,
        align: 'right',
      });

    let y = MARGIN + 64;
    doc
      .moveTo(MARGIN, y)
      .lineTo(MARGIN + contentWidth, y)
      .strokeColor(RULE)
      .lineWidth(1)
      .stroke();
    y += 14;

    // ---- customer and PO details ----
    const leftWidth = 270;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text('CLIENT', MARGIN, y);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(INK)
      .text(clean(data.customer.name), MARGIN, doc.y + 2, { width: leftWidth });
    doc.font('Helvetica').fontSize(9).fillColor(INK);
    doc.text(clean(data.customer.address), MARGIN, doc.y + 2, {
      width: leftWidth,
    });
    doc.text(clean(data.customer.phone), { width: leftWidth });
    doc.text(clean(data.customer.email), { width: leftWidth });
    const leftEnd = doc.y;

    const rightX = MARGIN + 320;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text('PO NUMBER', rightX, y);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text(data.poNumber, rightX, doc.y + 2);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text('SERVICE TYPE', rightX, doc.y + 8);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text(data.serviceType, rightX, doc.y + 2);
    y = Math.max(leftEnd, doc.y) + 22;

    // ---- PO instructions ----
    if (data.poInstructions) {
      y = addPageIfNeeded(50, y);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(INK)
        .text('PO Instructions', MARGIN, y);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(INK)
        .text(clean(data.poInstructions), MARGIN, doc.y + 4, {
          width: contentWidth,
          lineGap: 2,
        });
      y = doc.y + 20;
    }

    // ---- collection details ----
    y = addPageIfNeeded(46, y);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text('COLLECTION DATE / TIME', MARGIN, y);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text(
        data.collectionDateTime ? dayTime(data.collectionDateTime) : 'Not set',
        MARGIN,
        doc.y + 2,
      );
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text('POINT OF CONTACT', rightX, y);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text(
        `${clean(data.contactName)}${data.contactPhone ? `  ·  ${clean(data.contactPhone)}` : ''}`,
        rightX,
        doc.y + 2,
        { width: contentWidth - 320 },
      );
    y = doc.y + 24;

    // ---- materials table ----
    const drawTableHeader = (top: number) => {
      doc.rect(MARGIN, top, contentWidth, 22).fill(BRAND);
      let x = MARGIN;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
      for (const col of COLUMNS) {
        doc.text(col.label, x + CELL_PAD, top + 7, {
          width: col.width - CELL_PAD * 2,
          align: col.align,
        });
        x += col.width;
      }
      return top + 22;
    };

    y = addPageIfNeeded(60, y);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text('Materials', MARGIN, y);
    y = doc.y + 8;
    y = drawTableHeader(y);
    doc.font('Helvetica').fontSize(9);
    if (data.lines.length === 0) {
      doc
        .fillColor(MUTED)
        .text('No materials recorded.', MARGIN + CELL_PAD, y + 7);
      y += 22;
    }
    data.lines.forEach((line, i) => {
      const cells = [
        String(i + 1),
        clean(line.materialName),
        line.uom,
        quantity(line.quantity),
      ];
      const materialHeight = doc.heightOfString(cells[1], {
        width: COLUMNS[1].width - CELL_PAD * 2,
      });
      const rowHeight = Math.max(22, materialHeight + 12);

      if (y + rowHeight > pageBottom - 30) {
        doc.addPage();
        y = drawTableHeader(MARGIN);
        doc.font('Helvetica').fontSize(9);
      }
      let x = MARGIN;
      doc.fillColor(INK);
      COLUMNS.forEach((col, c) => {
        doc.text(cells[c], x + CELL_PAD, y + 7, {
          width: col.width - CELL_PAD * 2,
          align: col.align,
        });
        x += col.width;
      });
      y += rowHeight;
      doc
        .moveTo(MARGIN, y)
        .lineTo(MARGIN + contentWidth, y)
        .strokeColor(RULE)
        .lineWidth(0.5)
        .stroke();
    });
    y += 16;

    // ---- inspection photos ----
    if (data.photos.length > 0) {
      y = addPageIfNeeded(140, y);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(INK)
        .text('Inspection Photos', MARGIN, y);
      y = doc.y + 8;

      const cols = 3;
      const gap = 10;
      const cellW = (contentWidth - gap * (cols - 1)) / cols;
      const imageH = cellW * 0.72;
      const captionH = 26;
      const cellH = imageH + captionH;
      data.photos.forEach((photo, i) => {
        const col = i % cols;
        if (col === 0) y = addPageIfNeeded(cellH + gap, y);
        const x = MARGIN + col * (cellW + gap);
        try {
          doc.image(photo.buffer, x, y, {
            fit: [cellW, imageH],
            align: 'center',
            valign: 'center',
          });
        } catch (err) {
          this.logger.warn(
            `Could not place an inspection photo: ${(err as Error).message}`,
          );
        }
        doc
          .rect(x, y, cellW, imageH)
          .strokeColor(RULE)
          .lineWidth(0.75)
          .stroke();
        if (photo.caption) {
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor(INK)
            .text(clean(photo.caption), x, y + imageH + 4, {
              width: cellW,
              height: captionH - 4,
              ellipsis: true,
            });
        }
        if (col === cols - 1 || i === data.photos.length - 1) y += cellH + gap;
      });
    }

    // ---- page footers ----
    const { start, count } = doc.bufferedPageRange();
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `Cynosure Recycling Private Limited  |  Page ${i - start + 1} of ${count}`,
          MARGIN,
          doc.page.height - 30,
          { width: contentWidth, align: 'center' },
        );
    }

    doc.end();
    return finished;
  }
}
