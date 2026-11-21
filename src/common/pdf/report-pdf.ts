import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import PDFDocument from 'pdfkit';

const MARGIN = 48;
const BRAND = '#B44B14';
const INK = '#1F2020';
const MUTED = '#62615D';
const RULE = '#E2E0DC';
const SOFT = '#F6F5F3';
const CELL_PAD = 6;

export const fmtQty = (n: number | null | undefined) =>
  n === null || n === undefined
    ? '—'
    : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(n);
export const fmtKg = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${fmtQty(n)} kg`;
export const fmtMoney = (n: number) =>
  `INR ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
export const fmtDay = (d: Date | null | undefined) =>
  d
    ? d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      })
    : '—';
// The standard PDF fonts only cover Latin text; drop control characters that would print as junk.
export const clean = (s: string) => s.replace(/[^\P{Cc}\n\t]/gu, '');

export interface PdfColumn {
  label: string;
  width: number;
  align?: 'left' | 'right';
}

/**
 * A small page-layout helper for the system's generated documents (AOR and the final reports).
 * Several documents can be drawn into one file (the Full Set): each `begin()` after the first
 * starts a new page with its own header.
 */
export class ReportPdf {
  readonly doc: InstanceType<typeof PDFDocument>;
  private chunks: Buffer[] = [];
  private done: Promise<Buffer>;
  private y = MARGIN;
  private started = false;

  private constructor(
    private logo: Buffer | null,
    title: string,
  ) {
    this.doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: { Title: title, Author: 'Cynosure Recycling Private Limited' },
    });
    this.doc.on('data', (c: Buffer) => this.chunks.push(c));
    this.done = new Promise<Buffer>((ok, fail) => {
      this.doc.on('end', () => ok(Buffer.concat(this.chunks)));
      this.doc.on('error', fail);
    });
  }

  static async create(title: string) {
    const logo = await readFile(
      resolve(process.cwd(), 'assets', 'cynosure-logo.png'),
    ).catch(() => null);
    return new ReportPdf(logo, title);
  }

  private get width() {
    return this.doc.page.width - MARGIN * 2;
  }

  private ensure(needed: number) {
    if (this.y + needed <= this.doc.page.height - MARGIN - 24) return;
    this.doc.addPage();
    this.y = MARGIN;
  }

  /** Starts a document: header with logo, title and reference. */
  begin(title: string, ref: string, date: Date | null) {
    if (this.started) this.doc.addPage();
    this.started = true;
    const { doc } = this;
    if (this.logo) doc.image(this.logo, MARGIN, MARGIN, { width: 150 });
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
      .text(title.toUpperCase(), MARGIN, MARGIN, {
        width: this.width,
        align: 'right',
      });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(`Ref: ${ref}`, MARGIN, MARGIN + 24, {
      width: this.width,
      align: 'right',
    });
    if (date)
      doc.text(`Date: ${fmtDay(date)}`, { width: this.width, align: 'right' });
    this.y = MARGIN + 64;
    doc
      .moveTo(MARGIN, this.y)
      .lineTo(MARGIN + this.width, this.y)
      .strokeColor(RULE)
      .lineWidth(1)
      .stroke();
    this.y += 16;
  }

  heading(text: string) {
    this.ensure(40);
    this.doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(BRAND)
      .text(text.toUpperCase(), MARGIN, this.y, { width: this.width });
    this.y = this.doc.y + 6;
  }

  paragraph(text: string, opts: { muted?: boolean; size?: number } = {}) {
    const size = opts.size ?? 10;
    this.doc.font('Helvetica').fontSize(size);
    const h = this.doc.heightOfString(clean(text), { width: this.width });
    this.ensure(h + 8);
    this.doc
      .fillColor(opts.muted ? MUTED : INK)
      .text(clean(text), MARGIN, this.y, { width: this.width });
    this.y = this.doc.y + 8;
  }

  /** Label / value pairs in a two-column grid. */
  facts(rows: Array<[string, string]>) {
    const colWidth = this.width / 2 - 8;
    for (let i = 0; i < rows.length; i += 2) {
      const pair = rows.slice(i, i + 2);
      this.doc.font('Helvetica-Bold').fontSize(10);
      const heights = pair.map(([, v]) =>
        this.doc.heightOfString(clean(v) || '—', { width: colWidth }),
      );
      const h = Math.max(...heights) + 16;
      this.ensure(h);
      pair.forEach(([label, value], j) => {
        const x = MARGIN + j * (colWidth + 16);
        this.doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(MUTED)
          .text(label.toUpperCase(), x, this.y, { width: colWidth });
        this.doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor(INK)
          .text(clean(value) || '—', x, this.y + 11, { width: colWidth });
      });
      this.y += h + 4;
    }
    this.y += 4;
  }

  table(columns: PdfColumn[], rows: string[][], emptyText = 'None recorded.') {
    const { doc } = this;
    const total = columns.reduce((s, c) => s + c.width, 0);
    const scale = this.width / total;
    const widths = columns.map((c) => c.width * scale);

    const drawHeader = () => {
      this.ensure(30);
      doc.rect(MARGIN, this.y, this.width, 22).fill(SOFT);
      let x = MARGIN;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK);
      columns.forEach((c, i) => {
        doc.text(c.label, x + CELL_PAD, this.y + 7, {
          width: widths[i] - CELL_PAD * 2,
          align: c.align ?? 'left',
        });
        x += widths[i];
      });
      this.y += 22;
    };

    drawHeader();
    if (rows.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED);
      doc.text(emptyText, MARGIN + CELL_PAD, this.y + 8, { width: this.width });
      this.y += 30;
      return;
    }
    for (const row of rows) {
      doc.font('Helvetica').fontSize(9);
      const heights = row.map((cell, i) =>
        doc.heightOfString(clean(cell), {
          width: widths[i] - CELL_PAD * 2,
        }),
      );
      const h = Math.max(...heights) + CELL_PAD * 2;
      if (this.y + h > doc.page.height - MARGIN - 24) {
        doc.addPage();
        this.y = MARGIN;
        drawHeader();
      }
      let x = MARGIN;
      doc.fillColor(INK);
      row.forEach((cell, i) => {
        doc.text(clean(cell), x + CELL_PAD, this.y + CELL_PAD, {
          width: widths[i] - CELL_PAD * 2,
          align: columns[i].align ?? 'left',
        });
        x += widths[i];
      });
      this.y += h;
      doc
        .moveTo(MARGIN, this.y)
        .lineTo(MARGIN + this.width, this.y)
        .strokeColor(RULE)
        .lineWidth(0.5)
        .stroke();
    }
    this.y += 12;
  }

  /** A signature line, with the signature image above it when there is one. */
  signature(label: string, image: Buffer | null) {
    this.ensure(110);
    const x = MARGIN;
    if (image) {
      try {
        this.doc.image(image, x, this.y, { fit: [180, 60] });
      } catch {
        // An unreadable image just leaves the line blank.
      }
    }
    const lineY = this.y + 66;
    this.doc
      .moveTo(x, lineY)
      .lineTo(x + 200, lineY)
      .strokeColor(INK)
      .lineWidth(0.8)
      .stroke();
    this.doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(label, x, lineY + 4, { width: 220 });
    this.y = lineY + 28;
  }

  async finish(): Promise<Buffer> {
    const range = this.doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      this.doc.switchToPage(range.start + i);
      // The footer sits inside the bottom margin; without this PDFKit would add a blank page
      // for text drawn below the margin.
      this.doc.page.margins.bottom = 0;
      this.doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `Cynosure Recycling Private Limited  ·  Page ${i + 1} of ${range.count}`,
          MARGIN,
          this.doc.page.height - MARGIN + 6,
          { width: this.width, align: 'center', lineBreak: false },
        );
    }
    this.doc.end();
    return this.done;
  }
}

/** Adds `days` working days (Monday to Friday) to a date. */
export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}
