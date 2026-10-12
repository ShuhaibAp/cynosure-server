import {
  fmtDay,
  fmtKg,
  fmtMoney,
  fmtQty,
  ReportPdf,
} from '../common/pdf/report-pdf.js';

export interface ReportLine {
  materialName: string;
  uom: string;
  inspected: number;
  actual: number | null;
  processed: number | null;
  remarks: string;
}

export interface ExpenseRow {
  description: string;
  amount: number;
}

export interface ReportData {
  poNumber: string;
  serviceType: string;
  customer: { name: string; address: string; phone: string; email: string };
  generatedAt: Date;
  destructionDate: Date | null;
  lines: ReportLine[];
  signature: Buffer | null;
  weights: {
    operationsNetKg: number | null;
    factoryNetKg: number | null;
    outputKg: number | null;
    residueKg: number | null;
  };
  check: {
    result: 'Pass' | 'Fail';
    differenceKg: number | null;
    toleranceKg: number;
    remarks: string;
  } | null;
  inspectionExpense: number | null;
  collectionExpenses: ExpenseRow[];
  logisticsExpenses: ExpenseRow[];
}

const total = (rows: ExpenseRow[]) => rows.reduce((s, r) => s + r.amount, 0);

/** Certificate of Destruction (FR-10.03). */
export function drawCod(pdf: ReportPdf, d: ReportData) {
  pdf.begin('Certificate of Destruction', d.poNumber, d.generatedAt);
  pdf.paragraph(
    'This is to certify that the e-waste material listed below, received from the client named here, has been processed and destroyed in accordance with applicable e-waste management practice.',
  );
  pdf.heading('Client');
  pdf.facts([
    ['Customer name', d.customer.name],
    ['PO number', d.poNumber],
    ['Address', d.customer.address],
    ['Date of destruction', fmtDay(d.destructionDate)],
  ]);
  pdf.heading('Material destroyed');
  pdf.table(
    [
      { label: '#', width: 28 },
      { label: 'Material', width: 290 },
      { label: 'UoM', width: 90 },
      { label: 'Quantity destroyed', width: 120, align: 'right' },
    ],
    d.lines.map((l, i) => [
      String(i + 1),
      l.materialName,
      l.uom,
      fmtQty(l.processed),
    ]),
    'No materials were recorded.',
  );
  pdf.signature('Authorised signatory', d.signature);
}

/** Sustainability Report (FR-10.04). */
export function drawSustainability(pdf: ReportPdf, d: ReportData) {
  pdf.begin('Sustainability Report', d.poNumber, d.generatedAt);
  pdf.facts([
    ['Customer name', d.customer.name],
    ['PO number', d.poNumber],
    ['Service type', d.serviceType],
    ['Processed on', fmtDay(d.destructionDate)],
  ]);

  pdf.heading('Weight recycled');
  pdf.facts([
    [
      'Inbound weight',
      fmtKg(d.weights.factoryNetKg ?? d.weights.operationsNetKg),
    ],
    ['Recycled output', fmtKg(d.weights.outputKg)],
    ['Residue', fmtKg(d.weights.residueKg)],
  ]);

  pdf.heading('Material types processed');
  pdf.table(
    [
      { label: 'Material', width: 320 },
      { label: 'UoM', width: 90 },
      { label: 'Quantity processed', width: 120, align: 'right' },
    ],
    d.lines.map((l) => [l.materialName, l.uom, fmtQty(l.processed)]),
    'No materials were recorded.',
  );

  pdf.heading('EPR compliance');
  pdf.paragraph(
    d.serviceType === 'EPR'
      ? 'This order was processed under the EPR service type.'
      : `This order was processed under the "${d.serviceType}" service type.`,
  );
  pdf.paragraph(
    'Environmental impact metrics and detailed EPR compliance figures will appear here once the client confirms which measures they require.',
    { muted: true },
  );
}

/** Mass Flow Report (FR-10.05, FR-12.03). */
export function drawMassFlow(pdf: ReportPdf, d: ReportData) {
  pdf.begin('Mass Flow Report', d.poNumber, d.generatedAt);
  pdf.facts([
    ['Customer name', d.customer.name],
    ['PO number', d.poNumber],
  ]);

  const inbound = d.weights.factoryNetKg ?? d.weights.operationsNetKg;
  const accounted =
    d.weights.outputKg !== null || d.weights.residueKg !== null
      ? (d.weights.outputKg ?? 0) + (d.weights.residueKg ?? 0)
      : null;
  pdf.heading('Weights');
  pdf.facts([
    ['Inbound at pickup (Operations)', fmtKg(d.weights.operationsNetKg)],
    ['Inbound at Factory', fmtKg(d.weights.factoryNetKg)],
    ['Recycled output', fmtKg(d.weights.outputKg)],
    ['Residue', fmtKg(d.weights.residueKg)],
    [
      'Unaccounted',
      inbound !== null && accounted !== null
        ? fmtKg(Math.round((inbound - accounted) * 100) / 100)
        : '—',
    ],
  ]);

  pdf.heading('Processed quantities');
  pdf.table(
    [
      { label: 'Material', width: 200 },
      { label: 'UoM', width: 60 },
      { label: 'Inspected', width: 80, align: 'right' },
      { label: 'Actual', width: 80, align: 'right' },
      { label: 'Processed', width: 80, align: 'right' },
    ],
    d.lines.map((l) => [
      l.materialName,
      l.uom,
      fmtQty(l.inspected),
      fmtQty(l.actual),
      fmtQty(l.processed),
    ]),
    'No materials were recorded.',
  );

  pdf.heading('Expenses');
  pdf.facts([
    [
      'Inspection expense (Module 2)',
      d.inspectionExpense === null ? '—' : fmtMoney(d.inspectionExpense),
    ],
    ['Collection expenses total', fmtMoney(total(d.collectionExpenses))],
    ['Logistics expenses total', fmtMoney(total(d.logisticsExpenses))],
  ]);
  pdf.paragraph('Collection expenses', { size: 9 });
  pdf.table(
    [
      { label: 'Description', width: 360 },
      { label: 'Amount', width: 130, align: 'right' },
    ],
    d.collectionExpenses.map((e) => [e.description, fmtMoney(e.amount)]),
    'No collection expenses recorded.',
  );
  pdf.paragraph('Logistics expenses', { size: 9 });
  pdf.table(
    [
      { label: 'Description', width: 360 },
      { label: 'Amount', width: 130, align: 'right' },
    ],
    d.logisticsExpenses.map((e) => [e.description, fmtMoney(e.amount)]),
    'No logistics expenses recorded.',
  );

  pdf.heading('Discrepancy notes');
  const notes: string[] = [];
  if (d.check) {
    notes.push(
      d.check.result === 'Pass'
        ? `Weighment cross-check passed (difference ${fmtKg(d.check.differenceKg)}, tolerance ±${d.check.toleranceKg} kg).`
        : `Weighment cross-check failed (difference ${fmtKg(d.check.differenceKg)}, tolerance ±${d.check.toleranceKg} kg). Explanation: ${d.check.remarks || '—'}`,
    );
  }
  for (const l of d.lines) {
    const reference = l.actual ?? l.inspected;
    if (l.processed !== null && l.processed !== reference) {
      notes.push(
        `${l.materialName}: processed ${fmtQty(l.processed)} ${l.uom} against ${fmtQty(reference)} received${l.remarks ? ` — ${l.remarks}` : ''}.`,
      );
    }
  }
  if (notes.length === 0) pdf.paragraph('None.', { muted: true });
  for (const n of notes) pdf.paragraph(`• ${n}`, { size: 9 });
}
