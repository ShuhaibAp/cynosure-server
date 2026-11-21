import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import PDFDocument from 'pdfkit';

export interface QuotationPdfData {
  poNumber: string;
  serviceType: string;
  version: number;
  approvedAt: Date | null;
  customer: { name: string; address: string; phone: string; email: string };
  lines: Array<{
    materialName: string;
    uom: string;
    quantity: number;
    unitPrice: number | null;
    lineTotal: number | null;
  }>;
  subtotal: number;
  gstPercent: number | null;
  gstAmount: number;
  grandTotal: number;
  terms: string;
  signature: Buffer | null;
}

const MARGIN = 48;
const BRAND = '#B44B14';
const INK = '#1F2020';
const MUTED = '#62615D';
const RULE = '#E2E0DC';
const COLUMNS = [
  { key: 'no', label: '#', width: 28, align: 'left' },
  { key: 'material', label: 'Material', width: 190, align: 'left' },
  { key: 'uom', label: 'UoM', width: 66, align: 'left' },
  { key: 'qty', label: 'Quantity', width: 66, align: 'right' },
  { key: 'price', label: 'Unit Price (INR)', width: 74, align: 'right' },
  { key: 'amount', label: 'Amount (INR)', width: 75, align: 'right' },
] as const;
const CELL_PAD = 6;

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
const quantity = (n: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(n);
const day = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
// The standard PDF fonts only cover Latin text; drop control characters that would print as junk.
const clean = (s: string) => s.replace(/[^\P{Cc}\n\t]/gu, '');

@Injectable()
export class QuotationPdfService {
  private readonly logger = new Logger(QuotationPdfService.name);

  async build(data: QuotationPdfData): Promise<Buffer> {
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
        Title: `Quotation ${data.poNumber} v${data.version}`,
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
      .fontSize(20)
      .fillColor(INK)
      .text('QUOTATION', MARGIN, MARGIN, {
        width: contentWidth,
        align: 'right',
      });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(`Ref: ${data.poNumber} / v${data.version}`, MARGIN, MARGIN + 26, {
      width: contentWidth,
      align: 'right',
    });
    if (data.approvedAt)
      doc.text(`Date: ${day(data.approvedAt)}`, {
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
      .text('PREPARED FOR', MARGIN, y);
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

    // ---- items table ----
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

    y = drawTableHeader(y);
    doc.font('Helvetica').fontSize(9);
    data.lines.forEach((line, i) => {
      const cells = [
        String(i + 1),
        clean(line.materialName),
        line.uom,
        quantity(line.quantity),
        line.unitPrice === null ? '-' : money(line.unitPrice),
        line.lineTotal === null ? '-' : money(line.lineTotal),
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

    // ---- totals (subtotal and GST only when GST applies) ----
    const totals: Array<{ label: string; amount: number; bold: boolean }> =
      data.gstPercent === null
        ? [{ label: 'Grand Total (INR)', amount: data.grandTotal, bold: true }]
        : [
            { label: 'Subtotal (INR)', amount: data.subtotal, bold: false },
            {
              label: `GST @ ${data.gstPercent}% (INR)`,
              amount: data.gstAmount,
              bold: false,
            },
            { label: 'Grand Total (INR)', amount: data.grandTotal, bold: true },
          ];
    if (y + 20 + totals.length * 18 > pageBottom) {
      doc.addPage();
      y = MARGIN;
    }
    y += 8;
    for (const row of totals) {
      doc
        .font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(row.bold ? 10 : 9)
        .fillColor(INK);
      doc.text(row.label, MARGIN, y, {
        width: contentWidth - COLUMNS[5].width,
        align: 'right',
      });
      doc.text(
        money(row.amount),
        MARGIN + contentWidth - COLUMNS[5].width + CELL_PAD,
        y,
        { width: COLUMNS[5].width - CELL_PAD * 2, align: 'right' },
      );
      y += 18;
    }
    y += 12;

    // ---- terms ----
    if (data.terms) {
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(INK)
        .text('Additional Terms & Conditions', MARGIN, y);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(INK)
        .text(clean(data.terms), MARGIN, doc.y + 4, {
          width: contentWidth,
          lineGap: 2,
        });
      y = doc.y + 24;
    }

    // ---- signature ----
    if (y + 110 > pageBottom) {
      doc.addPage();
      y = MARGIN;
    }
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text('For Cynosure Recycling Private Limited', MARGIN, y);
    if (data.signature) {
      try {
        doc.image(data.signature, MARGIN, y + 16, { fit: [180, 56] });
      } catch (err) {
        this.logger.warn(
          `Could not place the signature image: ${(err as Error).message}`,
        );
      }
    }
    doc
      .moveTo(MARGIN, y + 80)
      .lineTo(MARGIN + 180, y + 80)
      .strokeColor(MUTED)
      .lineWidth(0.75)
      .stroke();
    doc
      .fontSize(9)
      .fillColor(MUTED)
      .text('Authorised Signatory', MARGIN, y + 85);

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
