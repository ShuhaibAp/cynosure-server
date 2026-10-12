import { fmtDay, fmtKg, fmtQty, ReportPdf } from '../common/pdf/report-pdf.js';

export interface AorData {
  poNumber: string;
  serviceType: string;
  customer: { name: string; address: string; phone: string; email: string };
  collectionDate: Date | null;
  generatedAt: Date;
  dueAt: Date;
  lines: Array<{ materialName: string; uom: string; actual: number | null }>;
  references: Array<[string, string]>;
  netWeightKg: number | null;
}

/** Draws the Acknowledgement of Receipt into a (possibly shared) report file. */
export function drawAor(pdf: ReportPdf, d: AorData) {
  pdf.begin('Acknowledgement of Receipt', d.poNumber, d.generatedAt);
  pdf.paragraph(
    'Cynosure Recycling Private Limited acknowledges receipt of the e-waste material listed below, collected from the client for processing.',
  );

  pdf.heading('Client');
  pdf.facts([
    ['Name', d.customer.name],
    ['Phone', d.customer.phone],
    ['Address', d.customer.address],
    ['Email', d.customer.email],
  ]);

  pdf.heading('Order');
  pdf.facts([
    ['PO number', d.poNumber],
    ['Service type', d.serviceType],
    ['Collection date', fmtDay(d.collectionDate)],
    ['Net weight received', fmtKg(d.netWeightKg)],
  ]);

  pdf.heading('Material received');
  pdf.table(
    [
      { label: '#', width: 28 },
      { label: 'Material', width: 300 },
      { label: 'UoM', width: 90 },
      { label: 'Actual Quantity', width: 110, align: 'right' },
    ],
    d.lines.map((l, i) => [
      String(i + 1),
      l.materialName,
      l.uom,
      fmtQty(l.actual),
    ]),
    'No materials were recorded.',
  );

  pdf.heading('Document references');
  pdf.facts(d.references);
}
