import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';
import { Uom } from '../../common/enums/inspection.enum.js';
import { MAX_LINES, MAX_QUANTITY, MAX_TEXT } from './inspection.constants.js';

export type Column = 'materialName' | 'uom' | 'clientQuantity';

/**
 * Accepted column headers, compared ignoring case, spaces and punctuation. Used only to
 * SUGGEST a mapping - the BD user always confirms (or fixes) it in the column-mapping step,
 * so a file with unrecognised, missing or reordered headers still works.
 */
const HEADER_ALIASES: Record<Column, string[]> = {
  materialName: ['materialname', 'material', 'itemname', 'item', 'description'],
  uom: ['uom', 'unitofmeasure', 'unit'],
  clientQuantity: ['clientquantity', 'clientqty', 'quantity', 'qty'],
};

export const COLUMN_LABELS: Record<Column, string> = {
  materialName: 'Material Name',
  uom: 'UoM',
  clientQuantity: 'Client Quantity',
};

const UOM_ALIASES: Record<string, Uom> = {
  lot: Uom.Lots,
  lots: Uom.Lots,
  no: Uom.Numbers,
  nos: Uom.Numbers,
  number: Uom.Numbers,
  numbers: Uom.Numbers,
  kg: Uom.Kilograms,
  kgs: Uom.Kilograms,
  kilogram: Uom.Kilograms,
  kilograms: Uom.Kilograms,
};

const HEADER_SEARCH_ROWS = 10;
/** How many rows of the file go back to the browser for the mapping preview. */
export const PREVIEW_ROWS = 12;
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export interface ParsedRow {
  materialName: string;
  uom: Uom;
  clientQuantity: number;
}

export interface SkippedRow {
  row: number;
  reason: string;
}

export interface ParsedList {
  rows: ParsedRow[];
  skipped: SkippedRow[];
}

/** -1 means "no header row" (data starts at the very first row); otherwise an index into the matrix. */
export interface ColumnGuess {
  headerRow: number;
  columns: Record<Column, number | null>;
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function cellText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

async function readXlsx(buffer: Buffer): Promise<unknown[][]> {
  if (buffer.length < 4 || !buffer.subarray(0, 4).equals(ZIP_SIGNATURE)) {
    throw new BadRequestException('The file is not a valid .xlsx spreadsheet.');
  }
  try {
    return await readSheet(buffer);
  } catch {
    throw new BadRequestException(
      'The spreadsheet could not be read. Make sure it is a valid .xlsx file.',
    );
  }
}

function readCsv(buffer: Buffer): unknown[][] {
  if (buffer.subarray(0, 8192).includes(0)) {
    throw new BadRequestException(
      'The file is not a valid CSV (it looks like a binary file).',
    );
  }
  try {
    return parse(buffer, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      delimiter: sniffDelimiter(buffer),
    });
  } catch {
    throw new BadRequestException('The CSV file could not be read.');
  }
}

/**
 * Excel's "Save As CSV" (and similar exports) can produce a tab- or semicolon-delimited file
 * while keeping the .csv extension, depending on the system's regional settings - a real file
 * from a real user, not a malformed one. Pick whichever delimiter appears most consistently
 * across the first few lines rather than assuming comma.
 */
function sniffDelimiter(buffer: Buffer): string {
  const sample = buffer
    .subarray(0, 4096)
    .toString('utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 5);
  const candidates = [',', '\t', ';'];
  let best = ',';
  let bestScore = 0;
  for (const d of candidates) {
    const counts = sample.map((line) => line.split(d).length - 1);
    if (counts.length === 0 || counts.some((c) => c === 0)) continue;
    const score = Math.min(...counts);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Reads an uploaded .xlsx or .csv file into a raw grid of cell values. */
export async function readMatrix(
  buffer: Buffer,
  fileName: string,
): Promise<unknown[][]> {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext !== 'xlsx' && ext !== 'csv') {
    throw new BadRequestException('Only .xlsx or .csv files can be uploaded.');
  }
  const matrix = ext === 'xlsx' ? await readXlsx(buffer) : readCsv(buffer);
  if (matrix.every((row) => row.every((c) => !cellText(c))))
    throw new BadRequestException('That file is empty.');
  return matrix;
}

/**
 * Best-effort, never-throwing guess at which row holds headers and which column is which
 * (by matching HEADER_ALIASES). Always returns something so the mapping step can pre-fill
 * itself - the BD user reviews and corrects it, so a wrong or absent guess just means an
 * empty/default dropdown, never an error.
 */
export function guessColumns(matrix: unknown[][]): ColumnGuess {
  let best: {
    row: number;
    columns: Record<Column, number>;
    score: number;
  } | null = null;

  for (let r = 0; r < Math.min(matrix.length, HEADER_SEARCH_ROWS); r++) {
    const cells = matrix[r].map((c) => normalise(cellText(c)));
    const find = (column: Column) =>
      cells.findIndex((c) => HEADER_ALIASES[column].includes(c));
    const columns = {
      materialName: find('materialName'),
      uom: find('uom'),
      clientQuantity: find('clientQuantity'),
    };
    const score = Object.values(columns).filter((c) => c !== -1).length;
    if (score > 0 && (!best || score > best.score))
      best = { row: r, columns, score };
  }

  if (!best)
    return {
      headerRow: -1,
      columns: { materialName: null, uom: null, clientQuantity: null },
    };
  return {
    headerRow: best.row,
    columns: {
      materialName:
        best.columns.materialName === -1 ? null : best.columns.materialName,
      uom: best.columns.uom === -1 ? null : best.columns.uom,
      clientQuantity:
        best.columns.clientQuantity === -1 ? null : best.columns.clientQuantity,
    },
  };
}

/** A preview payload for the column-mapping screen: a slice of the file plus a suggested mapping. */
export interface ListPreview {
  matrix: string[][];
  totalRows: number;
  truncated: boolean;
  suggested: ColumnGuess;
}

export function previewList(matrix: unknown[][]): ListPreview {
  return {
    matrix: matrix.slice(0, PREVIEW_ROWS).map((row) => row.map(cellText)),
    totalRows: matrix.length,
    truncated: matrix.length > PREVIEW_ROWS,
    suggested: guessColumns(matrix),
  };
}

function parseQuantity(raw: unknown): { value?: number; error?: string } {
  const text = cellText(raw).replace(/[,\s]/g, '');
  if (text === '') return { error: 'Client Quantity is missing' };
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0)
    return {
      error: `Client Quantity "${cellText(raw)}" is not a valid non-negative number`,
    };
  if (n > MAX_QUANTITY) return { error: 'Client Quantity is too large' };
  return { value: Math.round(n * 1000) / 1000 };
}

/**
 * Builds rows from an EXPLICIT column mapping the BD user confirmed - no alias guessing here.
 * `headerRow: -1` means the file has no header row and data starts at row 0. A `null` column
 * means that field simply was not mapped to anything, so every row reports it missing (the
 * same message a genuinely blank cell would produce) rather than throwing.
 */
export function extractRows(
  matrix: unknown[][],
  headerRow: number,
  columns: Record<Column, number | null>,
): ParsedList {
  const dataRows = matrix.slice(headerRow + 1);
  const rows: ParsedRow[] = [];
  const skipped: SkippedRow[] = [];
  let nonEmpty = 0;

  const at = (cells: unknown[], col: number | null) =>
    col === null ? '' : cellText(cells[col]);

  dataRows.forEach((cells, i) => {
    const material = at(cells, columns.materialName);
    const unit = at(cells, columns.uom);
    const quantityRaw =
      columns.clientQuantity === null
        ? undefined
        : cells[columns.clientQuantity];
    const quantity = at(cells, columns.clientQuantity);
    if (!material && !unit && !quantity) return;

    nonEmpty++;
    if (nonEmpty > MAX_LINES) {
      throw new BadRequestException(
        `The file has more than ${MAX_LINES} rows. Split it into smaller files.`,
      );
    }

    const row = headerRow + 2 + i;
    const uom = UOM_ALIASES[normalise(unit)];
    const qty = parseQuantity(quantityRaw);
    const reason =
      (!material && 'Material Name is missing') ||
      (material.length > MAX_TEXT &&
        `Material Name is longer than ${MAX_TEXT} characters`) ||
      (!uom &&
        (unit
          ? `Unit "${unit}" is not recognised (use Lots, Numbers or Kilograms)`
          : 'UoM is missing')) ||
      qty.error;

    if (reason) skipped.push({ row, reason });
    else rows.push({ materialName: material, uom, clientQuantity: qty.value! });
  });

  if (nonEmpty === 0)
    throw new BadRequestException(
      'No data rows were found below the selected header row.',
    );
  return { rows, skipped };
}
